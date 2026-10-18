const test = require('node:test');
const assert = require('node:assert/strict');
const { panelState, summaryCells, compact } = require('../desktop/menubar-panel.cjs');

const settings = { threshold: 20 };
const win = (remainingPercent, extra = {}) => ({
  used: 10,
  cap: 100,
  remainingPercent,
  usedPercent: remainingPercent === null ? null : 100 - remainingPercent,
  resetAt: Date.UTC(2026, 9, 18, 12),
  resetState: 'scheduled',
  unlimited: false,
  exceeded: false,
  ...extra,
});
const commandcode = (extra = {}) => ({
  id: 'cc',
  label: 'Command Code',
  provider: 'commandcode',
  active: true,
  capabilities: { quota: true, balance: true },
  status: 'connected',
  parts: {
    credits: { five: win(62), week: win(78), monthly: 12.5, purchased: 0, free: 0, total: 12.5 },
    summary: { total: 1240000, cost: 3.18, scope: 'billing' },
  },
  updatedAt: { credits: 1000, summary: 2000 },
  ...extra,
});
const glm = (windows, extra = {}) => ({
  id: 'glm',
  label: 'GLM',
  provider: 'glm',
  active: false,
  capabilities: { quota: true, balance: false },
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

test('opens on the account the menu-bar icon shows', () => {
  const s = panelState([commandcode(), glm([q('g', '5 小时窗口', 0, { exceeded: true })])], settings);
  assert.equal(s.defaultAccountId, 'glm');
  assert.equal(s.accounts.length, 2);
  assert.equal(panelState([], settings).defaultAccountId, null);
});

test('Command Code: windows with reset fields, account-interface Token and cost, monthly credits as balance', () => {
  const [a] = panelState([commandcode()], settings).accounts;
  assert.deepEqual(
    a.rows.map((r) => [r.label, r.text, r.tone]),
    [
      ['5 小时窗口', '62%', 'normal'],
      ['每周窗口', '78%', 'normal'],
    ],
  );
  assert.equal(a.rows[0].window?.resetState, 'scheduled');
  assert.deepEqual(a.cells.tokens, { value: '1.24M', unit: '本账期 Token', note: '账户接口', tone: 'normal' });
  assert.deepEqual(a.cells.cost, { value: '$3.18', unit: '本账期费用', note: '平台返回', tone: 'normal' });
  assert.deepEqual(a.cells.balance, { value: '$12.50', unit: '月度余额', note: '账户接口', tone: 'normal' });
  assert.equal(a.updatedAt, 2000);
  assert.equal(a.stale, false);
});

test('platforms without a usage summary or balance show a dash with the reason, never 0', () => {
  const [a] = panelState([glm([q('g', '5 小时窗口', 40)])], settings).accounts;
  for (const cell of [a.cells.tokens, a.cells.cost, a.cells.balance]) {
    assert.equal(cell.value, '—');
    assert.equal(cell.note, '平台未提供');
  }
  assert.equal(summaryCells(undefined).tokens.value, '—');
  assert.equal(summaryCells({ total: 0, cost: 0, scope: 'history' }).tokens.value, '0');
  assert.equal(summaryCells({ total: 0, cost: 0, scope: 'history' }).cost.unit, '累计费用');
});

test('at most three rows, keeping the most urgent window and counting the rest', () => {
  const [a] = panelState(
    [
      glm([
        q('a', '5 小时窗口', 80),
        q('b', '每周窗口', 70),
        q('c', '月窗口', 60),
        q('d', '工具月额度', 0, { exceeded: true }),
        q('e', '额度窗口 5', 90),
      ]),
    ],
    settings,
  ).accounts;
  assert.deepEqual(
    a.rows.map((r) => r.id),
    ['a', 'b', 'd'],
  );
  assert.equal(a.more, 2);
  assert.deepEqual(a.chip, { text: '0%', tone: 'red' });
});

test('balance accounts: original currency, availability flag, no gauge rows', () => {
  const ds = {
    id: 'ds',
    label: 'DeepSeek',
    provider: 'deepseek',
    active: false,
    capabilities: { quota: false, balance: true },
    status: 'offline',
    parts: {
      balance: {
        isAvailable: false,
        balances: [
          { currency: 'CNY', total: '86.4' },
          { currency: 'USD', total: '2' },
        ],
      },
    },
  };
  const [a] = panelState([ds], settings).accounts;
  assert.deepEqual(a.rows, []);
  assert.deepEqual(a.balances, [
    { currency: 'CNY', text: '¥86.40' },
    { currency: 'USD', text: '$2.00' },
  ]);
  assert.equal(a.available, false);
  assert.equal(a.cells.balance.value, '¥86.40');
  assert.equal(a.cells.balance.unit, '余额（另有 1 种币种）');
  assert.equal(a.cells.balance.tone, 'amber');
  assert.equal(a.stale, true);
});

test('compact numbers', () => {
  assert.equal(compact(1240000), '1.24M');
  assert.equal(compact(15300), '15.3K');
  assert.equal(compact(999), '999');
  assert.equal(compact(2500000000), '2.5B');
});

test('T7.10: the stale notice only promises earlier values when there were any', () => {
  const notice = (a) => panelState([a], settings).accounts[0].notice;
  assert.equal(notice(commandcode()), null);
  assert.equal(notice(commandcode({ status: 'offline' })), '数据未更新，显示的是上次成功的值。');
  assert.equal(notice(commandcode({ status: 'stale', parts: {}, updatedAt: {} })), '尚未同步成功，暂无数据。');
  assert.equal(
    notice(commandcode({ status: 'auth-error', parts: {}, updatedAt: undefined })),
    '尚未同步成功，暂无数据。',
  );
});

test('T7.11: the account chip says what the menu-bar icon says (quota windows first, money as the fallback)', () => {
  const { menubarStatus } = require('../desktop/menubar-status.cjs');
  const idle = { remainingPercent: null, resetAt: 0, resetState: 'idle' };
  const billing = {
    subscription: { active: true, start: '2026-10-01', end: Date.UTC(2026, 10, 1) },
    summary: { scope: 'billing', periodStart: '2026-10-01', funding: { monthly: 51.94 }, total: 12400, cost: 51.94 },
  };
  const cc = (five, week, monthly) =>
    commandcode({
      parts: { credits: { five, week, monthly, purchased: 0, free: 0, total: monthly }, ...billing },
      updatedAt: { credits: 1, summary: 1 },
    });
  for (const [a, text] of [
    [cc(win(100), win(100), 18.06), '100%'], // real device: monthly 25.8% left, windows 100%
    [cc(win(null, idle), win(72), 18.06), '72%'],
    [cc(win(null, idle), win(null, idle), 18.06), '$18.06'],
    [cc(win(90), win(95), 0), '$0.00'],
  ]) {
    const chip = panelState([a], settings).accounts[0].chip;
    const icon = menubarStatus([a], settings);
    assert.equal(chip.text, text);
    assert.deepEqual(chip, { text: icon?.text, tone: icon?.tone });
  }
});
