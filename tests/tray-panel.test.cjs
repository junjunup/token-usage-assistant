const test = require('node:test');
const assert = require('node:assert/strict');
const { panelPlacement, nearestEdge } = require('../desktop/panel-placement.cjs');
const { accountOverview, trayTooltip } = require('../desktop/account-overview.cjs');

// T11.2: where the tray panel opens, and the tray tooltip. Pure modules; the Windows window itself is covered by the
// native smoke on the CI Windows runner.
const W = 360,
  H = 420;
const display = (bounds, workArea) => ({ bounds, workArea });
const full = { x: 0, y: 0, width: 1920, height: 1080 };

test('T7.6: macOS opens below the menu-bar icon, centred on it, with the arrow pointing at the icon', () => {
  const p = panelPlacement({
    tray: { x: 1500, y: 0, width: 30, height: 24 },
    display: display(full, { x: 0, y: 24, width: 1920, height: 1056 }),
    width: W,
    height: H,
    platform: 'darwin',
  });
  assert.deepEqual(p, { x: 1335, y: 22, edge: 'top', anchorX: 180, arrow: 8 });
  // Near the right edge it stays 8 points inside the work area; the arrow still points at the icon.
  const edge = panelPlacement({
    tray: { x: 1880, y: 0, width: 30, height: 24 },
    display: display(full, { x: 0, y: 24, width: 1920, height: 1056 }),
    width: W,
    height: H,
    platform: 'darwin',
  });
  assert.equal(edge.x, 1920 - W - 8);
  assert.equal(edge.anchorX, 1895 - edge.x);
});

test('T11.2: Windows opens against the taskbar the tray icon is on, inside the work area, without an arrow', () => {
  const at = (tray, workArea, bounds = full) =>
    panelPlacement({ tray, display: display(bounds, workArea), width: W, height: H, platform: 'win32' });
  // Bottom taskbar (Windows 11 default): above it, centred on the icon, 12 px from the work area's bottom.
  const bottom = at({ x: 1700, y: 1050, width: 24, height: 24 }, { x: 0, y: 0, width: 1920, height: 1032 });
  assert.deepEqual(bottom, { x: 1532, y: 1032 - H - 12, edge: 'bottom', anchorX: null, arrow: 0 });
  // Near the screen corner it stays inside the work area.
  const corner = at({ x: 1890, y: 1050, width: 24, height: 24 }, { x: 0, y: 0, width: 1920, height: 1032 });
  assert.equal(corner.x, 1920 - W - 12);
  // Top, left and right taskbars (Windows 10 can move it).
  const top = at({ x: 1700, y: 6, width: 24, height: 24 }, { x: 0, y: 40, width: 1920, height: 1040 });
  assert.deepEqual([top.edge, top.y], ['top', 52]);
  const left = at({ x: 10, y: 1000, width: 24, height: 24 }, { x: 48, y: 0, width: 1872, height: 1080 });
  assert.deepEqual([left.edge, left.x, left.y], ['left', 60, 1080 - H - 12]);
  const right = at({ x: 1886, y: 500, width: 24, height: 24 }, { x: 0, y: 0, width: 1872, height: 1080 });
  assert.deepEqual([right.edge, right.x, right.y], ['right', 1872 - W - 12, Math.round(512 - H / 2)]);
});

test('T11.2: an auto-hidden taskbar and a second display still place the panel next to the icon', () => {
  // Auto-hide: the work area is the whole display; the nearest edge to the icon decides.
  const hidden = panelPlacement({
    tray: { x: 1700, y: 1076, width: 24, height: 4 },
    display: display(full, full),
    width: W,
    height: H,
    platform: 'win32',
  });
  assert.deepEqual([hidden.edge, hidden.y], ['bottom', 1080 - H - 12]);
  // A display to the left of the primary one (negative coordinates) at 150%: everything is in that display's DIPs.
  const bounds = { x: -1280, y: 0, width: 1280, height: 720 },
    work = { x: -1280, y: 0, width: 1280, height: 688 };
  const p = panelPlacement({
    tray: { x: -100, y: 694, width: 24, height: 24 },
    display: display(bounds, work),
    width: W,
    height: H,
    platform: 'win32',
  });
  assert.equal(p.edge, 'bottom');
  assert.ok(p.x >= work.x + 12 && p.x + W <= work.x + work.width - 12);
  assert.ok(p.y >= work.y && p.y + H <= work.y + work.height);
  assert.equal(nearestEdge({ x: 960, y: 540 }, full), 'bottom');
});

test('T11.2: a panel taller than the work area is pinned to its top, never placed off screen', () => {
  const p = panelPlacement({
    tray: { x: 1700, y: 1050, width: 24, height: 24 },
    display: display(full, { x: 0, y: 0, width: 1920, height: 400 }),
    width: W,
    height: 720,
    platform: 'win32',
  });
  assert.equal(p.y, 12);
});

const row = (id, label, percent, extra = {}) => ({
  id,
  label,
  provider: 'glm',
  active: false,
  capabilities: { quota: true, balance: false },
  status: 'connected',
  parts: {
    credits: {
      windows: [
        {
          id: 'w',
          label: '5 小时窗口',
          applicable: true,
          remainingPercent: percent,
          usedPercent: percent === null ? null : 100 - percent,
          resetAt: Date.UTC(2026, 9, 30, 12),
          resetState: 'scheduled',
          unlimited: false,
          exceeded: false,
        },
      ],
    },
  },
  updatedAt: { credits: Date.UTC(2026, 9, 30, 9) },
  ...extra,
});

test('T11.2: the tooltip lists every account most urgent first and stays within 127 characters', () => {
  const settings = { threshold: 20 };
  const few = trayTooltip(
    accountOverview([row('a', 'GLM', 80), row('b', 'MiniMax', 35), row('c', '火山', null)], settings),
  );
  assert.equal(few, 'Token 用量助手\nMiniMax 35%\nGLM 80%\n火山 —');
  const stale = trayTooltip(accountOverview([row('a', 'GLM', 80, { status: 'offline' })], settings));
  assert.equal(stale, 'Token 用量助手\nGLM 80%（上次）');
  assert.equal(trayTooltip(accountOverview([], settings)), 'Token 用量助手\n未连接账户');
  // Twenty accounts with long names: as many as fit, then how many more, never past the limit.
  const many = Array.from({ length: 20 }, (_, i) => row('a' + i, '一个很长的账户备注名称 ' + i, 30 + i));
  const tip = trayTooltip(accountOverview(many, settings));
  assert.ok(tip.length <= 127, String(tip.length));
  const lines = tip.split('\n');
  assert.equal(lines[0], 'Token 用量助手');
  assert.match(lines[1], /一个很长的账户备注名称 0 30%/);
  const shown = lines.length - 2;
  assert.equal(lines.at(-1), '另 ' + (20 - shown) + ' 个账户');
  // A shorter limit still ends with the count, and a single overlong name cannot push it past the limit.
  const one = trayTooltip(accountOverview([row('x', 'x'.repeat(200), 50)], settings));
  assert.ok(one.length <= 127);
  assert.equal(one, 'Token 用量助手\n另 1 个账户');
});
