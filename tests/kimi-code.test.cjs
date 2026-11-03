const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeKimiCode } = require('../desktop/provider-domain.cjs');
const { createClient } = require('../desktop/providers.cjs');
const { fixtureBody, NOW } = require('../desktop/provider-fixture.cjs');
const { validateConnection } = require('../desktop/accounts.cjs');
const { PROVIDERS } = require('../desktop/provider-catalog.cjs');
const response = (body, status = 200) => new Response(JSON.stringify(body), { status });

// T12.2 (D19 ②): Kimi Code subscription through an undocumented read-only endpoint, with the user's own key.
test('T12.2: Kimi Code reads one fixed HTTPS endpoint per site with bearer auth and no redirects', async () => {
  for (const [region, url] of [
    ['cn', 'https://api.kimi.com/coding/v1/usages'],
    ['global', 'https://api.kimi.ai/coding/v1/usages'],
  ]) {
    let calls = 0;
    const client = createClient('kimi-code', region, async (requested, options) => {
      calls++;
      assert.equal(requested, url);
      assert.equal(options.method, 'GET');
      assert.equal(options.redirect, 'error');
      assert.equal(options.headers.Authorization, 'Bearer synthetic-kimi-code-key');
      assert.equal(options.body, undefined);
      return response(fixtureBody('kimi-code', NOW));
    });
    const result = await client.usage({ apiKey: 'synthetic-kimi-code-key' });
    assert.equal(calls, 1);
    assert.deepEqual(result.errors, []);
    assert.equal(result.parts.credits.windows.length, 3);
  }
  assert.equal(
    validateConnection({ provider: 'kimi-code', region: 'cn', apiKey: 'synthetic-kimi-code-key' }).region,
    'cn',
  );
  assert.throws(() => createClient('kimi-code', 'eu'));
  const info = PROVIDERS.find((p) => p.id === 'kimi-code');
  assert.match(info.note, /非官方接口/);
  assert.match(info.verification.note, /非官方接口/);
});

test('T12.2: ratio pools become percentages with the server reset time, never counts or money', () => {
  const c = normalizeKimiCode(fixtureBody('kimi-code', NOW));
  assert.deepEqual(
    c.windows.map((w) => [w.id, w.label, w.remainingPercent, w.resetAt]),
    [
      ['kimi-code:limit_5h', '5 小时窗口', 62, NOW + 9000000],
      ['kimi-code:limit_7d', '每周额度', 45, NOW + 302400000],
      ['kimi-code:limit_month_total', '每月总额度', 79, NOW + 1296000000],
    ],
  );
  for (const w of c.windows) {
    assert.equal(w.used, null);
    assert.equal(w.cap, null);
  }
  assert.equal(c.planName, 'Kimi Code · Allegretto');
  assert.match(c.note, /非官方接口/);
  // Over-full ratios clamp to an exhausted window; a missing reset stays unknown (no countdown is invented).
  const full = normalizeKimiCode({ usages: { limit_5h: { used_ratio: 1.2 } } }).windows[0];
  assert.equal(full.remainingPercent, 0);
  assert.equal(full.exceeded, true);
  assert.equal(full.resetAt, null);
  assert.equal(full.resetState, 'unknown');
  // Unknown membership levels and catalog versions are not shown.
  assert.equal(
    normalizeKimiCode({ user: { membership: { level: 'LEVEL_X' } }, usages: { limit_5h: { used_ratio: 0 } } }).planName,
    'Kimi Code',
  );
  assert.equal(
    normalizeKimiCode({
      version: 'GOODS_VERSION_V2',
      user: { membership: { level: 'LEVEL_BASIC' } },
      usages: { limit_5h: { used_ratio: 0 } },
    }).planName,
    'Kimi Code',
  );
});

test('T12.2: the older counts fill only the windows the ratio pools do not give; numbers may be strings', () => {
  const reset = Math.floor(NOW / 1000) + 600;
  const c = normalizeKimiCode({
    usages: { limit_7d: { used_ratio: '0.5', reset_time: String(reset) } },
    usage: { limit: '100', remaining: '10', resetTime: new Date(NOW + 1e7).toISOString() },
    limits: [
      { window: { duration: 300, timeUnit: 'TIME_UNIT_MINUTE' }, detail: { limit: 50, used: 10, reset_at: reset } },
      { window: { duration: 1, timeUnit: 'TIME_UNIT_DAY' }, detail: { limit: '20', remaining: '5' } },
    ],
  });
  assert.deepEqual(
    c.windows.map((w) => [w.id, w.label, w.remainingPercent]),
    [
      ['kimi-code:limit_5h', '5 小时窗口', 80],
      // The ratio pool wins over the weekly counts it overlaps.
      ['kimi-code:limit_7d', '每周额度', 50],
      ['kimi-code:m1440', '1 天窗口', 25],
    ],
  );
  assert.equal(c.windows[1].resetAt, reset * 1000);
});

test('T12.2: anything outside the known shapes is an incompatible format, not a guess', () => {
  for (const bad of [
    null,
    [],
    {},
    { usages: [] },
    { usages: { limit_5h: { used_ratio: 'x' } } },
    { usages: { limit_5h: { used_ratio: -0.1 } } },
    { usages: { limit_5h: {} } },
    { usages: { limit_5h: { used_ratio: 0.1, reset_time: 'tomorrow' } } },
    { limits: {} },
    { limits: [{ window: { duration: 5, timeUnit: 'TIME_UNIT_WEEK' }, detail: { limit: 1, used: 0 } }] },
    { limits: [{ window: { duration: 300, timeUnit: 'TIME_UNIT_MINUTE' }, detail: { limit: 0, used: 0 } }] },
    { usage: { limit: 10 } },
    { usage: { limit: 10, used: Infinity } },
  ])
    assert.throws(() => normalizeKimiCode(bad), /schema/, JSON.stringify(bad));
});

test('T12.2: an HTTP 200 error body or a changed shape is reported as a failure, never shown as data', async () => {
  for (const body of [{ error: { message: 'PRIVATE' } }, { usages: { limit_5h: { ratio: 0.2 } } }]) {
    const client = createClient('kimi-code', 'cn', async () => response(body));
    const result = await client.usage({ apiKey: 'k' });
    assert.equal(result.parts.credits, undefined);
    assert.equal(result.errors.length, 1);
    assert.doesNotMatch(JSON.stringify(result.errors), /PRIVATE/);
  }
});
