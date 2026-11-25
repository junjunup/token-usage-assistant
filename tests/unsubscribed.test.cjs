// T20.1 (D27 ①): a Command Code account whose plan was cancelled is "未订阅", not an exhausted balance alert, and it
// never pushes an account in use out of the menu bar.
const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULT_SETTINGS, quotaStatus, unsubscribed } = require('../desktop/domain.cjs');
const { menubarStatus, rankAccounts, slotsOf } = require('../desktop/menubar-status.cjs');
const { panelAccount } = require('../desktop/menubar-panel.cjs');
const { accountOverview } = require('../desktop/account-overview.cjs');

const settings = { threshold: 20 };
const unlimited = {
  used: null,
  cap: null,
  remainingPercent: null,
  usedPercent: null,
  resetAt: null,
  resetState: 'unlimited',
  unlimited: true,
  exceeded: false,
};
// The shape Command Code returns after the plan is cancelled: no subscription, unlimited windows, every credit zero.
const cancelled = (
  credits = {},
  subscription = { active: false, status: 'none', planId: null, start: null, end: null },
) => ({
  id: 'cc',
  label: 'Command Code',
  provider: 'commandcode',
  active: true,
  capabilities: { quota: true, balance: true },
  status: 'connected',
  parts: {
    credits: { five: unlimited, week: unlimited, monthly: 0, purchased: 0, free: 0, total: 0, ...credits },
    ...(subscription ? { subscription } : {}),
  },
  updatedAt: { credits: 1, subscription: 1 },
});
const claude = (five, week) => ({
  id: 'claude',
  label: 'Claude',
  provider: 'claude',
  active: false,
  capabilities: { quota: true, balance: false },
  status: 'connected',
  parts: {
    credits: {
      windows: [
        {
          id: 'claude:five_hour',
          label: '5 小时窗口',
          applicable: true,
          remainingPercent: five,
          resetAt: 2,
          resetState: 'scheduled',
        },
        {
          id: 'claude:seven_day',
          label: '每周窗口',
          applicable: true,
          remainingPercent: week,
          resetAt: 3,
          resetState: 'scheduled',
        },
      ],
    },
  },
  updatedAt: { credits: 1 },
});

test('T20.1: only an explicit inactive subscription with nothing left is unsubscribed', () => {
  assert.equal(unsubscribed(cancelled().parts), true);
  // A failed subscription query is not read as "no plan".
  assert.equal(unsubscribed(cancelled({}, null).parts), false);
  // Any credit left keeps the balance rules.
  assert.equal(unsubscribed(cancelled({ purchased: 5, total: 5 }).parts), false);
  assert.equal(unsubscribed(cancelled({ free: 0.5, total: 0.5 }).parts), false);
  assert.equal(unsubscribed(cancelled({ monthly: 3, total: 3 }).parts), false);
  // Unknown amounts are not zero.
  assert.equal(unsubscribed(cancelled({ purchased: null }).parts), false);
  // An active plan whose balance ran out is still the red "exhausted" case.
  assert.equal(
    unsubscribed(cancelled({}, { active: true, status: 'active', planId: 'p', start: 1, end: 2 }).parts),
    false,
  );
  // Windowed platforms never take this path.
  assert.equal(unsubscribed(claude(50, 50).parts), false);
  assert.equal(unsubscribed(undefined), false);
});

test('T20.1: the account status says 未订阅 in a neutral tone, not an exhausted balance', () => {
  const state = (a) => ({ data: { status: 'connected', ...a }, hasCredential: true, settings: DEFAULT_SETTINGS });
  assert.deepEqual(quotaStatus(state(cancelled())), ['未订阅', 'neutral']);
  assert.deepEqual(quotaStatus(state(cancelled({ purchased: 5, total: 5 }))), ['月额度已用尽 · 有购买余额', 'amber']);
  assert.deepEqual(
    quotaStatus(state(cancelled({}, { active: true, status: 'active', planId: 'p', start: 1, end: 2 }))),
    ['可用余额已用尽', 'red'],
  );
});

test('T20.1: one neutral 未订阅 slot, without the plan-less unlimited windows', () => {
  const slots = slotsOf(cancelled(), 20);
  assert.deepEqual(
    slots.map((s) => [s.id, s.text, s.tone, s.ratio]),
    [['plan', '未订阅', 'normal', null]],
  );
  const s = menubarStatus([cancelled()], settings);
  assert.equal(s?.text, '未订阅');
  assert.equal(s?.tone, 'normal');
  assert.equal(s?.ring, null);
});

test('T20.1: the menu bar shows the account in use, not the cancelled plan', () => {
  // Before: the cancelled plan's $0 read as a red alert and always came first.
  const list = [cancelled(), claude(91, 72)];
  assert.equal(menubarStatus(list, settings)?.accountId, 'claude');
  assert.equal(menubarStatus(list, settings)?.text, '72%');
  // It goes after every other account, even one with no data and even when it is the current account.
  const empty = { ...claude(null, null), id: 'empty', parts: {} };
  assert.deepEqual(
    rankAccounts([cancelled(), empty], 20, { preferActive: true }).map((r) => r.a.id),
    ['empty', 'cc'],
  );
  // Alone, it is still shown, honestly.
  assert.equal(menubarStatus([cancelled()], settings)?.accountId, 'cc');
});

test('T20.1: panel, overview cards and attention count agree', () => {
  const p = panelAccount(cancelled(), 20);
  assert.deepEqual(p.chip, { text: '未订阅', tone: 'normal' });
  assert.deepEqual(p.cells.balance, { value: '未订阅', unit: '套餐', note: '账户接口', tone: 'normal' });
  assert.deepEqual(p.rows, []);
  const o = accountOverview([cancelled(), claude(91, 72)], settings);
  assert.deepEqual(
    o.rows.map((r) => [r.id, r.tone, r.focus?.text]),
    [
      ['claude', 'normal', '72%'],
      ['cc', 'normal', '未订阅'],
    ],
  );
  assert.equal(o.attention, 0);
});
