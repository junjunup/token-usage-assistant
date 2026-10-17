const test = require('node:test');
const assert = require('node:assert/strict');
const { menubarStatus, slotsOf, shortLabel } = require('../desktop/menubar-status.cjs');
const { AccountManager } = require('../desktop/accounts.cjs');

const settings = { threshold: 20 };
const H = 3600000;
const quota = { quota: true, balance: false };
const win = (remainingPercent, extra = {}) => ({
  used: null,
  cap: null,
  remainingPercent,
  usedPercent: remainingPercent === null ? null : 100 - remainingPercent,
  resetAt: Date.UTC(2026, 9, 18, 12),
  resetState: 'scheduled',
  unlimited: false,
  exceeded: false,
  ...extra,
});
const commandcode = (five, week, extra = {}) => ({
  id: 'cc',
  label: 'Command Code',
  provider: 'commandcode',
  active: true,
  capabilities: { quota: true, balance: true },
  status: 'connected',
  parts: { credits: { five, week, monthly: null, purchased: null, free: null, total: null } },
  ...extra,
});
const windowsAccount = (id, windows, extra = {}) => ({
  id,
  label: id,
  provider: 'glm',
  active: false,
  capabilities: quota,
  status: 'connected',
  parts: { credits: { windows } },
  ...extra,
});
const q = (id, label, remainingPercent, extra = {}) => ({
  id,
  label,
  applicable: true,
  ...win(remainingPercent),
  ...extra,
});
const deepseek = (balances, isAvailable = true, extra = {}) => ({
  id: 'ds',
  label: 'DeepSeek',
  provider: 'deepseek',
  active: false,
  capabilities: { quota: false, balance: true },
  status: 'connected',
  parts: { balance: { isAvailable, balances } },
  ...extra,
});

test('no accounts keeps the static logo', () => {
  assert.equal(menubarStatus([], settings), null);
  assert.equal(menubarStatus(/** @type {any} */ (undefined), settings), null);
});

test('a single healthy account shows its window with the least left, in the existing tone rule', () => {
  const s = menubarStatus([commandcode(win(62), win(78))], settings);
  assert.equal(s?.accountId, 'cc');
  assert.equal(s?.windowId, 'five');
  assert.equal(s?.text, '62%');
  assert.equal(s?.ring, 0.62);
  assert.equal(s?.tone, 'normal');
  assert.deepEqual(s?.lines, [
    { label: '5h', text: '62%', tone: 'normal' },
    { label: '周', text: '78%', tone: 'normal' },
  ]);
  assert.equal(s?.stale, false);
});

test('below the reminder threshold is amber; exhausted is red (not "below 10%")', () => {
  assert.equal(menubarStatus([commandcode(win(15), win(80))], settings)?.tone, 'amber');
  // 6% left but not exhausted: amber under the existing rule.
  assert.equal(menubarStatus([commandcode(win(6), win(80))], settings)?.tone, 'amber');
  const red = menubarStatus([commandcode(win(0, { exceeded: true }), win(80))], settings);
  assert.equal(red?.tone, 'red');
  assert.equal(red?.text, '0%');
  // The threshold follows the user setting (10 / 20 / 30).
  assert.equal(menubarStatus([commandcode(win(15), win(80))], { threshold: 10 })?.tone, 'normal');
});

test('red wins over amber across accounts; the same level goes to the window that resets first', () => {
  const amber = commandcode(win(12), win(80));
  const red = windowsAccount('glm', [q('g1', '5 小时窗口', 0, { exceeded: true })]);
  assert.equal(menubarStatus([amber, red], settings)?.accountId, 'glm');
  const soon = windowsAccount('soon', [q('a', '5 小时窗口', 15, { resetAt: 1000 * H })]);
  const later = windowsAccount('later', [q('b', '5 小时窗口', 5, { resetAt: 2000 * H })]);
  assert.equal(menubarStatus([later, soon], settings)?.accountId, 'soon');
});

test('without alerts the window with the least left wins; ties go to the current account', () => {
  const active = commandcode(win(70), win(90));
  const other = windowsAccount('glm', [q('g1', '5 小时窗口', 40)]);
  assert.equal(menubarStatus([active, other], settings)?.accountId, 'glm');
  const same = windowsAccount('glm', [q('g1', '5 小时窗口', 70)]);
  assert.equal(menubarStatus([same, active], settings)?.accountId, 'cc');
});

test('missing data is a dash, never 0, and never alerts', () => {
  const s = menubarStatus([commandcode(win(null), win(null))], settings);
  assert.equal(s?.text, '—');
  assert.equal(s?.ring, null);
  assert.equal(s?.tone, 'normal');
  const none = menubarStatus([commandcode(null, null, { parts: {} })], settings);
  assert.equal(none?.text, '—');
  assert.equal(none?.ring, null);
});

test('resetAt=0 shows 未启用 without a gauge; unlimited shows 不限; non-applicable windows are skipped', () => {
  const idle = menubarStatus([commandcode(win(100, { resetAt: null, resetState: 'idle' }), win(null))], settings);
  assert.equal(idle?.lines[0].text, '未启用');
  const unlimited = slotsOf(windowsAccount('m', [q('u', '5 小时窗口', null, { unlimited: true })]), 20)[0];
  assert.equal(unlimited.text, '不限');
  assert.equal(unlimited.ratio, null);
  assert.deepEqual(slotsOf(windowsAccount('m', [q('x', '5 小时窗口', 50, { applicable: false })]), 20), []);
});

test('balances keep their currency, are never a gauge, and only the platform flag turns them amber', () => {
  const s = menubarStatus([deepseek([{ currency: 'CNY', total: '86.4' }])], settings);
  assert.equal(s?.text, '¥86.40');
  assert.equal(s?.ring, null);
  assert.equal(s?.tone, 'normal');
  assert.deepEqual(s?.lines, [{ label: '余额', text: '¥86.40', tone: 'normal' }]);
  const two = slotsOf(
    deepseek([
      { currency: 'CNY', total: '1.5' },
      { currency: 'USD', total: '2' },
    ]),
    20,
  );
  assert.deepEqual(
    two.map((x) => x.text),
    ['¥1.50', '$2.00'],
  );
  assert.equal(menubarStatus([deepseek([{ currency: 'CNY', total: '0' }], false)], settings)?.tone, 'amber');
  // A balance account never outranks a quota window when nothing alerts.
  assert.equal(
    menubarStatus([deepseek([{ currency: 'CNY', total: '1' }]), commandcode(win(90), win(95))], settings)?.accountId,
    'cc',
  );
});

test('Command Code monthly credits at or below zero are red, shown in USD', () => {
  const a = commandcode(win(90), win(95));
  a.parts.credits.monthly = 0;
  const s = menubarStatus([a], settings);
  assert.equal(s?.tone, 'red');
  assert.equal(s?.windowId, 'monthly');
  assert.equal(s?.text, '$0.00');
  assert.equal(s?.ring, null);
});

test('a sliver left reads <1%, not 0%', () => {
  assert.equal(menubarStatus([commandcode(win(0.3), win(80))], settings)?.text, '<1%');
});

test('the two-line form always includes the focus window', () => {
  const s = menubarStatus(
    [windowsAccount('v', [q('a', '近一天窗口', 80), q('b', '近一周窗口', 70), q('c', '近一月窗口', 9)])],
    settings,
  );
  assert.equal(s?.windowId, 'c');
  assert.deepEqual(
    s?.lines.map((l) => l.label),
    ['日', '月'],
  );
});

test('short labels for known window names; unknown names keep two characters', () => {
  assert.equal(shortLabel('5 小时窗口'), '5h');
  assert.equal(shortLabel('3 天窗口'), '3d');
  assert.equal(shortLabel('本账期额度'), '月');
  assert.equal(shortLabel('每周窗口'), '周');
  assert.equal(shortLabel('额度窗口 3'), '额度');
});

test('offline or re-auth accounts are marked stale (last successful values, as in the main window)', () => {
  assert.equal(menubarStatus([commandcode(win(50), win(60), { status: 'offline' })], settings)?.stale, true);
  assert.equal(menubarStatus([commandcode(win(50), win(60), { status: 'auth-error' })], settings)?.stale, true);
});

test('twenty accounts: the single red one is chosen, regardless of position', () => {
  const list = Array.from({ length: 20 }, (_, i) => windowsAccount('a' + i, [q('w', '5 小时窗口', 50 + i)]));
  list[17] = windowsAccount('a17', [q('w', '5 小时窗口', 0, { exceeded: true })]);
  assert.equal(menubarStatus(list, settings)?.accountId, 'a17');
});

test('AccountManager.summaries exposes only what the status needs, without credentials', () => {
  const state = {
    status: 'connected',
    parts: { credits: { windows: [] }, balance: undefined, identity: { accountId: 'secret-id' } },
    updatedAt: { credits: 1 },
  };
  const fake = {
    entries: [{ id: 'x', label: 'GLM', provider: 'glm', credential: { apiKey: 'sk-should-not-leak' } }],
    activeId: 'x',
    runtimes: new Map([['x', { monitor: { state } }]]),
  };
  const [s] = AccountManager.prototype.summaries.call(fake);
  assert.equal(s.id, 'x');
  assert.equal(s.active, true);
  assert.equal(s.capabilities?.quota, true);
  assert.deepEqual(Object.keys(s.parts).sort(), ['balance', 'credits', 'subscription', 'summary']);
  assert.equal(JSON.stringify(s).includes('sk-should-not-leak'), false);
  assert.equal(JSON.stringify(s).includes('secret-id'), false);
});
