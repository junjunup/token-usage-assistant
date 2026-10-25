const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeOpenCodeGo } = require('../desktop/provider-domain.cjs');
const { createClient } = require('../desktop/providers.cjs');
const { fixtureBody, NOW } = require('../desktop/provider-fixture.cjs');
const { UsageMonitor } = require('../desktop/monitor.cjs');
const { DEFAULT_SETTINGS, AlertTracker, quotaStatus, resetDescription } = require('../desktop/domain.cjs');
const { validateConnection } = require('../desktop/accounts.cjs');
const response = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers });

test('Go reads only fixed HTTPS quota endpoint, bearer auth and disallows redirects', async () => {
  let calls = 0;
  const client = createClient('opencode-go', 'global', async (url, options) => {
    calls++;
    assert.equal(url, 'https://opencode.ai/zen/go/v1/usage');
    assert.equal(options.method, 'GET');
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers.Authorization, 'Bearer synthetic-go-key');
    assert.equal(options.body, undefined);
    return response(fixtureBody('opencode-go', NOW));
  });
  const result = await client.usage({ apiKey: 'synthetic-go-key' });
  assert.equal(calls, 1);
  assert.deepEqual(result.errors, []);
  assert.equal(result.parts.credits.windows.length, 3);
  assert.deepEqual(client.capabilities, { quota: true, balance: false, usageSummary: false, actualBilling: false });
  assert.equal(validateConnection({ provider: 'opencode-go', apiKey: 'synthetic-go-key' }).region, 'global');
  assert.throws(() => createClient('opencode-go', 'custom'));
});

test('Go preserves server percentages and absolute resets without fabricating money or identity', () => {
  const c = normalizeOpenCodeGo(fixtureBody('opencode-go', NOW));
  assert.deepEqual(
    c.windows.map((w) => w.remainingPercent),
    [72, 37, 58],
  );
  assert.equal(c.windows[0].resetAt, NOW + 7200000);
  for (const w of c.windows) {
    assert.equal(w.cap, null);
    assert.equal(w.used, null);
    assert.equal(w.boost, 1);
  }
  assert.equal(c.balance, undefined);
  assert.equal(c.identity, undefined);
  const raw = fixtureBody('opencode-go');
  delete raw.usage.weekly.resetsAt;
  raw.usage.rolling.percent = 0;
  const parsed = normalizeOpenCodeGo(raw);
  assert.equal(parsed.windows[1].resetAt, null);
  assert.equal(parsed.windows[0].remainingPercent, 100);
  assert.match(resetDescription(parsed.windows[0], NOW), /待确认/);
});

test('Go rejects malformed or missing windows instead of displaying healthy fabricated quotas', () => {
  for (const bad of [null, false, {}, [], { error: { type: 'AuthError' } }])
    assert.throws(() => normalizeOpenCodeGo(bad));
  for (const bad of [null, undefined, '0', false, -1, 101, Infinity, NaN]) {
    const raw = fixtureBody('opencode-go');
    raw.usage.rolling.percent = bad;
    assert.throws(() => normalizeOpenCodeGo(raw));
  }
  for (const key of ['rolling', 'weekly', 'monthly']) {
    const raw = fixtureBody('opencode-go');
    delete raw.usage[key];
    assert.throws(() => normalizeOpenCodeGo(raw));
  }
  const raw = fixtureBody('opencode-go');
  raw.usage.rolling.status = 'unknown';
  assert.throws(() => normalizeOpenCodeGo(raw));
  raw.usage.rolling.status = 'rate-limited';
  assert.throws(() => normalizeOpenCodeGo(raw));
  raw.usage.rolling.percent = 100;
  raw.usage.weekly.resetsAt = 'tomorrow';
  assert.throws(() => normalizeOpenCodeGo(raw));
});

test('Go exhausted monthly window triggers status and alert without losing other windows', () => {
  const raw = fixtureBody('opencode-go');
  raw.usage.monthly = { status: 'rate-limited', percent: 100, resetsAt: new Date(NOW + 9999).toISOString() };
  const credits = normalizeOpenCodeGo(raw),
    state = {
      hasCredential: true,
      data: { parts: { credits }, status: 'connected', errors: [] },
      settings: DEFAULT_SETTINGS,
    };
  assert.equal(credits.windows[2].exceeded, true);
  assert.equal(quotaStatus(state)[1], 'red');
  const alerts = new AlertTracker().check(credits, { ...DEFAULT_SETTINGS, notifications: true }, null);
  assert.ok(alerts.some((a) => JSON.stringify(a).includes('本账期')));
});

test('Go maps explicit entitlement errors separately and never exposes upstream messages', async () => {
  for (const [status, body, expected] of [
    [401, { error: { message: 'PRIVATE_KEY' } }, ''],
    [403, { error: { type: 'EntitlementError', message: 'PRIVATE_KEY' } }, 'entitlement'],
    [403, { error: { type: 'Other', message: 'PRIVATE_KEY' } }, ''],
    [200, { error: { type: 'AuthError', message: 'PRIVATE_KEY' } }, 'upstream'],
    [503, {}, ''],
  ]) {
    const r = await createClient('opencode-go', 'global', async () => response(body, status)).usage({
      apiKey: 'synthetic',
    });
    assert.equal(r.parts.credits, undefined);
    assert.equal(r.errors[0].code, expected || String(status));
    assert.ok(!JSON.stringify(r).includes('PRIVATE_KEY'));
    if (expected === 'entitlement') assert.match(r.errors[0].message, /成员.*Go 订阅/);
  }
});

test('Go throttling and schema failures retain last success with fresh status and retry delay', async (t) => {
  let mode = 'ok';
  const alerts = [];
  const client = createClient('opencode-go', 'global', async () =>
    mode === 'ok'
      ? response(fixtureBody('opencode-go'))
      : mode === 'rate'
        ? response({}, 429, { 'Retry-After': '120' })
        : response({ usage: {} }),
  );
  const m = new UsageMonitor(client, { settings: DEFAULT_SETTINGS, now: () => NOW, notify: (a) => alerts.push(a) });
  t.after(() => m.dispose());
  m.configure({ apiKey: 'synthetic' });
  await m.refresh();
  const previous = structuredClone(m.state.parts.credits),
    updated = m.state.updatedAt.credits;
  mode = 'schema';
  await m.refresh();
  assert.deepEqual(m.state.parts.credits, previous);
  assert.equal(m.state.updatedAt.credits, updated);
  assert.equal(m.state.status, 'offline');
  mode = 'rate';
  await m.refresh();
  assert.equal(m.state.errors[0].status, 429);
  assert.ok(m.state.nextRefreshAt >= NOW + 120000);
  assert.deepEqual(m.state.parts.credits, previous);
});

test('T6.3: the Go note is a one-line conclusion; the money / Zen caveats stay in the details', () => {
  const c = normalizeOpenCodeGo(fixtureBody('opencode-go', NOW));
  assert.ok([...c.note].length <= 40);
  assert.match(c.note, /不能相加/);
  assert.match(c.noteDetail, /不换算为金额或 Token/);
  assert.match(c.noteDetail, /Zen 余额/);
});
