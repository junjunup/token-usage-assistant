// Island POC (T7.1). Development only: main.cjs loads it only when the app is not packaged and
// TUA_ISLAND_POC=1; electron-builder.yml excludes this directory. It shows fixed sample values (no account data)
// and prints geometry/state lines prefixed with [island-poc] to stdout for docs/island-1.9.0-design/POC-REPORT.md.
const path = require('node:path');
const { execFile } = require('node:child_process');
const { BrowserWindow, ipcMain, screen } = require('electron');
const { NSSCREEN_JXA, fromNSScreens, fromHeuristic, layout } = require('./geometry.cjs');

const env = process.env;
const options = {
  level: env.TUA_ISLAND_LEVEL || 'status', // status | pop-up-menu | floating (comparison)
  ears: env.TUA_ISLAND_EARS === 'alert' ? 'alert' : 'always', // ⑦: always shown vs only while alerting
  alert: env.TUA_ISLAND_ALERT === '1',
  protect: env.TUA_ISLAND_PROTECT !== '0',
  panel: env.TUA_ISLAND_PANEL === '1', // keep the panel open (screenshots)
  geometry: env.TUA_ISLAND_GEOMETRY === 'heuristic' ? 'heuristic' : 'nsscreen',
  notchWidth: Number(env.TUA_ISLAND_NOTCH_WIDTH) || 185,
};

const report = (event, data) => console.log('[island-poc] ' + JSON.stringify({ event, ...data }));

function readNSScreens() {
  return new Promise((resolve) => {
    execFile('osascript', ['-l', 'JavaScript', '-e', NSSCREEN_JXA], { timeout: 5000 }, (error, stdout) => {
      if (error) return resolve(null);
      try {
        resolve(JSON.parse(stdout));
      } catch {
        resolve(null);
      }
    });
  });
}

async function measure() {
  const display = screen.getAllDisplays().find((d) => d.internal);
  if (!display) return { display: null, geometry: null, source: 'no-internal-display' };
  if (options.geometry === 'nsscreen') {
    const raw = await readNSScreens();
    const match =
      raw && fromNSScreens(raw).find((s) => s.bounds.x === display.bounds.x && s.bounds.y === display.bounds.y);
    if (match) return { display, geometry: match.notch ? match : null, source: 'nsscreen' };
  }
  return { display, geometry: fromHeuristic(display, options.notchWidth), source: 'heuristic' };
}

let win = null;
let current = null;

async function place() {
  const { display, geometry, source } = await measure();
  const snapshot = display && {
    bounds: display.bounds,
    workArea: display.workArea,
    scaleFactor: display.scaleFactor,
    menuBar: display.workArea.y - display.bounds.y,
  };
  report('geometry', { source, display: snapshot, notch: geometry?.notch ?? null, options });
  if (!geometry) {
    // External screen only or no notch: the island falls back to the classic widget (nothing drawn here).
    if (win && !win.isDestroyed()) win.hide();
    return;
  }
  const earsVisible = options.ears === 'always' || options.alert;
  current = layout({ notch: geometry.notch, earsVisible });
  if (!win || win.isDestroyed()) create();
  win.setBounds(current.window);
  win.webContents.send('island:layout', { ...current, options });
  win.showInactive();
  report('placed', { requested: current.window, actual: win.getBounds() });
}

function create() {
  win = new BrowserWindow({
    ...current.window,
    show: false,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    focusable: false,
    skipTaskbar: true,
    enableLargerThanScreen: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  win.setAlwaysOnTop(true, options.level);
  // No visibleOnFullScreen: a full-screen space draws into the notch area, so the island stays off it.
  win.setVisibleOnAllWorkspaces(true);
  win.setContentProtection(options.protect);
  win.setIgnoreMouseEvents(true, { forward: true });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.once('did-finish-load', () => {
    win.webContents.send('island:layout', { ...current, options });
    // The island renderer's own process, so CPU/memory can be read without the rest of the app.
    report('renderer', { pid: win.webContents.getOSProcessId() });
  });
  win.loadFile(path.join(__dirname, 'island.html'));
}

function start() {
  ipcMain.on('island:hover', (_e, inside) => {
    if (!win || win.isDestroyed()) return;
    // While the pointer is over the island the window takes clicks; elsewhere they pass through.
    win.setIgnoreMouseEvents(!inside, { forward: true });
    win.invalidateShadow();
    report('hover', { inside: !!inside });
  });
  for (const event of ['display-added', 'display-removed', 'display-metrics-changed'])
    screen.on(event, () => {
      report('display-event', { event });
      place();
    });
  place();
  const sample = setInterval(() => {
    const d = screen.getAllDisplays().find((x) => x.internal);
    if (d) report('workarea-sample', { menuBar: d.workArea.y - d.bounds.y, visible: !!win?.isVisible() });
  }, 10000);
  sample.unref();
}

module.exports = { start };
