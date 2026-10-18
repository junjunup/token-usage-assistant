// Menu-bar icon (T7.5, macOS only): show the status from menubar-status.cjs on the tray icon.
// - Drawn on a canvas in a hidden, sandboxed renderer (option a, T7.3) and set as a 2x image; redrawn only when the
//   content (or, for alert colours, the system appearance) changes. No animation.
// - Normal states use template images (macOS tints them); amber / red use the app's colour tokens.
// - No accounts or a failed or stuck render (5 s timeout, T7.12): the static logo, retried later. The tooltip and menus are handled by main.cjs as before.
// - The system hides status items that do not fit next to the notch, silently. We detect it with CGWindowList
//   (no screen-recording permission needed) and only report it; the form is never switched automatically.
const path = require('node:path');
const { execFile } = require('node:child_process');
const { BrowserWindow, nativeImage, nativeTheme, screen } = require('electron');
const { menubarStatus } = require('./menubar-status.cjs');
const { log } = require('./logger.cjs');

const RENDER_TIMEOUT = 5000;
const RETRY_AFTER = 30000;
const RETRY_MAX = 600000;

/** Reject after `ms` so a renderer that never answers cannot block every later redraw (T7.12). */
function within(promise, ms) {
  let timer;
  const expire = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), ms);
    timer.unref?.();
  });
  return Promise.race([promise, expire]).finally(() => clearTimeout(timer));
}

// Lists this process's status-item windows (layer 25) with their on-screen flag.
const ONSCREEN_JXA =
  'ObjC.import("CoreGraphics");const l=ObjC.castRefToObject($.CGWindowListCopyWindowInfo($.kCGWindowListOptionAll,0));' +
  'JSON.stringify(l.js.map(w=>ObjC.deepUnwrap(w)).filter(d=>d.kCGWindowLayer===25).map(d=>({pid:d.kCGWindowOwnerPID,' +
  'x:d.kCGWindowBounds.X,w:d.kCGWindowBounds.Width,on:!!d.kCGWindowIsOnscreen})))';

/**
 * What the renderer draws, or null for the static logo.
 * @param {import('./menubar-status.cjs').MenubarStatus|null} status
 * @param {{ form?: 'ring'|'value'|'two', dark: boolean, alertColor?: boolean }} options alertColor false (T7.7
 *   setting off) keeps every state monochrome.
 */
function iconModel(status, { form = 'value', dark, alertColor = true }) {
  if (!status) return null;
  const template = !alertColor || (status.tone === 'normal' && status.lines.every((l) => l.tone === 'normal'));
  return {
    form,
    ratio: status.ring,
    text: status.text,
    tone: status.tone,
    lines: status.lines,
    template,
    // Template images ignore the appearance; only alert colours depend on it.
    dark: template ? false : !!dark,
  };
}

/**
 * Whether our status item is on screen: true / false, or null when it cannot be found.
 * @param {any} list parsed ONSCREEN_JXA output
 * @param {number} pid
 * @param {{ x: number, width: number }} bounds tray.getBounds()
 */
function onscreenFor(list, pid, bounds) {
  if (!Array.isArray(list) || !bounds) return null;
  const mine = list.filter(
    (w) => w && w.pid === pid && Math.abs(w.x - bounds.x) <= 2 && Math.abs(w.w - bounds.width) <= 2,
  );
  return mine.length ? mine.some((w) => w.on === true) : null;
}

/**
 * Bounding-box centre of the ring (the left RING points) in a BGRA bitmap, in pixels. Used by the native smoke to
 * check the drawn ring against the brand mark's centre.
 * @param {Buffer} bitmap
 * @param {number} width pixels
 * @param {number} height pixels
 * @param {number} ringWidth pixels
 */
function ringCentre(bitmap, width, height, ringWidth) {
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < Math.min(ringWidth, width); x++)
      if (bitmap[(y * width + x) * 4 + 3] > 32) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
  return minX === Infinity ? null : { x: (minX + maxX + 1) / 2, y: (minY + maxY + 1) / 2 };
}

class MenubarIcon {
  /**
   * @param {{ tray: any, staticImage: any, form?: 'ring'|'value'|'two', onHidden?: (hidden: boolean|null) => void,
   *   timeoutMs?: number, retryMs?: number }} o
   */
  constructor({
    tray,
    staticImage,
    form = 'value',
    onHidden = () => {},
    timeoutMs = RENDER_TIMEOUT,
    retryMs = RETRY_AFTER,
  }) {
    Object.assign(this, { tray, staticImage, form, onHidden, timeoutMs, retryMs });
    this.failures = 0;
    this.status = null;
    this.key = undefined;
    this.mode = 'static';
    this.hidden = null;
    this.image = null;
    this.window = null;
    this.settled = Promise.resolve();
    this.disposed = false;
    this.redraw = () => this.apply();
    this.recheck = () => this.scheduleCheck(800);
    nativeTheme.on('updated', this.redraw);
    for (const event of ['display-added', 'display-removed', 'display-metrics-changed']) screen.on(event, this.recheck);
  }
  /** @param {any[]} summaries AccountManager.summaries() @param {{ threshold: number }} settings */
  // T7.7 settings: menubarForm, menubarUsage (off = static logo), menubarAlertColor (off = monochrome).
  update(summaries, settings) {
    this.status = menubarStatus(summaries, settings);
    this.form = ['ring', 'value', 'two'].includes(settings?.menubarForm) ? settings.menubarForm : 'value';
    this.usage = settings?.menubarUsage !== false;
    this.alertColor = settings?.menubarAlertColor !== false;
    return this.apply();
  }
  apply() {
    if (this.disposed) return this.settled;
    const model =
      this.usage === false
        ? null
        : iconModel(this.status, {
            form: this.form,
            dark: nativeTheme.shouldUseDarkColors,
            alertColor: this.alertColor,
          });
    const key = JSON.stringify(model);
    if (key === this.key) return this.settled;
    this.key = key;
    this.settled = this.settled.then(() => this.draw(model, key));
    return this.settled;
  }
  async renderer() {
    if (this.window && !this.window.isDestroyed()) return this.window;
    const win = new BrowserWindow({
      show: false,
      width: 160,
      height: 40,
      skipTaskbar: true,
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, spellcheck: false },
    });
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (e) => e.preventDefault());
    win.webContents.on('will-attach-webview', (e) => e.preventDefault());
    try {
      await within(win.loadFile(path.join(__dirname, 'menubar-render', 'render.html')), this.timeoutMs);
    } catch (error) {
      if (!win.isDestroyed()) win.destroy();
      throw error;
    }
    this.window = win;
    return win;
  }
  /** @param {ReturnType<typeof iconModel>} model @param {string} key */
  async draw(model, key) {
    if (this.disposed || key !== this.key) return;
    if (!model) return this.useStatic();
    try {
      const started = Date.now();
      const win = await this.renderer();
      const out = await within(
        win.webContents.executeJavaScript('render(' + JSON.stringify(model) + ')'),
        this.timeoutMs,
      );
      if (this.disposed || key !== this.key) return;
      const image = nativeImage.createEmpty();
      image.addRepresentation({ scaleFactor: 2, dataURL: out.dataURL });
      image.setTemplateImage(model.template);
      this.tray.setImage(image);
      this.tray.setTitle('');
      this.image = image;
      if (this.mode !== 'dynamic') log.info('menubar', 'dynamic', { durationMs: Date.now() - started });
      this.mode = 'dynamic';
      this.failures = 0;
      this.scheduleCheck(600);
    } catch (error) {
      log.warn('menubar', error instanceof Error && error.message === 'timeout' ? 'render-timeout' : 'render-failed');
      // A stuck renderer is replaced, not reused. Cause of the first-launch hang is unconfirmed (T7.12).
      if (this.window && !this.window.isDestroyed()) this.window.destroy();
      this.window = null;
      this.useStatic();
      if (key === this.key) this.retry();
    }
  }
  // Forget the drawn key so the next apply() draws again; also try on a timer (backing off) in case no update comes.
  retry() {
    this.key = undefined;
    clearTimeout(this.retryTimer);
    const delay = Math.min(this.retryMs * 2 ** this.failures++, RETRY_MAX);
    this.retryTimer = setTimeout(() => this.apply(), delay);
    this.retryTimer.unref?.();
  }
  useStatic() {
    if (this.disposed) return;
    this.tray.setImage(this.staticImage);
    this.tray.setTitle('');
    this.image = null;
    this.mode = 'static';
    this.scheduleCheck(600);
  }
  scheduleCheck(delay) {
    clearTimeout(this.checkTimer);
    this.checkTimer = setTimeout(() => this.checkHidden(), delay);
    this.checkTimer.unref?.();
  }
  checkHidden() {
    if (this.disposed) return Promise.resolve(this.hidden);
    return new Promise((resolve) => {
      execFile('osascript', ['-l', 'JavaScript', '-e', ONSCREEN_JXA], { timeout: 5000 }, (error, stdout) => {
        let on = null;
        if (!error)
          try {
            on = onscreenFor(JSON.parse(stdout), process.pid, this.tray.getBounds());
          } catch {
            on = null;
          }
        const hidden = on === null ? null : !on;
        if (hidden !== this.hidden) {
          this.hidden = hidden;
          log.info('menubar', 'visibility', { hidden: hidden === null ? -1 : hidden ? 1 : 0 });
          this.onHidden(hidden);
        }
        resolve(hidden);
      });
    });
  }
  // For the native smoke: the drawn state after pending renders, and the ring centre of the current image.
  async snapshot() {
    await this.settled;
    const size = this.image?.getSize();
    let centre = null;
    if (this.image && size) {
      const width = size.width * 2,
        height = size.height * 2;
      centre = ringCentre(this.image.toBitmap({ scaleFactor: 2 }), width, height, 36);
    }
    return {
      mode: this.mode,
      status: this.status,
      size: size || null,
      centre,
      template: this.image?.isTemplateImage(),
    };
  }
  dispose() {
    this.disposed = true;
    clearTimeout(this.checkTimer);
    clearTimeout(this.retryTimer);
    nativeTheme.removeListener('updated', this.redraw);
    for (const event of ['display-added', 'display-removed', 'display-metrics-changed'])
      screen.removeListener(event, this.recheck);
    if (this.window && !this.window.isDestroyed()) this.window.destroy();
  }
}

module.exports = { MenubarIcon, iconModel, onscreenFor, ringCentre, ONSCREEN_JXA };
