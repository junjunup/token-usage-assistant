// T10.1 (D16): Kimi open platform balance — synthetic samples in the official shape only, never a real account.
const test = require('node:test'),
  assert = require('node:assert/strict');
const { normalizeKimi, formatAmount } = require('../desktop/balance-domain.cjs');
const { createClient } = require('../desktop/providers.cjs');
const { fixtureBody } = require('../desktop/provider-fixture.cjs');
const { providerDefinition } = require('../desktop/providers/index.cjs');
const { quotaStatus } = require('../desktop/domain.cjs');
const { slotsOf } = require('../desktop/menubar-status.cjs');
const { validateConnection } = require('../desktop/accounts.cjs');
const key = 'synthetic-kimi-key-only';
const response = (body, status = 200) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
const sample = (data) => ({ code: 0, data, scode: '0x0', status: true });

test('the official sample keeps every digit as a decimal string; the site decides the currency', () => {
  const cn = normalizeKimi(fixtureBody('kimi'), 'CNY');
  assert.deepEqual(cn, {
    isAvailable: true,
    balances: [{ currency: 'CNY', total: '49.58894', voucher: '46.58893', cash: '3.00001', arrears: false }],
    source: 'kimi-official-balance',
  });
  assert.equal(normalizeKimi(fixtureBody('kimi'), 'USD').balances[0].currency, 'USD');
  assert.equal(formatAmount(cn.balances[0].total), '49.58894');
  assert.throws(() => normalizeKimi(fixtureBody('kimi'), 'EUR'));
});

test('negative cash is arrears; zero or negative available balance is not usable (not a failed query)', () => {
  const arrears = normalizeKimi(sample({ available_balance: 12.5, voucher_balance: 12.5, cash_balance: -3.2 }), 'CNY');
  assert.deepEqual(arrears.balances[0], {
    currency: 'CNY',
    total: '12.5',
    voucher: '12.5',
    cash: '-3.2',
    arrears: true,
  });
  assert.equal(arrears.isAvailable, true);
  for (const available of [0, -0, -1.08]) {
    const r = normalizeKimi(sample({ available_balance: available, voucher_balance: 0, cash_balance: -1.08 }), 'CNY');
    assert.equal(r.isAvailable, false);
    assert.equal(r.balances[0].arrears, true);
  }
  assert.equal(normalizeKimi(sample({ available_balance: 0.00001 }), 'USD').isAvailable, true);
});

test('missing voucher or cash stays unknown, never 0; the available balance is required', () => {
  const r = normalizeKimi(sample({ available_balance: 5 }), 'CNY');
  assert.equal(r.balances[0].voucher, null);
  assert.equal(r.balances[0].cash, null);
  assert.equal(r.balances[0].arrears, false);
  assert.equal(formatAmount(r.balances[0].voucher), '—');
  for (const raw of [
    null,
    {},
    { code: 1, data: { available_balance: 1 } },
    { code: '0', data: { available_balance: 1 } },
    { code: 0, data: [] },
    sample({}),
    sample({ voucher_balance: 1, cash_balance: 1 }),
    sample({ available_balance: '49.58' }),
    sample({ available_balance: 1e-7 }),
    sample({ available_balance: Number.NaN }),
    sample({ available_balance: 1, voucher_balance: -1 }),
    sample({ available_balance: 1, cash_balance: true }),
  ])
    assert.throws(() => normalizeKimi(raw, 'CNY'));
});

test('each site makes only a fixed HTTPS GET with Bearer auth and no redirects', async () => {
  for (const [region, url, currency] of [
    ['cn', 'https://api.moonshot.cn/v1/users/me/balance', 'CNY'],
    ['global', 'https://api.moonshot.ai/v1/users/me/balance', 'USD'],
  ]) {
    let calls = 0;
    const client = createClient('kimi', region, async (seen, options) => {
      calls++;
      assert.equal(seen, url);
      assert.equal(options.method, 'GET');
      assert.equal(options.headers.Authorization, 'Bearer ' + key);
      assert.equal(options.redirect, 'error');
      assert.equal(options.body, undefined);
      return response(fixtureBody('kimi'));
    });
    const result = await client.usage({ apiKey: key });
    assert.equal(calls, 1);
    assert.deepEqual(client.capabilities, { quota: false, balance: true, usageSummary: false, actualBilling: false });
    assert.equal(result.parts.balance.balances[0].currency, currency);
    assert.equal(result.parts.credits, undefined);
    assert.doesNotMatch(JSON.stringify(result), /synthetic/);
  }
  assert.throws(() => createClient('kimi', 'https://proxy.invalid'));
  for (const region of ['cn', 'global'])
    assert.equal(validateConnection({ provider: 'kimi', region, apiKey: key }).region, region);
  assert.throws(() => validateConnection({ provider: 'kimi', region: 'eu', apiKey: key }));
  assert.equal(providerDefinition('kimi').verification.level, 'contract');
});

test('failures are sanitized query errors that never become a zero balance', async () => {
  const cases = [
    [response({ code: 1, data: null, status: false }), 0, /未能返回余额/],
    [response(sample({ available_balance: 1 }), 401), 401, /密钥无效/],
    [response({ error: { message: key, type: 'x' } }, 500), 500, /暂时不可用/],
    [response('x{'), 0, /无法识别/],
    [response(sample({ available_balance: '1' })), 0, /无法识别/],
  ];
  for (const [res, status, message] of cases) {
    const r = await createClient('kimi', 'cn', async () => res).usage({ apiKey: key });
    assert.deepEqual(r.parts, {});
    assert.equal(r.errors[0].endpoint, 'balance');
    assert.equal(r.errors[0].status, status);
    assert.match(r.errors[0].message, message);
    assert.doesNotMatch(JSON.stringify(r), /synthetic/);
  }
});

test('status and menu bar follow the DeepSeek balance rule: unusable balance is amber, not "sufficient"', () => {
  const capabilities = { quota: false, balance: true, usageSummary: false, actualBilling: false };
  const state = (balance) => ({
    hasCredential: true,
    capabilities,
    data: { status: 'connected', parts: { balance }, updatedAt: { balance: 1 } },
  });
  const ok = normalizeKimi(fixtureBody('kimi'), 'CNY'),
    empty = normalizeKimi(sample({ available_balance: 0, voucher_balance: 0, cash_balance: -2 }), 'USD');
  assert.deepEqual(quotaStatus(state(ok)), ['有可用余额', 'green']);
  assert.deepEqual(quotaStatus(state(empty)), ['当前余额不可用于调用', 'amber']);
  const slot = (balance) => slotsOf({ capabilities, parts: { balance }, updatedAt: {} }, 20)[0];
  assert.equal(slot(ok).kind, 'balance');
  assert.equal(slot(ok).tone, 'normal');
  assert.match(slot(ok).text, /49\.58894/);
  assert.equal(slot(empty).tone, 'amber');
  assert.match(slot(empty).text, /0\.00/);
});
