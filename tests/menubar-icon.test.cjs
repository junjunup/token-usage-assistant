const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { iconModel, onscreenFor, ringCentre } = require('../desktop/menubar-icon.cjs');

const status = (over = {}) => ({
  accountId: 'cc',
  accountLabel: 'Command Code',
  windowId: 'five',
  windowLabel: '5 小时窗口',
  ring: 0.62,
  text: '62%',
  tone: 'normal',
  lines: [
    { label: '5h', text: '62%', tone: 'normal' },
    { label: '周', text: '78%', tone: 'normal' },
  ],
  stale: false,
  ...over,
});

test('the renderer draws the approved brand mark, byte for byte', () => {
  const svg = fs.readFileSync(path.join(__dirname, '..', 'desktop', 'assets', 'brand-mark.svg'), 'utf8');
  const fromSvg = / d="([^"]+)"/.exec(svg)[1];
  const js = fs.readFileSync(path.join(__dirname, '..', 'desktop', 'menubar-render', 'mark.js'), 'utf8');
  const fromJs = /const MARK =\s*['"]([^'"]+)['"]/.exec(js)[1];
  assert.equal(fromJs, fromSvg);
});

test('no status means the static logo', () => {
  assert.equal(iconModel(null, { dark: false }), null);
});

test('normal states are template images and ignore the appearance; alerts use colour by appearance', () => {
  const normal = iconModel(status(), { dark: true });
  assert.equal(normal?.template, true);
  assert.equal(normal?.dark, false);
  assert.equal(normal?.form, 'value');
  const amber = iconModel(status({ tone: 'amber', text: '15%' }), { dark: true });
  assert.equal(amber?.template, false);
  assert.equal(amber?.dark, true);
  // A two-line icon with one alerting line is coloured too.
  const line = iconModel(
    status({
      lines: [
        { label: '5h', text: '62%', tone: 'normal' },
        { label: '月', text: '$0.00', tone: 'red' },
      ],
    }),
    { form: 'two', dark: false },
  );
  assert.equal(line?.template, false);
  assert.equal(line?.form, 'two');
});

test('on-screen check matches our process and the tray bounds', () => {
  const bounds = { x: 868, width: 59 };
  const list = [
    { pid: 10, x: 868, w: 59, on: false },
    { pid: 42, x: 868, w: 59, on: true },
    { pid: 42, x: 967, w: 34, on: true },
  ];
  assert.equal(onscreenFor(list, 42, bounds), true);
  assert.equal(onscreenFor([{ pid: 42, x: 860, w: 67, on: false }], 42, { x: 860, width: 67 }), false);
  assert.equal(onscreenFor(list, 7, bounds), null);
  assert.equal(onscreenFor('garbage', 42, bounds), null);
  assert.equal(onscreenFor(list, 42, /** @type {any} */ (null)), null);
});

test('ring centre is the bounding-box centre of visible pixels in the ring area', () => {
  const width = 60,
    height = 44,
    bitmap = Buffer.alloc(width * height * 4);
  const paint = (x, y) => (bitmap[(y * width + x) * 4 + 3] = 255);
  for (let y = 4; y < 40; y++) for (let x = 0; x < 36; x++) if ((x - 18) ** 2 + (y - 22) ** 2 < 17 ** 2) paint(x, y);
  // Text to the right of the ring is ignored.
  for (let y = 10; y < 30; y++) paint(50, y);
  const c = ringCentre(bitmap, width, height, 36);
  assert.ok(c && Math.abs(c.x - 18) <= 0.5 && Math.abs(c.y - 22) <= 0.5);
  assert.equal(ringCentre(Buffer.alloc(width * height * 4), width, height, 36), null);
});
