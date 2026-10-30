const test = require('node:test');
const assert = require('node:assert/strict');
const { panelState, paceLine } = require('../desktop/menubar-panel.cjs');
const { menubarStatus } = require('../desktop/menubar-status.cjs');

// T11.3 (D17): folded cells, the window behind the chip always listed, compact chip amounts, the pace line.
const settings = { threshold: 20 };
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
const quota = (id, provider, windows, extra = {}) => ({
  id,
  label: id,
  provider,
  active: false,
  capabilities: { quota: true, balance: false },
  status: 'connected',
  parts: { credits: { windows } },
  updatedAt: { credits: 1000 },
  ...extra,
});
const balance = (id, balances) => ({
  id,
  label: id,
  provider: 'kimi',
  active: false,
  capabilities: { quota: false, balance: true },
  status: 'connected',
  parts: { balance: { isAvailable: true, balances } },
  updatedAt: { balance: 1000 },
});
const commandcode = (prediction) => ({
  id: 'cc',
  label: 'Command Code',
  provider: 'commandcode',
  active: true,
  capabilities: { quota: true, balance: true },
  status: 'connected',
  parts: {
    credits: {
      five: win('five', '', 62, { used: 38, cap: 100 }),
      week: win('week', '', 78, { used: 22, cap: 100 }),
      monthly: 0.004,
      purchased: 0,
      free: 0,
      total: 0.004,
    },
    summary: { total: 1240000, cost: 3.18, scope: 'billing' },
  },
  updatedAt: { credits: 1000, summary: 2000 },
  prediction,
});

test('T11.3: cells the platform does not provide are folded; none at all leaves no cells', () => {
  const [cc, glm, kimi] = panelState(
    [
      commandcode(null),
      quota('glm', 'glm', [win('a', '5 小时窗口', 50)]),
      balance('kimi', [{ currency: 'CNY', total: '49.58894' }]),
    ],
    settings,
  ).accounts;
  assert.deepEqual(cc.shownCells, ['tokens', 'cost', 'balance']);
  assert.deepEqual(glm.shownCells, []);
  assert.deepEqual(kimi.shownCells, ['balance']);
  // The folded cells are still in the model with their reason; only the panel stops drawing them.
  assert.equal(glm.cells.tokens.note, '平台未提供');
});

test('T11.3: the window the chip stands for is always among the rows, even fourth in the platform order', () => {
  const windows = [
    win('a', '5 小时窗口', 75),
    win('b', '周窗口', 78),
    win('c', '月窗口', 70),
    win('d', '近一月窗口', 57),
  ];
  const [a] = panelState([quota('volc', 'volcengine', windows)], settings).accounts;
  assert.equal(a.chip.text, '57%');
  assert.deepEqual(
    a.rows.map((r) => r.text),
    ['75%', '78%', '57%'],
  );
  assert.equal(a.more, 1);
});

test('D17 ④: chips and the menu-bar icon show money at two decimals; rows and cells keep every digit', () => {
  const kimi = balance('kimi', [{ currency: 'CNY', total: '49.58894' }]);
  const [a] = panelState([kimi], settings).accounts;
  assert.equal(a.chip.text, '¥49.59');
  assert.equal(a.balances[0].text, '¥49.58894');
  assert.equal(a.cells.balance.value, '¥49.58894');
  assert.equal(menubarStatus([kimi], settings)?.text, '¥49.59');
  const tiny = panelState([balance('k', [{ currency: 'USD', total: '0.004' }])], settings).accounts[0];
  assert.equal(tiny.chip.text, '$<0.01');
  // Command Code's monthly credits: a non-zero amount below 0.01 never reads "$0.00".
  const [cc] = panelState([commandcode(null)], settings).accounts;
  assert.equal(cc.cells.balance.value, '$<0.01');
});

test('T11.3: the pace line condenses the existing forecast; unknown stays a dash with the reason', () => {
  assert.equal(paceLine(null), null);
  assert.deepEqual(paceLine({ available: false, reason: '需要至少 10 分钟连续且新鲜的账户采样', windows: [] }), {
    tone: 'normal',
    text: '—',
    reason: '需要至少 10 分钟连续且新鲜的账户采样',
  });
  const p = (windows) => ({ available: true, minutes: 42.4, windows });
  assert.deepEqual(
    paceLine(
      p([
        { key: 'five', status: 'before-reset', minutesToCap: 110 },
        { key: 'week', status: 'before-reset', minutesToCap: 900 },
      ]),
    ),
    { tone: 'amber', text: '按最近 42 分钟的速度，5 小时窗口约 1 小时 50 分钟后触顶（早于重置）', reason: null },
  );
  assert.equal(
    paceLine(p([{ key: 'week', status: 'before-reset', minutesToCap: 9.2 }]))?.text.includes('约 10 分钟后'),
    true,
  );
  assert.deepEqual(
    paceLine(
      p([
        { key: 'five', status: 'at-limit' },
        { key: 'week', status: 'before-reset', minutesToCap: 5 },
      ]),
    ),
    {
      tone: 'red',
      text: '5 小时窗口已达上限',
      reason: null,
    },
  );
  assert.equal(
    paceLine(
      p([
        { key: 'five', status: 'after-reset' },
        { key: 'week', status: 'idle' },
      ]),
    )?.text,
    '按最近 42 分钟的速度，重置前不会触顶',
  );
  assert.equal(
    paceLine(
      p([
        { key: 'five', status: 'idle' },
        { key: 'week', status: 'insufficient' },
      ]),
    )?.text,
    '近期未新增消耗',
  );
  assert.deepEqual(
    paceLine(
      p([
        { key: 'five', status: 'insufficient' },
        { key: 'week', status: 'insufficient' },
      ]),
    ),
    {
      tone: 'normal',
      text: '—',
      reason: '窗口的连续样本不足',
    },
  );
});

test('T11.3: only Command Code has a pace line; other platforms get none even with a forecast attached', () => {
  const prediction = { available: true, minutes: 30, windows: [{ key: 'five', status: 'after-reset' }] };
  const [cc, glm] = panelState(
    [commandcode(prediction), quota('glm', 'glm', [win('a', '5 小时窗口', 50)], { prediction })],
    settings,
  ).accounts;
  assert.equal(cc.pace?.text, '按最近 30 分钟的速度，重置前不会触顶');
  assert.equal(glm.pace, null);
  // No forecast at all (for example the account was never sampled): no line, not an invented one.
  assert.equal(panelState([commandcode(undefined)], settings).accounts[0].pace, null);
});
