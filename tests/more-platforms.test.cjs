// T13.3 (D20): SiliconFlow and StepFun balances, ZenMux subscription windows and pay-as-you-go balance, from the
// official reference examples. Read-only GETs to fixed addresses; identity fields are never kept; amounts stay as sent.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createClient } = require('../desktop/providers.cjs');
const { fixtureBody } = require('../desktop/provider-fixture.cjs');
const { normalizeSiliconFlow, normalizeStepFun, normalizeZenMuxBalance } = require('../desktop/balance-domain.cjs');
const { normalizeZenMux } = require('../desktop/provider-domain.cjs');
const { PROVIDERS } = require('../desktop/provider-catalog.cjs');
const { providerGroups } = require('../desktop/onboarding.cjs');

const NOW = Date.UTC(2026, 10, 5, 9);
const response = (body, status = 200) => new Response(JSON.stringify(body), { status });

test('T13.3: each platform calls one fixed read-only address with the key as Bearer and no redirects', async () => {
  const cases = [
    ['siliconflow', 'cn', 'https://api.siliconflow.cn/v1/user/info'],
    ['siliconflow', 'global', 'https://api.siliconflow.com/v1/user/info'],
    ['stepfun', 'cn', 'https://api.stepfun.com/v1/accounts'],
    ['zenmux', 'global', 'https://zenmux.ai/api/v1/management/subscription/detail'],
    ['zenmux-payg', 'global', 'https://zenmux.ai/api/v1/management/payg/balance'],
  ];
  for (const [provider, region, url] of cases) {
    let seen;
    const client = createClient(provider, region, async (requested, options) => {
      seen = { requested, options };
      return response(fixtureBody(provider, NOW));
    });
    const result = await client.usage({ apiKey: 'synthetic-key-123456' });
    assert.deepEqual(result.errors, [], provider);
    assert.equal(seen.requested, url);
    assert.equal(seen.options.method, 'GET');
    assert.equal(seen.options.redirect, 'error');
    assert.equal(seen.options.headers.Authorization, 'Bearer synthetic-key-123456');
    assert.doesNotMatch(JSON.stringify(result), /synthetic-user|synthetic-key/);
  }
  assert.throws(() => createClient('stepfun', 'global'), 'StepFun: China site only');
});

test('T13.3 SiliconFlow: total / granted / topped-up as decimal strings, currency from the site', () => {
  const cn = normalizeSiliconFlow(fixtureBody('siliconflow'), 'CNY');
  assert.deepEqual(cn.balances, [{ currency: 'CNY', total: '88.88', granted: '0.88', toppedUp: '88.00' }]);
  assert.equal(cn.isAvailable, true);
  assert.equal(normalizeSiliconFlow(fixtureBody('siliconflow'), 'USD').balances[0].currency, 'USD');
  const body = fixtureBody('siliconflow');
  assert.equal(normalizeSiliconFlow({ ...body, data: { ...body.data, totalBalance: '0' } }, 'CNY').isAvailable, false);
  assert.equal(
    normalizeSiliconFlow({ ...body, data: { ...body.data, balance: undefined } }, 'CNY').balances[0].granted,
    null,
    'a missing part stays unknown',
  );
  for (const bad of [
    { ...body, code: 40001 },
    { ...body, data: { ...body.data, totalBalance: 88.88 } },
    { ...body, data: { ...body.data, totalBalance: undefined } },
  ])
    assert.throws(() => normalizeSiliconFlow(bad, 'CNY'));
});

test('T13.3 StepFun: only the available balance (lifetime totals are not parts); postpaid stays usable', () => {
  const r = normalizeStepFun(fixtureBody('stepfun'));
  assert.deepEqual(r.balances, [{ currency: 'CNY', total: '12.5' }]);
  assert.equal(r.isAvailable, true);
  assert.equal(normalizeStepFun({ object: 'account', type: 'prepaid', balance: 0 }).isAvailable, false);
  const post = normalizeStepFun({ object: 'account', type: 'postpaid', balance: 0 });
  assert.equal(post.isAvailable, true);
  assert.equal(post.postpaid, true);
  for (const bad of [
    { object: 'user', type: 'prepaid', balance: 1 },
    { object: 'account', type: 'prepaid' },
    { object: 'account', type: 'prepaid', balance: '1' },
  ])
    assert.throws(() => normalizeStepFun(bad));
});

test('T13.3 ZenMux: 5-hour and 7-day windows from the 0–1 fraction, monthly cap not a window; balance in USD', () => {
  const r = normalizeZenMux(fixtureBody('zenmux', NOW));
  assert.deepEqual(
    r.windows.map((w) => [w.id, w.label, w.remainingPercent, w.resetAt]),
    [
      ['zenmux:quota_5_hour', '5 小时窗口', 67.85, NOW + 3 * 3600000],
      ['zenmux:quota_7_day', '7 天窗口', 89.53, NOW + 4 * 86400000],
    ],
  );
  assert.equal(r.planName, 'ZenMux · Pro');
  const body = fixtureBody('zenmux', NOW);
  const fresh = normalizeZenMux({
    ...body,
    data: { ...body.data, account_status: 'suspended', quota_5_hour: { ...body.data.quota_5_hour, resets_at: null } },
  });
  assert.equal(fresh.windows[0].resetAt, null, 'a window that has not started has no reset time');
  assert.equal(fresh.note, '账户已暂停');
  assert.equal(normalizeZenMux({ ...body, data: { ...body.data, quota_7_day: undefined } }).windows.length, 1);
  for (const bad of [
    { success: false, data: body.data },
    { ...body, data: { ...body.data, quota_5_hour: undefined, quota_7_day: undefined } },
    { ...body, data: { ...body.data, quota_5_hour: { ...body.data.quota_5_hour, usage_percentage: '0.3' } } },
    { ...body, data: { ...body.data, quota_5_hour: { ...body.data.quota_5_hour, resets_at: 'tomorrow' } } },
  ])
    assert.throws(() => normalizeZenMux(bad));
  const balance = normalizeZenMuxBalance(fixtureBody('zenmux-payg'));
  assert.deepEqual(balance.balances, [{ currency: 'USD', total: '482.74', granted: '447.74', toppedUp: '35' }]);
  assert.throws(() => normalizeZenMuxBalance({ success: true, data: { currency: 'cny', total_credits: 1 } }));
});

test('T13.3: the new platforms are in the wizard groups and name their key type', () => {
  const groups = Object.fromEntries(providerGroups(PROVIDERS).map((g) => [g.id, g.providers.map((p) => p.id)]));
  assert.ok(groups.plan.includes('zenmux'));
  for (const id of ['siliconflow', 'stepfun', 'zenmux-payg']) assert.ok(groups.balance.includes(id), id);
  for (const id of ['zenmux', 'zenmux-payg'])
    assert.match(PROVIDERS.find((p) => p.id === id).note, /Management API Key/);
  assert.match(PROVIDERS.find((p) => p.id === 'stepfun').note, /Step Plan 套餐额度没有查询接口/);
  assert.match(PROVIDERS.find((p) => p.id === 'siliconflow').note, /按官方示例推断/);
});
