const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { reportVisibility } = require('../desktop/window-visibility.cjs');

// T11.5: idle resources. A hidden window's page pauses its once-a-second timers; the widget exists only while on.
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

function fakeWindow({ visible = false, minimized = false } = {}) {
  const win = new EventEmitter();
  const sent = [];
  win.state = { visible, minimized, destroyed: false };
  win.isVisible = () => win.state.visible;
  win.isMinimized = () => win.state.minimized;
  win.isDestroyed = () => win.state.destroyed;
  win.webContents = Object.assign(new EventEmitter(), { send: (channel, value) => sent.push([channel, value]) });
  return { win, sent };
}

test('T11.5: the page is told whether its window is on screen — hidden, shown, minimised, restored', () => {
  const { win, sent } = fakeWindow();
  reportVisibility(win);
  win.webContents.emit('did-finish-load');
  win.state.visible = true;
  win.emit('show');
  win.state.minimized = true;
  win.emit('minimize');
  win.state.minimized = false;
  win.emit('restore');
  win.state.visible = false;
  win.emit('hide');
  assert.deepEqual(
    sent.map(([, v]) => v),
    [false, true, false, true, false],
  );
  assert.ok(sent.every(([channel]) => channel === 'assistant:visibility'));
  // A destroyed window is never written to.
  win.state.destroyed = true;
  win.emit('show');
  assert.equal(sent.length, 5);
});

test('T11.5: every window reports its visibility, the preload exposes it, and the countdown pauses while hidden', () => {
  const main = read('desktop/main.cjs');
  assert.match(main, /rememberWindow\(kind, win\);\s*reportVisibility\(win\);/);
  assert.match(read('desktop/menubar-popover.cjs'), /reportVisibility\(win\);\s*win\.loadURL\(this\.url\);/);
  assert.match(read('desktop/preload.cjs'), /onVisibility: \(callback\) =>[\s\S]*'assistant:visibility'/);
  const live = read('src/Live.jsx');
  assert.match(live, /window\.tokenAssistant\?\.onVisibility\?\./);
  assert.match(live, /if \(!visible\) return;/);
});

test('T11.5: the widget is created only while it is on (the smoke keeps one hidden) and destroyed when switched off', () => {
  const main = read('desktop/main.cjs');
  // The only place that creates the widget is syncWidget().
  assert.equal(main.match(/secureWindow\('widget'\)/g)?.length, 1);
  assert.match(
    main,
    /function syncWidget\(\) \{[\s\S]*if \(settings\.floating \|\| smoke\) \{[\s\S]*widgetWindow = secureWindow\('widget'\);/,
  );
  assert.match(main, /\} else if \(alive\) \{\s*widgetWindow\.destroy\(\);\s*widgetWindow = null;/);
  // Startup, settings changes and closing the widget all go through it.
  assert.match(main, /syncWidget\(\);\s*installIpc\(\);/);
  assert.match(main, /syncWidget\(\);\s*widgetWindow\?\.setMovable\(!settings\.pinned\);/);
  assert.match(main, /settings\.floating = false;\s*savePreferences\(\);\s*syncWidget\(\);/);
});
