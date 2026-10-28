// T10.2 (D16 ③): OpenRouter key limits, budgets and reported spend — synthetic samples in the official shape only.
const test = require('node:test'),
  assert = require('node:assert/strict');
const { normalizeOpenRouter } = require('../desktop/provider-domain.cjs');
const { resetDescription, quotaStatus } = require('../desktop/domain.cjs');
const { createClient } = require('../desktop/providers.cjs');
const { fixtureBody } = require('../desktop/provider-fixture.cjs');
const { providerDefinition } = require('../desktop/providers/index.cjs');
const { validateConnection } = require('../desktop/accounts.cjs');
const { slotsOf } = require('../desktop/menubar-status.cjs');
const NOW = Date.UTC(2026, 9, 28, 12, 0, 0);
const key = 'synthetic-openrouter-key-only';
const sample = (patch = {}) => {
  const body = fixtureBody('openrouter', NOW);
  return { data: { ...body.data, ...patch } };
};
const response = (body, status = 200) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

test('the key limit and other budgets become USD windows; key_limit is shown once with its own resets_at', () => {
  const c = normalizeOpenRouter(sample());
  assert.deepEqual(
    c.windows.map((w) => [w.id, w.label, w.group, w.unit, w.cap, w.remainingAmount, w.remainingPercent]),
    [
      ['openrouter:key', '花费上限 · 每月', '这把 Key · USD', 'USD', 100, 74.5, 74.5],
      ['openrouter:budget:0', '成员预算 · 每周', '预算 · USD', 'USD', 50, 17.5, 35],
    ],
  );
  assert.equal(c.windows[0].resetAt, NOW + 9 * 86400000);
  assert.equal(c.windows[1].resetAt, NOW + 3 * 86400000);
  assert.equal(c.budgets, 1);
  assert.deepEqual(c.spend, { daily: '1.24', weekly: '9.87', monthly: '25.5', total: '25.5', byok: '17.38' });
  // Identity fields (label, user / workspace ids) and free-model counters are never kept.
  assert.doesNotMatch(JSON.stringify(c), /synthetic|user_|ws_|free_model|sk-or/);
});

test('no limit means unlimited (never 0); a limit that never resets says so instead of guessing a time', () => {
  const unlimited = normalizeOpenRouter(sample({ limit: null, limit_remaining: null, limit_reset: null, budgets: [] }));
  assert.equal(unlimited.windows.length, 1);
  assert.equal(unlimited.windows[0].unlimited, true);
  assert.equal(unlimited.windows[0].remainingPercent, null);
  assert.equal(unlimited.windows[0].cap, null);
  assert.equal(resetDescription(unlimited.windows[0], NOW), '不重置');
  assert.equal(unlimited.budgets, 0);
  assert.equal(normalizeOpenRouter(sample({ budgets: undefined })).budgets, null);
  const never = normalizeOpenRouter(sample({ limit_reset: null, budgets: [] }));
  assert.equal(never.windows[0].label, '花费上限');
  assert.equal(resetDescription(never.windows[0], NOW), '不重置');
  // A key_limit budget for another interval is not used as this limit's reset time.
  const other = normalizeOpenRouter(sample({ limit_reset: 'daily' }));
  assert.equal(other.windows[0].resetAt, null);
  assert.equal(resetDescription(other.windows[0], NOW), '重置时间暂未返回');
});

test('over the limit is exhausted with the server amounts kept; missing spend stays unknown', () => {
  const c = normalizeOpenRouter(sample({ limit: 10, limit_remaining: -2, budgets: [] }));
  assert.equal(c.windows[0].exceeded, true);
  assert.equal(c.windows[0].remainingPercent, 0);
  assert.equal(c.windows[0].remainingAmount, -2);
  const zero = normalizeOpenRouter(sample({ limit: 0, limit_remaining: 0, budgets: [] }));
  assert.equal(zero.windows[0].exceeded, true);
  const partial = normalizeOpenRouter(sample({ usage_daily: undefined, byok_usage: undefined }));
  assert.equal(partial.spend.daily, null);
  assert.equal(partial.spend.byok, null);
});

test('unexpected shapes are rejected instead of guessed', () => {
  const budget = fixtureBody('openrouter', NOW).data.budgets[0];
  for (const raw of [
    null,
    {},
    { data: [] },
    { data: { limit_remaining: 1 } },
    { data: { limit: 1 } },
    sample({ limit: '100' }),
    sample({ limit: null, limit_remaining: 5 }),
    sample({ limit_reset: 'yearly' }),
    sample({ limit: -1, limit_remaining: -1 }),
    sample({ budgets: {} }),
    sample({ budgets: [{ ...budget, limit_usd: undefined }] }),
    sample({ budgets: [{ ...budget, reset_interval: 'hourly' }] }),
    sample({ budgets: [{ ...budget, resets_at: 'tomorrow' }] }),
    sample({ budgets: [{ ...budget, scope: 7 }] }),
    sample({ usage_daily: '1.24' }),
    sample({ usage: 1e-9 }),
  ])
    assert.throws(() => normalizeOpenRouter(raw));
  // An unknown budget scope is still shown, under a neutral name.
  assert.equal(
    normalizeOpenRouter(sample({ budgets: [{ ...budget, scope: 'team' }] })).windows[1].label,
    '预算 · 每周',
  );
});

test('only a fixed HTTPS GET with Bearer auth and no redirects; nothing identifying is returned', async () => {
  let calls = 0;
  const client = createClient('openrouter', 'global', async (url, options) => {
    calls++;
    assert.equal(url, 'https://openrouter.ai/api/v1/key');
    assert.equal(options.method, 'GET');
    assert.equal(options.headers.Authorization, 'Bearer ' + key);
    assert.equal(options.redirect, 'error');
    assert.equal(options.body, undefined);
    return response(sample());
  });
  const result = await client.usage({ apiKey: key });
  assert.equal(calls, 1);
  assert.deepEqual(client.capabilities, { quota: true, balance: false, usageSummary: false, actualBilling: false });
  assert.equal(result.parts.credits.windows.length, 2);
  assert.equal(result.parts.balance, undefined);
  assert.doesNotMatch(JSON.stringify(result), /synthetic|user_|ws_/);
  assert.equal(validateConnection({ provider: 'openrouter', region: 'global', apiKey: key }).region, 'global');
  assert.throws(() => validateConnection({ provider: 'openrouter', region: 'cn', apiKey: key }));
  assert.throws(() => createClient('openrouter', 'https://proxy.invalid'));
  assert.equal(providerDefinition('openrouter').verification.level, 'contract');
});

test('failures are sanitized query errors, never a zero limit', async () => {
  for (const [res, status, message] of [
    [response({ error: { code: 401, message: key } }, 401), 401, /密钥无效/],
    [response({ error: { code: 401, message: key } }), 401, /密钥无效/],
    [response({ error: { code: 500, message: key } }, 500), 500, /暂时不可用/],
    [response('x{'), 0, /无法识别/],
    [response(sample({ limit: 'x' })), 0, /无法识别/],
  ]) {
    const r = await createClient('openrouter', 'global', async () => res).usage({ apiKey: key });
    assert.deepEqual(r.parts, {});
    assert.equal(r.errors[0].status, status);
    assert.match(r.errors[0].message, message);
    assert.doesNotMatch(JSON.stringify(r), /synthetic/);
  }
});

test('status and menu bar read the key windows like any quota window', () => {
  const capabilities = { quota: true, balance: false, usageSummary: false, actualBilling: false };
  const state = (credits) => ({
    hasCredential: true,
    capabilities,
    settings: { threshold: 20 },
    data: { status: 'connected', parts: { credits }, updatedAt: { credits: 1 } },
  });
  const ok = normalizeOpenRouter(sample()),
    over = normalizeOpenRouter(sample({ limit: 10, limit_remaining: 0, budgets: [] }));
  assert.equal(quotaStatus(state(ok))[1], 'green');
  assert.equal(quotaStatus(state(over))[1], 'red');
  const slots = slotsOf({ capabilities, parts: { credits: ok }, updatedAt: {} }, 20);
  assert.deepEqual(
    slots.map((s) => [s.label, s.text]),
    [
      ['花费上限 · 每月', '75%'],
      ['成员预算 · 每周', '35%'],
    ],
  );
});
