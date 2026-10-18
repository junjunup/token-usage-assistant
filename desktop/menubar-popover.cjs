// Menu-bar popover panel (T7.6, macOS only): left-click on the menu-bar icon opens it right below the icon.
// Behaviour follows the T7.3 POC (docs/island-1.9.0-design/POC-REPORT-MENUBAR.md):
// - closes on a second click on the icon, a click elsewhere (blur), Esc, or after opening the main window;
// - shows above full-screen spaces; content protection is on (a setting in T7.7);
// - the renderer is the regular app page with ?surface=panel, sandboxed like the main window and the widget. Which
//   IPC channels it may use is decided in main.cjs (a short allow-list).
const { BrowserWindow, screen } = require('electron');

const WIDTH = 360;
const ARROW = 8; // points above the card for the arrow that points at the icon

class MenubarPopover {
  /**
   * @param {{ tray: any, url: string, preload: string, devTools: boolean, payload: () => any,
   *   protect?: () => boolean, onShow?: () => void }} o protect: the T7.7 "panel protection" setting
   */
  constructor({ tray, url, preload, devTools, payload, protect = () => true, onShow = () => {} }) {
    Object.assign(this, { tray, url, preload, devTools, payload, protect, onShow });
    this.window = null;
    this.lastBlurHide = 0;
    this.anchorX = WIDTH / 2;
    this.openedAt = 0;
  }
  create() {
    const win = new BrowserWindow({
      width: WIDTH,
      height: 420,
      show: false,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      type: 'panel',
      title: '用量面板',
      webPreferences: {
        preload: this.preload,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
        spellcheck: false,
        devTools: this.devTools,
      },
    });
    win.setAlwaysOnTop(true, 'pop-up-menu');
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    // Electron 44 on macOS 15 cannot turn content protection off again once it was on (the window stays hidden
    // from capture and isContentProtected() stays true, T7.7), so the setting is fixed per window and a change
    // recreates the window (see send()).
    this.protectedAs = this.protect();
    win.setContentProtection(this.protectedAs);
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (e, target) => {
      if (target !== this.url) e.preventDefault();
    });
    win.webContents.on('will-attach-webview', (e) => e.preventDefault());
    win.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    win.webContents.session.setPermissionCheckHandler(() => false);
    win.webContents.on('before-input-event', (_e, input) => {
      if (input.type === 'keyDown' && input.key === 'Escape') this.hide();
    });
    win.on('blur', () => {
      if (!win.isVisible()) return;
      this.lastBlurHide = Date.now();
      this.hide();
    });
    win.loadURL(this.url);
    this.window = win;
    return win;
  }
  get webContents() {
    return this.window && !this.window.isDestroyed() ? this.window.webContents : null;
  }
  isVisible() {
    return !!this.window && !this.window.isDestroyed() && this.window.isVisible();
  }
  toggle() {
    if (this.isVisible()) return this.hide();
    // Clicking the icon may first blur (and hide) the open panel; do not reopen it straight away.
    if (Date.now() - this.lastBlurHide < 300) return;
    this.show();
  }
  show() {
    const win = this.window && !this.window.isDestroyed() ? this.window : this.create();
    const b = this.tray.getBounds();
    const area = screen.getDisplayNearestPoint({ x: Math.round(b.x + b.width / 2), y: Math.round(b.y) }).workArea;
    const x = Math.min(
      Math.max(Math.round(b.x + b.width / 2 - WIDTH / 2), area.x + 8),
      area.x + area.width - WIDTH - 8,
    );
    this.anchorX = Math.round(b.x + b.width / 2 - x);
    this.openedAt = Date.now();
    win.setPosition(x, Math.round(b.y + b.height + 6 - ARROW));
    this.send();
    win.show();
    win.focus();
    this.onShow();
  }
  hide() {
    if (this.isVisible()) this.window.hide();
  }
  /** @param {number} height card height reported by the renderer, in points */
  resize(height) {
    if (!this.window || this.window.isDestroyed()) return;
    const h = Math.round(Math.min(720, Math.max(120, Number(height) || 0)) + ARROW);
    this.window.setSize(WIDTH, h);
  }
  state() {
    return { ...this.payload(), anchorX: this.anchorX, arrow: ARROW, openedAt: this.openedAt };
  }
  send() {
    if (!this.webContents) return;
    // Every settings change ends in a broadcast: a changed protection setting replaces the window, which is
    // created again (with the new setting) the next time the panel opens.
    if (this.protectedAs !== this.protect()) {
      this.dispose();
      return;
    }
    this.webContents.send('assistant:panel', this.state());
  }
  dispose() {
    if (this.window && !this.window.isDestroyed()) this.window.destroy();
    this.window = null;
  }
}

module.exports = { MenubarPopover, WIDTH, ARROW };
