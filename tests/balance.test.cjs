const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path');
const { normalizeDeepSeek, formatAmount } = require('../desktop/balance-domain.cjs');
const { createClient, BalanceClient } = require('../desktop/providers.cjs');
const { fixtureBody, fixtureFetch } = require('../desktop/provider-fixture.cjs');
const { AccountManager, validateConnection } = require('../desktop/accounts.cjs');
const { UsageMonitor } = require('../desktop/monitor.cjs');
const { LocalStore } = require('../desktop/store.cjs');
const { DEFAULT_SETTINGS, quotaStatus } = require('../desktop/domain.cjs');
const { AnalyticsService } = require('../desktop/analytics-service.cjs');
const key = 'synthetic-deepseek-key-only',
  input = { provider: 'deepseek', region: 'global', apiKey: key },
  sample = () => fixtureBody('deepseek');
const response = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers });
function setup(t, fetchImpl = fixtureFetch) {
  const parent = path.resolve(__dirname, '../work/balance-tests');
  fs.mkdirSync(parent, { recursive: true });
  const root = fs.mkdtempSync(path.join(parent, 'case-')),
    safeStorage = {
      isEncryptionAvailable: () => true,
      encryptString: (s) => Buffer.from(s).reverse(),
      decryptString: (b) => Buffer.from(b).reverse().toString(),
    },
    store = new LocalStore(root, safeStorage),
    accounts = new AccountManager({
      store,
      settings: DEFAULT_SETTINGS,
      clientFactory: (p, r) => createClient(p, r, fetchImpl),
    });
  t.after(() => {
    accounts.dispose();
    assert.ok(path.resolve(root).startsWith(parent + path.sep));
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });
  return { store, accounts };
}
test('official balance sample is independent of quota, tokens and billing and retains decimal strings', () => {
  const result = normalizeDeepSeek({ ...sample(), api_key: key, prompt: 'PRIVATE' });
  assert.deepEqual(result, {
    isAvailable: true,
    source: 'deepseek-official-balance',
    balances: [{ currency: 'CNY', total: '110.00', granted: '10.00', toppedUp: '100.00' }],
  });
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE|synthetic|windows|cost|tokens/);
});
test('decimal formatting never rounds small amounts to zero or loses large integer precision', () => {
  for (const [a, b] of [
    ['0', '0.00'],
    ['0.000001', '0.000001'],
    ['9007199254740993.0123456789', '9,007,199,254,740,993.0123456789'],
    ['-0.00', '0.00'],
    ['-1.1234', '-1.1234'],
    [null, '—'],
  ])
    assert.equal(formatAmount(a), b);
});
test('multiple currencies remain separate and the available flag is not inferred from sums', () => {
  const raw = sample();
  raw.is_available = false;
  raw.balance_infos.push({
    currency: 'USD',
    total_balance: '1.000001',
    granted_balance: '0',
    topped_up_balance: '1.000001',
  });
  const b = normalizeDeepSeek(raw);
  assert.equal(b.balances.length, 2);
  assert.equal(b.isAvailable, false);
  assert.equal(b.balances[1].total, '1.000001');
  assert.equal(b.total, undefined);
});
test('missing components remain unknown, including a missing total, without inferring from components', () => {
  const raw = sample();
  delete raw.balance_infos[0].granted_balance;
  delete raw.balance_infos[0].total_balance;
  const b = normalizeDeepSeek(raw).balances[0];
  assert.equal(b.total, null);
  assert.equal(b.granted, null);
  assert.equal(b.toppedUp, '100.00');
});
test('empty currency list is explicitly unknown, not a fabricated zero balance', () => {
  assert.deepEqual(normalizeDeepSeek({ is_available: false, balance_infos: [] }).balances, []);
  assert.deepEqual(
    quotaStatus({
      hasCredential: true,
      capabilities: { balance: true, quota: false },
      data: { status: 'connected', parts: { balance: { isAvailable: false, balances: [] } } },
    }),
    ['余额条目暂未返回', 'neutral'],
  );
});
test('invalid amounts, currency changes, duplicate currencies and schema changes fail closed', () => {
  for (const value of ['', false, 0, 'NaN', 'Infinity', '1e3', ' 1.2', '1.2.3', '<script>']) {
    const raw = sample();
    raw.balance_infos[0].total_balance = value;
    assert.throws(() => normalizeDeepSeek(raw));
  }
  for (const value of [
    {},
    null,
    { is_available: 'true', balance_infos: [] },
    { is_available: true, balance_infos: [{ currency: 'EUR', total_balance: '1' }] },
    { is_available: true, balance_infos: [{ currency: 'CNY' }] },
    { ...sample(), balance_infos: [...sample().balance_infos, ...sample().balance_infos] },
  ])
    assert.throws(() => normalizeDeepSeek(value));
});
test('only a fixed official HTTPS GET is made with Bearer auth, no redirects or model calls', async () => {
  let calls = 0;
  const client = createClient('deepseek', 'global', async (url, options) => {
    calls++;
    assert.equal(url, 'https://api.deepseek.com/user/balance');
    assert.equal(options.method, 'GET');
    assert.equal(options.headers.Authorization, 'Bearer ' + key);
    assert.equal(options.redirect, 'error');
    assert.equal(options.body, undefined);
    return response(sample());
  });
  const result = await client.usage({ apiKey: key });
  assert.equal(calls, 1);
  assert.deepEqual(client.capabilities, { quota: false, balance: true, usageSummary: false, actualBilling: false });
  assert.ok(result.parts.balance);
  assert.equal(result.parts.credits, undefined);
  assert.doesNotMatch(JSON.stringify(result), /synthetic/);
});
for (const status of [401, 403, 402, 429, 500, 503])
  test('HTTP ' + status + ' is a sanitized query failure, never a zero balance', async () => {
    const result = await createClient('deepseek', 'global', async () =>
      response({ message: key }, status, { 'Retry-After': '900' }),
    ).usage({ apiKey: key });
    assert.deepEqual(result.parts, {});
    assert.equal(result.errors[0].endpoint, 'balance');
    assert.equal(result.errors[0].status, status);
    assert.doesNotMatch(result.errors[0].message, /synthetic/);
    if (status === 429) assert.equal(result.errors[0].retryAfterMs, 900000);
  });
test('network, malformed and oversized bodies never persist raw provider errors', async () => {
  for (const fetchImpl of [
    async () => {
      throw Error(key);
    },
    async () => new Response('PRIVATE'),
    async () => response({ error: { message: key } }),
    async () => new Response('x'.repeat(2000001)),
    async () => response(sample(), 200, { 'content-length': '2000001' }),
  ]) {
    const r = await createClient('deepseek', 'global', fetchImpl).usage({ apiKey: key });
    assert.deepEqual(r.parts, {});
    assert.equal(r.errors.length, 1);
    assert.doesNotMatch(JSON.stringify(r), /PRIVATE|synthetic/);
  }
});
test('balance timeout cancels the request', async () => {
  let aborted = false;
  const c = new BalanceClient(
    'deepseek',
    'global',
    (_url, o) =>
      new Promise((_resolve, reject) =>
        o.signal.addEventListener('abort', () => {
          aborted = true;
          reject(Error(key));
        }),
      ),
    { timeout: 5 },
  );
  const r = await c.usage({ apiKey: key });
  assert.equal(aborted, true);
  assert.equal(r.errors[0].status, 0);
  assert.match(r.errors[0].message, /连接失败/);
});
test('arbitrary API addresses and header injection are rejected', () => {
  assert.throws(() => createClient('deepseek', 'https://proxy.invalid'));
  assert.throws(() => validateConnection({ ...input, apiKey: key + '\r\nHeader: x' }));
});
test('balance-only zero response successfully connects, saves and reloads independently of old accounts', async (t) => {
  const { store, accounts } = setup(t, async (url) =>
    url.includes('deepseek')
      ? response({
          is_available: false,
          balance_infos: [{ currency: 'CNY', total_balance: '0', granted_balance: '0', topped_up_balance: '0' }],
        })
      : fixtureFetch(url),
  );
  const old = await accounts.connect({ provider: 'glm', apiKey: 'synthetic-glm-key' }),
    id = await accounts.connect(input);
  assert.equal(accounts.active.monitor.state.status, 'connected');
  assert.equal(accounts.active.monitor.state.parts.balance.balances[0].total, '0');
  assert.deepEqual(
    quotaStatus({
      hasCredential: true,
      ...accounts.publicState(),
      settings: DEFAULT_SETTINGS,
      data: accounts.active.monitor.snapshot(),
    }),
    ['当前余额不可用于调用', 'amber'],
  );
  assert.equal(accounts.active.history.records.length, 0);
  assert.equal(accounts.active.monitor.state.parts.summary, undefined);
  assert.doesNotMatch(fs.readFileSync(store.file('accounts.encrypted.json'), 'utf8'), /synthetic/);
  assert.doesNotMatch(JSON.stringify(accounts.publicState()), /apiKey|synthetic/);
  const restored = new AccountManager({
    store,
    settings: DEFAULT_SETTINGS,
    clientFactory: (p, r) => createClient(p, r, fixtureFetch),
  });
  t.after(() => restored.dispose());
  restored.load();
  assert.equal(restored.activeId, id);
  assert.equal(restored.entries.length, 2);
  assert.equal(restored.active.monitor.state.parts.balance.balances[0].total, '0');
  restored.select(old);
  assert.ok(restored.active.monitor.state.parts.credits.windows.length);
});
test('429 preserves the last balance and respects Retry-After; recovery replaces rather than sums snapshots', async (t) => {
  let mode = 'sample',
    calls = 0;
  const client = createClient('deepseek', 'global', async () => {
      calls++;
      if (mode === '429') return response({}, 429, { 'Retry-After': '900' });
      const raw = sample();
      if (mode === 'recharge') {
        raw.balance_infos[0].total_balance = '210.00';
        raw.balance_infos[0].topped_up_balance = '200.00';
      }
      return response(raw);
    }),
    m = new UsageMonitor(client, { settings: DEFAULT_SETTINGS, now: () => clock });
  let clock = 1000000;
  t.after(() => m.dispose());
  m.configure({ apiKey: key });
  await m.refresh();
  const at = m.state.updatedAt.balance;
  mode = '429';
  await m.refresh();
  await m.refresh();
  assert.equal(calls, 2);
  assert.equal(m.state.parts.balance.balances[0].total, '110.00');
  assert.equal(m.state.updatedAt.balance, at);
  assert.equal(m.state.status, 'offline');
  clock += 900001;
  mode = 'recharge';
  await m.refresh();
  assert.equal(m.state.parts.balance.balances[0].total, '210.00');
  assert.equal(m.state.parts.summary, undefined);
  assert.equal(m.state.status, 'connected');
});
test('recharge and granted-balance changes generate no quota percentages or false spending alerts', async (t) => {
  let raw = sample(),
    notices = 0;
  const m = new UsageMonitor(
    createClient('deepseek', 'global', async () => response(raw)),
    { settings: DEFAULT_SETTINGS, notify: () => notices++ },
  );
  t.after(() => m.dispose());
  m.configure({ apiKey: key });
  await m.refresh();
  raw.balance_infos[0] = { currency: 'CNY', total_balance: '5.00', granted_balance: '5.00', topped_up_balance: '0.00' };
  await m.refresh();
  assert.equal(notices, 0);
  assert.equal(m.state.parts.credits, undefined);
  assert.equal(m.state.parts.summary, undefined);
  assert.equal(m.state.parts.balance.balances[0].granted, '5.00');
});
test('failed key replacement preserves the saved connection; duplicate key updates while distinct keys stay separate', async (t) => {
  const { store, accounts } = setup(t, async (_url, o) =>
    o.headers.Authorization.includes('bad') ? response({}, 401) : response(sample()),
  );
  const id = await accounts.connect(input),
    before = fs.readFileSync(store.file('accounts.encrypted.json'));
  await assert.rejects(accounts.connect({ ...input, accountId: id, apiKey: 'synthetic-bad-key' }));
  assert.deepEqual(fs.readFileSync(store.file('accounts.encrypted.json')), before);
  assert.equal(await accounts.connect({ ...input, label: 'renamed' }), id);
  await accounts.connect({ ...input, apiKey: 'synthetic-second-key' });
  assert.equal(accounts.entries.length, 2);
  assert.equal(accounts.runtimes.get(id).monitor.state.parts.balance.balances[0].total, '110.00');
});
test('balance account has no fabricated account analytics or borrowed tool attribution', async (t) => {
  const { store, accounts } = setup(t);
  await accounts.connect(input);
  const active = accounts.active,
    service = new AnalyticsService({ store, monitor: active.monitor, client: active.client, history: active.history });
  const r = await service.get({ source: 'account', range: 'today' });
  assert.equal(r.status, 'unavailable');
  assert.equal(r.summary, null);
  assert.equal(r.prediction, null);
  assert.equal(r.credits, null);
  assert.match(r.message, /余额变化不是实际消费/);
  assert.equal(active.history.records.length, 0);
});
