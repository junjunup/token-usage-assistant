// T7.12: a hidden renderer that never answers must not leave the menu-bar icon stuck on the static logo.
// Loads desktop/menubar-icon.cjs against a fake `electron` module (no real windows, no osascript).
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

/** @param {{ load?: () => Promise<void>, run?: () => Promise<any> }} behaviour per created window, in order */
function fakeElectron(behaviours) {
  const created = [];
  class BrowserWindow {
    constructor() {
      const b = behaviours[Math.min(created.length, behaviours.length - 1)];
      this.destroyed = false;
      this.webContents = {
        setWindowOpenHandler() {},
        on() {},
        executeJavaScript: () => (b.run ? b.run() : Promise.resolve({ dataURL: 'data:image/png;base64,', width: 50 })),
      };
      this.loadFile = () => (b.load ? b.load() : Promise.resolve());
      created.push(this);
    }
    isDestroyed() {
      return this.destroyed;
    }
    destroy() {
      this.destroyed = true;
    }
  }
  const image = () => ({ addRepresentation() {}, setTemplateImage() {}, getSize: () => ({ width: 50, height: 22 }) });
  return {
    created,
    electron: {
      BrowserWindow,
      nativeImage: { createEmpty: image },
      nativeTheme: { on() {}, removeListener() {}, shouldUseDarkColors: false },
      screen: { on() {}, removeListener() {} },
    },
  };
}

function loadIcon(electron) {
  const original = Module._load;
  Module._load = function (request, ...rest) {
    return request === 'electron' ? electron : original.call(this, request, ...rest);
  };
  try {
    const file = require.resolve('../desktop/menubar-icon.cjs');
    delete require.cache[file];
    return require(file).MenubarIcon;
  } finally {
    Module._load = original;
  }
}

const win = (p) => ({
  remainingPercent: p,
  usedPercent: 100 - p,
  resetAt: Date.now() + 3e6,
  resetState: 'scheduled',
  unlimited: false,
  exceeded: false,
});
const accounts = [
  {
    id: 'cc',
    label: 'Command Code',
    provider: 'commandcode',
    active: true,
    capabilities: { quota: true, balance: true },
    status: 'connected',
    parts: { credits: { five: win(100), week: win(100), monthly: 18.06 } },
    updatedAt: {},
  },
];
const never = () => new Promise(() => {});

function setup(behaviours) {
  const fake = fakeElectron(behaviours);
  const MenubarIcon = loadIcon(fake.electron);
  const images = [];
  const tray = { setImage: (i) => images.push(i), setTitle() {}, getBounds: () => ({ x: 900, y: 0, width: 50 }) };
  const icon = new MenubarIcon({ tray, staticImage: 'static', timeoutMs: 50, retryMs: 20 });
  icon.scheduleCheck = () => {};
  return { icon, images, created: fake.created };
}

for (const [stage, behaviour] of [
  ['loading the renderer', { load: never }],
  ['drawing', { run: never }],
]) {
  test(`T7.12: a renderer stuck while ${stage} falls back to the static logo, is replaced, and the retry draws`, async () => {
    const { icon, images, created } = setup([behaviour, {}]);
    icon.update(accounts, { threshold: 20 });
    await icon.settled;
    assert.equal(icon.mode, 'static');
    assert.equal(images.at(-1), 'static');
    assert.equal(created[0].isDestroyed(), true);
    assert.equal(icon.window, null);
    // The retry timer (or the next update) draws again with a fresh renderer.
    await new Promise((r) => setTimeout(r, 60));
    await icon.settled;
    assert.equal(icon.mode, 'dynamic');
    assert.equal(created.length, 2);
    assert.notEqual(images.at(-1), 'static');
    icon.dispose();
  });
}

test('T7.12: a healthy renderer draws once and is reused; no retry timer is left behind', async () => {
  const { icon, created } = setup([{}]);
  icon.update(accounts, { threshold: 20 });
  await icon.settled;
  assert.equal(icon.mode, 'dynamic');
  icon.update(accounts, { threshold: 20, menubarForm: 'two' });
  await icon.settled;
  assert.equal(created.length, 1);
  assert.equal(icon.retryTimer, undefined);
  icon.dispose();
});
