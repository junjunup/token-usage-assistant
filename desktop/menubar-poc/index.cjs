// Menu-bar POC (T7.3). Development only: main.cjs loads it only when the app is not packaged, TUA_MENUBAR_POC=1,
// on macOS and with an isolated --test-directory; electron-builder.yml excludes this directory. It adds a second,
// POC-only status item with fixed sample values (no account data) and prints [menubar-poc] lines to stdout for
// docs/island-1.9.0-design/POC-REPORT-MENUBAR.md.
const path = require('node:path');
const { BrowserWindow, Menu, Tray, app, nativeImage, nativeTheme, screen } = require('electron');
const { rasterRing } = require('./raster.cjs');

const env = process.env;
const options = {
  render: env.TUA_MENUBAR_RENDER === 'raster' ? 'raster' : 'canvas',
  form: ['ring', 'value', 'two'].includes(env.TUA_MENUBAR_FORM) ? env.TUA_MENUBAR_FORM : 'value',
  state: env.TUA_MENUBAR_STATE || 'normal',
  cycle: env.TUA_MENUBAR_CYCLE === '1',
  theme: env.TUA_MENUBAR_THEME === 'dark' ? 'dark' : 'light',
  protect: env.TUA_MENUBAR_PROTECT !== '0',
  level: env.TUA_MENUBAR_PANEL_LEVEL || 'pop-up-menu',
};
const STATES = {
  normal: {
    ratio: 0.62,
    text: '62%',
    tone: 'normal',
    lines: [
      ['5h', '62%', 'normal'],
      ['周', '78%', 'normal'],
    ],
  },
  amber: {
    ratio: 0.15,
    text: '15%',
    tone: 'amber',
    lines: [
      ['5h', '15%', 'amber'],
      ['周', '64%', 'normal'],
    ],
  },
  red: {
    ratio: 0,
    text: '0%',
    tone: 'red',
    lines: [
      ['5h', '0%', 'red'],
      ['周', '41%', 'normal'],
    ],
  },
  missing: {
    ratio: null,
    text: '—',
    tone: 'normal',
    lines: [
      ['5h', '—', 'normal'],
      ['周', '—', 'normal'],
    ],
  },
  disabled: {
    ratio: null,
    text: '未启用',
    tone: 'normal',
    lines: [
      ['5h', '未启用', 'normal'],
      ['周', '78%', 'normal'],
    ],
  },
  balance: { ratio: null, text: '¥86.40', tone: 'normal', lines: [['余额', '¥86.40', 'normal']] },
};
const ORDER = Object.keys(STATES);
const report = (event, data = {}) => console.log('[menubar-poc] ' + JSON.stringify({ event, ...data }));
const ANSI = { amber: '\u001b[33m', red: '\u001b[31m' };

let tray = null,
  renderer = null,
  panel = null,
  state = STATES[options.state] ? options.state : 'normal',
  lastBlurHide = 0;

function model() {
  const s = STATES[state];
  return {
    form: options.form,
    ratio: s.ratio,
    text: s.text,
    tone: s.tone,
    lines: s.lines.map(([label, text, tone]) => ({ label, text, tone })),
    template: s.tone === 'normal',
    dark: nativeTheme.shouldUseDarkColors,
  };
}

async function canvasImage(m) {
  if (!renderer) {
    renderer = new BrowserWindow({
      show: false,
      width: 200,
      height: 50,
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
    });
    await renderer.loadFile(path.join(__dirname, 'render.html'));
    report('renderer', { kind: 'canvas', pid: renderer.webContents.getOSProcessId() });
  }
  const out = await renderer.webContents.executeJavaScript('render(' + JSON.stringify(m) + ')');
  const image = nativeImage.createEmpty();
  image.addRepresentation({ scaleFactor: 2, dataURL: out.dataURL });
  return { image, title: '' };
}

function rasterImage(m) {
  // Option b: ring bitmap in the main process + tray.setTitle for the number (ANSI colours only).
  const colours = {
    template: [0, 0, 0],
    amber: m.dark ? [227, 173, 87] : [186, 121, 23],
    red: m.dark ? [238, 117, 128] : [220, 76, 87],
  };
  const fg = m.template ? colours.template : colours[m.tone] || (m.dark ? [255, 255, 255] : [0, 0, 0]);
  const track = m.template ? [0, 0, 0, 0.28] : m.dark ? [255, 255, 255, 0.28] : [0, 0, 0, 0.28];
  const buffer = rasterRing({ size: 36, ratio: m.ratio, fill: [...fg, 1], track });
  const image = nativeImage.createFromBitmap(buffer, { width: 36, height: 36, scaleFactor: 2 });
  const text =
    m.form === 'ring' ? '' : m.form === 'value' ? m.text : m.lines.map((l) => l.label + ' ' + l.text).join(' ');
  return { image, title: text && ANSI[m.tone] ? ANSI[m.tone] + text + '\u001b[0m' : text };
}

async function update(reason) {
  const m = model();
  const started = process.hrtime.bigint();
  const { image, title } = options.render === 'raster' ? rasterImage(m) : await canvasImage(m);
  image.setTemplateImage(m.template);
  tray.setImage(image);
  // Optional: keep the exact 2x image for the POC report.
  if (env.TUA_MENUBAR_DUMP)
    require('node:fs').writeFileSync(
      path.join(env.TUA_MENUBAR_DUMP, [options.render, options.form, state].join('-') + '.png'),
      image.toPNG({ scaleFactor: 2 }),
    );
  tray.setTitle(title, { fontType: 'monospacedDigit' });
  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  setTimeout(() => {
    report('update', {
      reason,
      render: options.render,
      form: options.form,
      state,
      template: m.template,
      dark: m.dark,
      ms: Math.round(ms * 100) / 100,
      image: image.getSize(),
      bounds: tray.getBounds(),
    });
  }, 300);
}

function createPanel() {
  panel = new BrowserWindow({
    width: 360,
    height: 400,
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
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  panel.setAlwaysOnTop(true, options.level);
  panel.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  panel.setContentProtection(options.protect);
  panel.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  panel.webContents.on('will-navigate', (e) => e.preventDefault());
  panel.webContents.on('before-input-event', (_e, input) => {
    if (input.type === 'keyDown' && input.key === 'Escape') hidePanel('esc');
  });
  panel.on('blur', () => {
    if (!panel.isVisible()) return;
    lastBlurHide = Date.now();
    hidePanel('blur');
  });
  panel.webContents.once('did-finish-load', async () => {
    const height = await panel.webContents.executeJavaScript('document.getElementById("pop").offsetHeight');
    panel.setSize(360, Math.ceil(height));
    report('panel-ready', { height, pid: panel.webContents.getOSProcessId() });
  });
  panel.loadFile(path.join(__dirname, 'panel.html'), { query: { theme: options.theme } });
}

function hidePanel(reason) {
  if (panel?.isVisible()) panel.hide();
  report('panel-hide', { reason });
}

function showPanel() {
  const b = tray.getBounds();
  const area = screen.getDisplayNearestPoint({ x: b.x + b.width / 2, y: b.y }).workArea;
  const [width] = panel.getSize();
  const x = Math.min(Math.max(Math.round(b.x + b.width / 2 - width / 2), area.x + 8), area.x + area.width - width - 8);
  const y = Math.round(b.y + b.height + 6);
  panel.setPosition(x, y);
  panel.show();
  panel.focus();
  report('panel-show', { tray: b, at: { x, y }, actual: panel.getBounds(), workArea: area });
}

function start() {
  tray = new Tray(nativeImage.createEmpty());
  tray.setToolTip('菜单栏 POC（示例数据）');
  const menu = Menu.buildFromTemplate([
    { label: '（POC 示意）打开用量总览', enabled: false },
    { label: '（POC 示意）刷新用量', enabled: false },
    { type: 'separator' },
    { label: '下一个示例状态', click: () => next('menu') },
    { type: 'separator' },
    { label: '退出 POC', click: () => app.quit() },
  ]);
  // No setContextMenu: on macOS it would also take the left click.
  tray.on('click', () => {
    report('tray-click', { visible: !!panel?.isVisible(), sinceBlurHide: Date.now() - lastBlurHide });
    if (panel.isVisible()) return hidePanel('tray-click');
    // A click on the icon first blurs (and hides) the open panel; do not reopen it straight away.
    if (Date.now() - lastBlurHide < 300) return;
    showPanel();
  });
  tray.on('right-click', () => {
    report('tray-right-click');
    tray.popUpContextMenu(menu);
  });
  nativeTheme.on('updated', () => {
    report('theme-updated', { dark: nativeTheme.shouldUseDarkColors });
    update('theme');
  });
  createPanel();
  update('start');
  if (options.cycle) setInterval(() => next('cycle'), 3000).unref();
  // Optional: open the panel without a click (screenshots, full-screen spaces); same positioning as a click.
  if (Number(env.TUA_MENUBAR_OPEN_AFTER) > 0) setTimeout(showPanel, Number(env.TUA_MENUBAR_OPEN_AFTER));
}

function next(reason) {
  state = ORDER[(ORDER.indexOf(state) + 1) % ORDER.length];
  update(reason);
}

module.exports = { start };
