// T14.2 (D21): balance reminder amounts — per currency, compared on decimal digits, never converted; below the amount
// is amber everywhere the menu-bar rule applies, notifies once per crossing, and unknown amounts are never "below".
const test = require('node:test');
const assert = require('node:assert/strict');
const { belowAmount } = require('../desktop/balance-domain.cjs');
const { DEFAULT_SETTINGS, patchSettings, quotaStatus, AlertTracker, balancesBelow } = require('../desktop/domain.cjs');
const { menubarStatus, slotsOf } = require('../desktop/menubar-status.cjs');
const { accountOverview } = require('../desktop/account-overview.cjs');
const { panelState } = require('../desktop/menubar-panel.cjs');
const { statusSnapshot } = require('../desktop/status-snapshot.cjs');

test('T14.2: decimal comparison without floating point; missing or malformed is never below', () => {
  assert.equal(belowAmount('9.99', '10'), true);
  assert.equal(belowAmount('10', '10'), false, 'equal is not below');
  assert.equal(belowAmount('10.00000000000000001', '10'), false);
  assert.equal(belowAmount('9.99999999999999999', '10'), true);
  assert.equal(belowAmount('0.1', '0.3'), true);
  assert.equal(belowAmount('-3.5', '0'), true);
  assert.equal(belowAmount('1234567.5', '1000'), false);
  assert.equal(belowAmount(null, '10'), null);
  assert.equal(belowAmount('1e3', '10'), null);
  assert.equal(belowAmount('5', ''), null, 'no amount set: no reminder');
  assert.equal(belowAmount('5', undefined), null);
});

test('T14.2: settings default to no reminder and accept only plain amounts with up to two decimals', () => {
  assert.equal(DEFAULT_SETTINGS.balanceThresholdCNY, '');
  assert.equal(DEFAULT_SETTINGS.balanceThresholdUSD, '');
  const s = patchSettings(DEFAULT_SETTINGS, { balanceThresholdCNY: '10', balanceThresholdUSD: '2.5' });
  assert.deepEqual([s.balanceThresholdCNY, s.balanceThresholdUSD], ['10', '2.5']);
  assert.equal(patchSettings(s, { balanceThresholdCNY: '' }).balanceThresholdCNY, '');
  for (const bad of ['-1', '1.234', '01', 'abc', 10, null, '1e3', ' 5'])
    assert.throws(() => patchSettings(s, { balanceThresholdCNY: bad }), /设置值不正确/, String(bad));
});

const balanceAccount = (total, extra = {}) => ({
  id: 'ds',
  label: 'DeepSeek',
  provider: 'deepseek',
  active: false,
  capabilities: { quota: false, balance: true },
  status: 'connected',
  parts: {
    balance: { isAvailable: true, balances: [{ currency: 'CNY', total, granted: null, toppedUp: null }], ...extra },
  },
  updatedAt: { balance: 1 },
});
const quotaAccount = {
  id: 'glm',
  label: 'GLM',
  provider: 'glm',
  active: true,
  capabilities: { quota: true, balance: false },
  status: 'connected',
  parts: {
    credits: {
      windows: [
        {
          id: 'five',
          label: '5 小时窗口',
          remainingPercent: 60,
          resetAt: 2,
          resetState: 'scheduled',
          applicable: true,
        },
      ],
    },
  },
  updatedAt: { credits: 1 },
};

test('T14.2: below the amount reads amber in the status, the menu bar, the overview, the panel and the snapshot', () => {
  const settings = { ...DEFAULT_SETTINGS, balanceThresholdCNY: '50' };
  const state = (total) => ({
    hasCredential: true,
    capabilities: { quota: false, balance: true },
    settings,
    data: { status: 'connected', parts: { balance: balanceAccount(total).parts.balance } },
  });
  assert.deepEqual(quotaStatus(state('49.58894')), ['余额低于提醒金额', 'amber']);
  assert.deepEqual(quotaStatus(state('50')), ['有可用余额', 'green']);
  assert.deepEqual(quotaStatus({ ...state('49'), settings: DEFAULT_SETTINGS }), ['有可用余额', 'green']);
  // USD amounts never use the CNY reminder (no conversion).
  assert.deepEqual(balancesBelow({ balances: [{ currency: 'USD', total: '1' }] }, settings), []);

  const low = balanceAccount('49.58894');
  assert.equal(slotsOf(low, 20, { CNY: '50' })[0].tone, 'amber');
  assert.equal(slotsOf(low, 20)[0].tone, 'normal', 'no amount: only the platform flag');
  // The amber balance account outranks a healthy quota account.
  const status = menubarStatus([quotaAccount, low], settings);
  assert.deepEqual([status.accountId, status.tone, status.text], ['ds', 'amber', '¥49.59']);
  assert.equal(menubarStatus([quotaAccount, low], DEFAULT_SETTINGS).accountId, 'glm');
  assert.equal(accountOverview([quotaAccount, low], settings).rows[0].id, 'ds');
  assert.equal(accountOverview([quotaAccount, low], settings).attention, 1);
  assert.equal(panelState([quotaAccount, low], settings).defaultAccountId, 'ds');
  assert.equal(statusSnapshot([quotaAccount, low], settings, 1000).accounts[0].id, 'ds');
});

test('T14.2: one notification per crossing; back above or the amount cleared re-arms it; missing totals are skipped', () => {
  const tracker = new AlertTracker();
  const settings = { ...DEFAULT_SETTINGS, balanceThresholdCNY: '10' };
  const b = (total) => ({ isAvailable: true, balances: [{ currency: 'CNY', total }] });
  assert.deepEqual(tracker.checkBalance(b('9.5'), settings), [
    { key: 'balance:CNY', level: 1, currency: 'CNY', total: '9.5', threshold: '10' },
  ]);
  assert.deepEqual(tracker.checkBalance(b('8'), settings), [], 'still below: no repeat');
  assert.deepEqual(tracker.checkBalance(b(null), settings), [], 'unknown total: no change');
  assert.deepEqual(tracker.checkBalance(b('12'), settings), []);
  assert.equal(tracker.checkBalance(b('3'), settings).length, 1, 'crossing again notifies again');
  assert.deepEqual(tracker.checkBalance(b('3'), { ...settings, notifications: false }), []);
  assert.deepEqual(tracker.checkBalance(b('3'), DEFAULT_SETTINGS), [], 'no amount: no reminder');
  assert.equal(tracker.checkBalance(b('3'), settings).length, 1, 'setting the amount again re-arms');
});
