const test = require('node:test');
const assert = require('node:assert/strict');
const { accountOverview } = require('../desktop/account-overview.cjs');
const { menubarStatus } = require('../desktop/menubar-status.cjs');
const { compactAmount, formatAmount } = require('../desktop/balance-domain.cjs');

// T11.1: the all-accounts view. Ranking and per-account values come from desktop/menubar-status.cjs (T7.9).
const settings = { threshold: 20 };
const H = 3600000;
const win = (id, label, remainingPercent, extra = {}) => ({
  id,
  label,
  applicable: true,
  used: null,
  cap: null,
  remainingPercent,
  usedPercent: remainingPercent === null ? null : 100 - remainingPercent,
  resetAt: Date.UTC(2026, 9, 30, 12),
  resetState: 'scheduled',
  unlimited: false,
  exceeded: false,
  ...extra,
});
const quota = (id, windows, extra = {}) => ({
  id,
  label: id,
  provider: 'glm',
  active: false,
  capabilities: { quota: true, balance: false },
  status: 'connected',
  parts: { credits: { windows } },
  updatedAt: { credits: Date.UTC(2026, 9, 30, 9) },
  ...extra,
});
const balance = (id, balances, isAvailable = true, extra = {}) => ({
  id,
  label: id,
  provider: 'deepseek',
  active: false,
  capabilities: { quota: false, balance: true },
  status: 'connected',
  parts: { balance: { isAvailable, balances } },
  updatedAt: { balance: Date.UTC(2026, 9, 30, 9) },
  ...extra,
});
const commandcode = (five, week, monthly, extra = {}) => ({
  id: 'cc',
  label: 'Command Code',
  provider: 'commandcode',
  active: false,
  capabilities: { quota: true, balance: true },
  status: 'connected',
  parts: {
    credits: { five, week, monthly, purchased: null, free: null, total: null },
    subscription: { plan: { monthlyCredits: 100 }, start: Date.UTC(2026, 9, 1), end: Date.UTC(2026, 10, 1) },
  },
  updatedAt: { credits: Date.UTC(2026, 9, 30, 9) },
  ...extra,
});
const ids = (o) => o.rows.map((r) => r.id);

test('T11.1: alerts first (red, then amber resetting first), then the least left; ties keep list order', () => {
  const o = accountOverview(
    [
      quota('plenty', [win('a', '5 小时窗口', 80)]),
      quota('amber-late', [win('a', '5 小时窗口', 10, { resetAt: 50 * H })]),
      quota('low', [win('a', '5 小时窗口', 30)]),
      quota('red', [win('a', '5 小时窗口', 0, { exceeded: true })]),
      quota('amber-soon', [win('a', '5 小时窗口', 15, { resetAt: 10 * H })]),
      quota('low-twin', [win('a', '5 小时窗口', 30)]),
    ],
    settings,
  );
  assert.deepEqual(ids(o), ['red', 'amber-soon', 'amber-late', 'low', 'low-twin', 'plenty']);
  assert.equal(o.attention, 3);
  assert.deepEqual(
    o.rows.map((r) => r.tone),
    ['red', 'amber', 'amber', 'normal', 'normal', 'normal'],
  );
});

test('T11.1: choosing an account never reorders the list; the menu-bar icon alone prefers the current account', () => {
  const list = (active) => [
    quota('first', [win('a', '5 小时窗口', 70)], { active: active === 'first' }),
    quota('second', [win('a', '5 小时窗口', 70)], { active: active === 'second' }),
  ];
  assert.deepEqual(ids(accountOverview(list('first'), settings)), ['first', 'second']);
  assert.deepEqual(ids(accountOverview(list('second'), settings)), ['first', 'second']);
  assert.equal(menubarStatus(list('second'), settings)?.accountId, 'second');
  assert.equal(accountOverview(list('second'), settings).rows[1].active, true);
});

test('T11.1: the value per account is the icon rule — windows first, money as fallback or when it alerts more', () => {
  const healthy = commandcode(win('five', '', 62), win('week', '', 40), 45.5);
  const row = accountOverview([healthy], settings).rows[0];
  assert.equal(row.focus?.kind, 'window');
  assert.equal(row.focus?.id, 'week');
  assert.equal(row.focus?.text, '40%');
  // An exhausted monthly balance must never read as plenty left (AGENTS §2).
  const exhausted = accountOverview([commandcode(win('five', '', 62), win('week', '', 40), 0)], settings).rows[0];
  assert.equal(exhausted.focus?.id, 'monthly');
  assert.equal(exhausted.tone, 'red');
  assert.equal(exhausted.focus?.text, '$0.00');
  // Balance-only accounts fall back to money; currencies stay apart, nothing is summed or converted.
  const two = accountOverview(
    [
      balance('ds', [
        { currency: 'CNY', total: '49.58894' },
        { currency: 'USD', total: '0.004' },
      ]),
    ],
    settings,
  ).rows[0];
  assert.equal(two.focus?.kind, 'balance');
  assert.equal(two.focus?.label, 'CNY 余额');
  assert.equal(two.focus?.text, '¥49.59');
  assert.equal(two.focus?.percent, null);
});

test('T11.1: missing data stays a dash and is ranked last; resetAt=0 reads 未启用 and is not a usable window', () => {
  const o = accountOverview(
    [
      quota('empty', [], { updatedAt: {} }),
      quota('unknown', [win('a', '5 小时窗口', null)]),
      quota('idle', [win('a', '5 小时窗口', 100, { resetAt: null, resetState: 'idle' })]),
      quota('known', [win('a', '5 小时窗口', 90)]),
    ],
    settings,
  );
  assert.equal(o.rows[0].id, 'known');
  const byId = Object.fromEntries(o.rows.map((r) => [r.id, r]));
  assert.equal(byId.empty.focus, null);
  assert.equal(byId.empty.synced, false);
  assert.equal(byId.empty.updatedAt, null);
  assert.equal(byId.unknown.focus?.text, '—');
  assert.equal(byId.unknown.focus?.percent, null);
  assert.equal(byId.idle.focus?.text, '未启用');
  assert.equal(byId.idle.focus?.percent, null);
  assert.equal(byId.idle.focus?.resetAt, null);
  assert.equal(o.attention, 0);
});

test('T11.1: a failed account keeps its last values with their time and is marked stale', () => {
  const failed = quota('failed', [win('a', '5 小时窗口', 35)], {
    status: 'offline',
    updatedAt: { credits: Date.UTC(2026, 9, 30, 8), identity: Date.UTC(2026, 9, 30, 7) },
  });
  const row = accountOverview([failed], settings).rows[0];
  assert.equal(row.stale, true);
  assert.equal(row.synced, true);
  assert.equal(row.updatedAt, Date.UTC(2026, 9, 30, 8));
  assert.equal(row.focus?.text, '35%');
  const never = accountOverview([quota('never', [], { status: 'auth-error', updatedAt: {} })], settings).rows[0];
  assert.equal(never.stale, true);
  assert.equal(never.synced, false);
  assert.equal(never.focus, null);
});

test('T11.1: twenty accounts are all listed once, the most urgent first; no accounts is an empty list', () => {
  const many = Array.from({ length: 20 }, (_, i) => quota('a' + i, [win('w', '5 小时窗口', (i * 37) % 100)]));
  const o = accountOverview(many, settings);
  assert.equal(o.rows.length, 20);
  assert.equal(new Set(ids(o)).size, 20);
  const left = o.rows.map((r) => r.focus?.percent ?? Infinity);
  // Below the threshold alerts (amber) come first, then the rest by least left.
  const amber = o.rows.filter((r) => r.tone === 'amber').length;
  assert.deepEqual(
    left.slice(amber),
    [...left.slice(amber)].sort((x, y) => x - y),
  );
  assert.ok(left.slice(0, amber).every((p) => p < 20));
  assert.deepEqual(accountOverview([], settings), { threshold: 20, attention: 0, rows: [] });
  assert.deepEqual(accountOverview(/** @type {any} */ (undefined), settings).rows, []);
});

test('D17 ④: compact amounts round half away from zero to two decimals; non-zero below 0.01 is "<0.01"', () => {
  for (const [value, text] of [
    ['0', '0.00'],
    [0, '0.00'],
    ['0.004', '<0.01'],
    ['0.0049', '<0.01'],
    ['0.005', '0.01'],
    ['1.005', '1.01'],
    [1.005, '1.01'],
    ['49.58894', '49.59'],
    ['-5.2', '-5.20'],
    ['-0.004', '-<0.01'],
    ['-0.000', '0.00'],
    [1e-9, '<0.01'],
    ['9007199254740993.995', '9,007,199,254,740,994.00'],
    ['1234567.994', '1,234,567.99'],
    [null, '—'],
    ['not a number', '—'],
    [Number.NaN, '—'],
  ])
    assert.equal(compactAmount(value), text, String(value));
  // Details keep every digit.
  assert.equal(formatAmount('49.58894'), '49.58894');
});
