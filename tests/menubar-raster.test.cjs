const test = require('node:test');
const assert = require('node:assert/strict');
const { MARK, flatten, insideMark, rasterRing } = require('../desktop/menubar-poc/raster.cjs');

const alpha = (buf) => {
  const a = [];
  for (let i = 3; i < buf.length; i += 4) a.push(buf[i]);
  return a;
};
const black = [0, 0, 0, 1];
const track = [0, 0, 0, 0.28];

test('the brand mark flattens into its two even-odd sub-paths', () => {
  const polys = flatten(MARK);
  assert.equal(polys.length, 2);
  // The centre is the hole of the ring; points on the ring body are inside.
  assert.equal(insideMark(256, 256), false);
  assert.equal(insideMark(256, 444), true); // bottom of the big arc
  assert.equal(insideMark(390, 130), true); // the small segment at the upper right
  assert.equal(insideMark(-20, -20), false);
});

test('a full ratio covers the same pixels as the plain logo, and nothing is drawn outside it', () => {
  const full = alpha(rasterRing({ size: 36, ratio: 1, fill: black, track: [0, 0, 0, 0] }));
  const plain = alpha(rasterRing({ size: 36, ratio: 0, fill: [0, 0, 0, 0], track: black }));
  assert.deepEqual(full, plain);
  assert.ok(full.some((a) => a === 255));
  // The middle of the ring stays transparent.
  assert.equal(full[18 * 36 + 18], 0);
});

test('the lit share grows with the ratio, and null draws only the track', () => {
  const lit = (ratio) =>
    alpha(rasterRing({ size: 36, ratio, fill: black, track: [0, 0, 0, 0] })).reduce((n, a) => n + a, 0);
  assert.equal(lit(0), 0);
  assert.equal(lit(null), 0);
  assert.ok(lit(0.15) < lit(0.62));
  assert.ok(lit(0.62) < lit(1));
  // With the track visible, null (missing / disabled / balance) still shows the dim outline.
  const dim = alpha(rasterRing({ size: 36, ratio: null, fill: black, track }));
  assert.ok(Math.max(...dim) > 0 && Math.max(...dim) <= Math.round(0.28 * 255));
});

test('output is premultiplied BGRA of size x size x 4', () => {
  const buf = rasterRing({ size: 36, ratio: 0.5, fill: [220, 76, 87, 1], track });
  assert.equal(buf.length, 36 * 36 * 4);
  for (let i = 0; i < buf.length; i += 4) {
    assert.ok(buf[i] <= buf[i + 3] && buf[i + 1] <= buf[i + 3] && buf[i + 2] <= buf[i + 3]);
  }
});
