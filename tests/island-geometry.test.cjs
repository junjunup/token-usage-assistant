const test = require('node:test');
const assert = require('node:assert/strict');
const { fromNSScreens, fromHeuristic, layout } = require('../desktop/island-poc/geometry.cjs');

// NSScreen values read with JXA on a 14-inch MacBook Pro (default scaling, 1512 x 982 points).
const builtIn = { frame: [0, 0, 1512, 982], top: 32, left: [0, 950, 663, 32], right: [848, 950, 664, 32] };

test('NSScreen menu-bar areas convert to an Electron notch rectangle', () => {
  const [screen] = fromNSScreens([builtIn]);
  assert.deepEqual(screen.bounds, { x: 0, y: 0, width: 1512, height: 982 });
  assert.deepEqual(screen.notch, { x: 663, y: 0, width: 185, height: 32 });
  assert.deepEqual(screen.leftArea, { x: 0, y: 0, width: 663, height: 32 });
  assert.deepEqual(screen.rightArea, { x: 848, y: 0, width: 664, height: 32 });
});

test('screens without a notch report none; secondary screens flip against the main screen height', () => {
  const external = { frame: [1512, 200, 1920, 1080], top: 0, left: [0, 0, 0, 0], right: [0, 0, 0, 0] };
  const [, second] = fromNSScreens([builtIn, external]);
  assert.equal(second.notch, null);
  assert.deepEqual(second.bounds, { x: 1512, y: 982 - 1280, width: 1920, height: 1080 });
  assert.deepEqual(fromNSScreens([]), []);
});

test('the workArea heuristic only claims a notch above 30 points and centres the manual width', () => {
  const bounds = { x: 0, y: 0, width: 1512, height: 982 };
  assert.equal(fromHeuristic({ bounds, workArea: { ...bounds, y: 24 } }, 185), null);
  // Auto-hidden menu bar: workArea starts at 0, so the heuristic misses the notch (documented limitation).
  assert.equal(fromHeuristic({ bounds, workArea: { ...bounds, y: 0 } }, 185), null);
  assert.deepEqual(fromHeuristic({ bounds, workArea: { ...bounds, y: 32 } }, 185).notch, {
    x: 664,
    y: 0,
    width: 185,
    height: 32,
  });
});

test('ear content never enters the notch and keeps the 12-point buffer', () => {
  const notch = { x: 663, y: 0, width: 185, height: 32 };
  const l = layout({ notch, earsVisible: true });
  const notchLeft = l.notch.x,
    notchRight = l.notch.x + l.notch.width;
  assert.ok(l.leftEar.x + l.leftEar.width <= notchLeft - 12);
  assert.ok(l.rightEar.x >= notchRight + 12);
  assert.equal(l.island.width, 185 + 2 * 72);
  assert.ok(Math.abs(l.window.x + l.window.width / 2 - (663 + 185 / 2)) <= 0.5);
  // "Only while alerting": the collapsed island covers just the notch and has no ears.
  const bare = layout({ notch, earsVisible: false });
  assert.equal(bare.island.width, 185);
  assert.equal(bare.leftEar, null);
  assert.equal(bare.rightEar, null);
});
