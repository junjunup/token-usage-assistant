const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { normalizeGlm, normalizeMiniMax, normalizeVolcengine } = require('../desktop/provider-domain.cjs');
const { QuotaClient, createClient, signVolcengine } = require('../desktop/providers.cjs');
const { fixtureBody, fixtureFetch, NOW } = require('../desktop/provider-fixture.cjs');
const { AccountManager, validateConnection } = require('../desktop/accounts.cjs');
const { LocalStore, fingerprint } = require('../desktop/store.cjs');
const { DEFAULT_SETTINGS, quotaStatus, AlertTracker } = require('../desktop/domain.cjs');
const { UsageMonitor } = require('../desktop/monitor.cjs');
const { AnalyticsService } = require('../desktop/analytics-service.cjs');
const settings = { ...DEFAULT_SETTINGS };
const syntheticKey = 'synthetic-key-for-tests-only';
function input(provider = 'glm', extra = {}) {
  return {
    provider,
    region: provider === 'volcengine' ? 'cn-beijing' : provider === 'commandcode' ? 'global' : 'cn',
    apiKey: syntheticKey,
    accessKeyId: 'synthetic-access-key',
    secretKey: 'synthetic-secret-key',
    label: provider,
    ...extra,
  };
}
const response = (v, status = 200, headers = {}) => new Response(JSON.stringify(v), { status, headers });
function vault() {
  const secret = crypto.randomBytes(32);
  return {
    isEncryptionAvailable: () => true,
    encryptString(s) {
      const iv = crypto.randomBytes(12),
        c = crypto.createCipheriv('aes-256-gcm', secret, iv);
      return Buffer.concat([iv, Buffer.from(c.update(s, 'utf8')), c.final(), c.getAuthTag()]);
    },
    decryptString(b) {
      const d = crypto.createDecipheriv('aes-256-gcm', secret, b.subarray(0, 12));
      d.setAuthTag(b.subarray(-16));
      return Buffer.concat([d.update(b.subarray(12, -16)), d.final()]).toString('utf8');
    },
  };
}
function harness(t, options = {}) {
  const root = path.resolve(__dirname, '../work/provider-tests');
  fs.mkdirSync(root, { recursive: true });
  const dir = fs.mkdtempSync(path.join(root, 'test-')),
    store = new LocalStore(dir, vault()),
    alerts = [];
  const manager = new AccountManager({
    store,
    settings,
    clientFactory: (p, r) => createClient(p, r, fixtureFetch),
    notify: (a) => alerts.push(a),
    ...options,
  });
  t.after(() => {
    manager.dispose();
    assert.ok(dir.startsWith(root + path.sep));
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return { manager, store, alerts, dir };
}
test('GLM preserves window types, units, percentage-only limits and tool counters', () => {
  const c = normalizeGlm(fixtureBody('glm'));
  assert.equal(c.windows.length, 3);
  assert.equal(c.windows[0].remainingPercent, 68);
  assert.equal(c.windows[0].cap, null);
  assert.equal(c.windows[0].unit, '额度单位');
  assert.equal(c.windows[1].label, '周窗口');
  assert.equal(c.windows[2].unit, '次');
  assert.equal(c.windows[2].used, 84);
  assert.equal(c.monthly, undefined);
});
test('GLM missing counters and reset fields remain unknown; no fabricated timer', () => {
  const c = normalizeGlm({
    data: {
      limits: [
        { type: 'TOKENS_LIMIT', unit: 3, number: 5, percentage: 0 },
        { type: 'TOKENS_LIMIT', unit: 6 },
      ],
    },
  });
  assert.equal(c.windows[0].remainingPercent, 100);
  assert.equal(c.windows[0].resetState, 'unknown');
  assert.equal(c.windows[1].remainingPercent, null);
  assert.equal(c.windows[1].used, null);
  assert.throws(() => normalizeGlm({ data: { limits: [{ type: 'TOKENS_LIMIT' }] } }));
});
test('GLM unknown window units are not silently assigned a weekly window; ordering does not change IDs', () => {
  const raw = fixtureBody('glm'),
    a = normalizeGlm(raw);
  raw.data.limits.reverse();
  const b = normalizeGlm(raw);
  assert.deepEqual(a.windows.map((w) => w.id).sort(), b.windows.map((w) => w.id).sort());
  raw.data.limits = [
    { type: 'TOKENS_LIMIT', unit: 99, percentage: 30 },
    { type: 'TOKENS_LIMIT', unit: 88, percentage: 40 },
  ];
  const c = normalizeGlm(raw);
  assert.equal(c.windows[0].label, '额度窗口 1');
  assert.equal(c.windows[1].label, '额度窗口 2');
});
test('MiniMax percentage-only plans never appear as exhausted 0/0 counts', () => {
  const c = normalizeMiniMax(fixtureBody('minimax'), NOW);
  assert.equal(c.windows[0].remainingPercent, 72);
  assert.equal(c.windows[0].cap, null);
  assert.equal(c.windows[0].used, null);
  assert.equal(c.windows[0].label, '5 小时窗口');
  assert.equal(c.windows[2].label, '1 天窗口');
  assert.equal(c.windows[1].resetAt, NOW + 518400000);
  assert.equal(c.windows[3].unlimited, true);
});
test('MiniMax old remaining-count and newer consumed-count shapes agree with explicit percentages', () => {
  const raw = fixtureBody('minimax'),
    m = raw.model_remains[1];
  m.current_interval_total_count = 100;
  m.current_interval_usage_count = 80;
  delete m.current_interval_remaining_percent;
  assert.equal(normalizeMiniMax(raw, NOW).windows[2].used, 20);
  m.current_interval_remaining_percent = 20;
  assert.equal(normalizeMiniMax(raw, NOW).windows[2].used, 80);
  m.current_interval_remaining_percent = 42;
  const w = normalizeMiniMax(raw, NOW).windows[2];
  assert.equal(w.used, null);
  assert.equal(w.cap, null);
  assert.equal(w.remainingPercent, 42);
});
test('MiniMax unlimited, excluded models, explicit exhaustion and boosts stay distinct', () => {
  const raw = fixtureBody('minimax'),
    m = raw.model_remains[0];
  m.current_weekly_remaining_percent = 80;
  m.weekly_boost_permille = 1500;
  let c = normalizeMiniMax(raw, NOW);
  assert.equal(c.windows[1].remainingPercent, 120);
  assert.equal(c.windows[1].usedPercent, 20);
  m.current_interval_status = 3;
  m.current_weekly_status = 3;
  c = normalizeMiniMax(raw, NOW);
  assert.equal(c.windows[0].applicable, false);
  assert.equal(c.windows[1].unlimited, false);
  m.current_interval_status = 2;
  delete m.current_interval_remaining_percent;
  c = normalizeMiniMax(raw, NOW);
  assert.equal(c.windows[0].exceeded, true);
  assert.equal(c.windows[0].remainingPercent, null);
});
test('MiniMax uses the matching reset duration, leaves absent weekly metrics unknown, and rejects duplicate pools', () => {
  const raw = fixtureBody('minimax'),
    m = raw.model_remains[0];
  delete m.end_time;
  delete m.weekly_end_time;
  delete m.current_weekly_remaining_percent;
  const c = normalizeMiniMax(raw, NOW);
  assert.equal(c.windows[0].resetAt, NOW + m.remains_time);
  assert.equal(c.windows[1].resetAt, NOW + m.weekly_remains_time);
  assert.equal(c.windows[1].remainingPercent, null);
  raw.model_remains.push({ ...m });
  assert.throws(() => normalizeMiniMax(raw, NOW));
});
test('Volcengine official AFP example produces independent 5h/day/week/month quotas', () => {
  const c = normalizeVolcengine(fixtureBody('volcengine'));
  assert.equal(c.planName, 'Large');
  assert.equal(c.windows.length, 4);
  assert.equal(c.windows[0].used, 12.5);
  assert.equal(c.windows[0].cap, 50);
  assert.equal(c.windows[0].remainingPercent, 75);
  assert.equal(c.windows[2].remainingPercent, 70);
  assert.equal(c.windows[3].remainingPercent, 57.475);
  assert.ok(c.windows.every((w) => w.unit === 'AFP'));
  assert.equal(c.total, undefined);
});
test('Volcengine zero cap and missing fields never mean unlimited or zero usage', () => {
  const c = normalizeVolcengine({ Result: { AFPFiveHour: { Quota: '0', Used: '0' }, AFPWeekly: { Quota: '100' } } });
  assert.equal(c.windows[0].remainingPercent, null);
  assert.equal(c.windows[0].unlimited, false);
  assert.equal(c.windows[1].used, null);
  assert.equal(c.windows[1].resetAt, null);
  assert.throws(() => normalizeVolcengine({ Result: { PlanType: 'Large' } }));
});
for (const [provider, region] of [
  ['glm', 'cn'],
  ['glm', 'global'],
  ['minimax', 'cn'],
  ['minimax', 'global'],
  ['volcengine', 'cn-beijing'],
]) {
  test(provider + '/' + region + ' uses a fixed read-only query and never leaks credentials', async () => {
    const calls = [],
      credential = validateConnection(input(provider, { region })).credential;
    const client = new QuotaClient(
      provider,
      region,
      async (url, opts) => {
        calls.push({ url, opts });
        return response(fixtureBody(provider));
      },
      { now: () => NOW },
    );
    const result = await client.usage(credential);
    assert.equal(result.errors.length, 0);
    assert.ok(result.parts.credits.windows.length);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].opts.redirect, 'error');
    assert.equal(calls[0].opts.method, provider === 'volcengine' ? 'POST' : 'GET');
    assert.ok(!calls[0].url.includes(syntheticKey));
    assert.ok(!JSON.stringify(result).includes('synthetic'));
    if (provider === 'volcengine') {
      assert.equal(calls[0].opts.body, '{}');
      assert.ok(calls[0].url.includes('Action=GetAFPUsage'));
    }
    if (provider === 'glm') assert.equal(calls[0].opts.headers.Authorization, syntheticKey);
    if (provider === 'minimax') assert.equal(calls[0].opts.headers.Authorization, 'Bearer ' + syntheticKey);
  });
}
test('AFP signature matches an offline vector from the official Volcengine SDK', () => {
  // volcengine/volc-sdk-nodejs 6e8d98c, with Content-Type signed per the GetAFPUsage example.
  const request = signVolcengine(
    { accessKeyId: 'synthetic-access-key', secretKey: 'synthetic-secret-key' },
    Date.parse('2026-09-23T10:00:00Z'),
  );
  assert.equal(request.headers['X-Date'], '20260923T100000Z');
  assert.equal(
    request.headers.Authorization,
    'HMAC-SHA256 Credential=synthetic-access-key/20260923/cn-beijing/ark/request, SignedHeaders=content-type;host;x-content-sha256;x-date, Signature=4de45265d3c5d04f81b53142d3d9756fb865a4a1ed3fa4ad6bb0c33625f6fa4b',
  );
});

test('MiniMax requires an explicit valid success code even when quota fields exist', async () => {
  for (const code of [undefined, null, '', false]) {
    const body = fixtureBody('minimax');
    body.base_resp.status_code = code;
    const result = await new QuotaClient('minimax', 'cn', async () => response(body)).usage({ apiKey: syntheticKey });
    assert.equal(result.errors[0].code, 'schema');
    assert.deepEqual(result.parts, {});
  }
});

test('vendor body errors in HTTP 200 pause authentication/limit retries without exposing raw messages', async () => {
  for (const [provider, body, status] of [
    ['glm', { code: 401, msg: 'private key echoed' }, 401],
    ['minimax', { base_resp: { status_code: 1004, status_msg: 'private key echoed' } }, 401],
    ['minimax', { base_resp: { status_code: 1002 } }, 429],
    ['volcengine', { ResponseMetadata: { Error: { Code: 'AccessDenied', Message: 'private key echoed' } } }, 403],
  ]) {
    const region = provider === 'volcengine' ? 'cn-beijing' : 'cn',
      c = new QuotaClient(provider, region, async () => response(body));
    const result = await c.usage(validateConnection(input(provider)).credential);
    assert.equal(result.errors[0].status, status);
    assert.deepEqual(result.parts, {});
    assert.ok(!JSON.stringify(result).includes('private'));
  }
});
test('malformed payloads, network exceptions and huge responses become sanitized errors', async () => {
  for (const fetch of [
    async () => new Response('private non-JSON'),
    async () => response({ data: { limits: [] } }),
    async () => {
      throw new Error('private credential');
    },
    async () => new Response('x'.repeat(2_000_001)),
  ]) {
    const result = await new QuotaClient('glm', 'cn', fetch).usage({ apiKey: syntheticKey });
    assert.equal(result.errors.length, 1);
    assert.deepEqual(result.parts, {});
    assert.ok(!JSON.stringify(result).includes('private'));
  }
});
test('request timeout aborts the operation and does not leak transport details', async () => {
  let aborted = false;
  const client = new QuotaClient(
    'glm',
    'cn',
    (_url, opts) =>
      new Promise((resolve, reject) =>
        opts.signal.addEventListener('abort', () => {
          aborted = true;
          reject(new Error('private'));
        }),
      ),
    { timeout: 5 },
  );
  const result = await client.usage({ apiKey: syntheticKey });
  assert.equal(aborted, true);
  assert.equal(result.errors[0].status, 0);
});
test('arbitrary regions and credential header injection are rejected before requests', () => {
  assert.throws(() => new QuotaClient('glm', 'https://evil.invalid'));
  assert.throws(() => validateConnection(input('glm', { apiKey: 'secret-key\r\nX-Test: fail' })));
  assert.throws(() => validateConnection(input('volcengine', { secretKey: '' })));
  assert.throws(() => validateConnection(input('glm', { region: 'bad' })));
});
test('dynamic quota health and notifications respect unknown/excluded/unlimited pools', () => {
  const credits = normalizeMiniMax(fixtureBody('minimax'), NOW),
    s = { hasCredential: true, settings, data: { parts: { credits }, status: 'connected' } };
  assert.deepEqual(quotaStatus(s), ['额度充足', 'green']);
  credits.windows[0].remainingPercent = null;
  assert.deepEqual(quotaStatus(s), ['部分额度暂不可获取', 'neutral']);
  credits.windows[0].remainingPercent = 10;
  const a = new AlertTracker();
  assert.equal(a.check(credits, settings).length, 1);
  assert.equal(a.check(credits, settings).length, 0);
  credits.windows[0].exceeded = true;
  assert.equal(a.check(credits, settings)[0].level, 2);
  assert.equal(quotaStatus(s)[1], 'red');
  credits.windows[0].applicable = false;
  assert.equal(a.check(credits, settings).length, 0);
});
test('a 429 response preserves the last known quotas; force refresh cannot bypass Retry-After', async (t) => {
  let fail = false,
    calls = 0;
  const client = new QuotaClient('glm', 'cn', async () => {
    calls++;
    return fail ? response({}, 429, { 'Retry-After': '900' }) : response(fixtureBody('glm'));
  });
  const m = new UsageMonitor(client, { settings, now: () => NOW });
  t.after(() => m.dispose());
  m.configure({ apiKey: syntheticKey });
  await m.refresh();
  fail = true;
  await m.refresh();
  await m.refresh();
  assert.equal(calls, 2);
  assert.equal(m.state.parts.credits.windows[0].remainingPercent, 68);
  assert.equal(m.state.status, 'offline');
  assert.equal(m.state.nextRefreshAt, NOW + 900000);
});
test('multiple encrypted connections persist active choice and keep all accounts refreshing', async (t) => {
  let calls = 0;
  const { manager, store } = harness(t, {
    clientFactory: (p, r) =>
      createClient(p, r, async (u) => {
        calls++;
        return fixtureFetch(u);
      }),
  });
  const a = await manager.connect(input('glm')),
    b = await manager.connect(input('minimax')),
    c = await manager.connect(input('volcengine'));
  assert.equal(manager.publicState().accounts.length, 3);
  assert.equal(manager.activeId, c);
  manager.select(a);
  await manager.refreshAll();
  assert.equal(calls, 6);
  const publicData = JSON.stringify(manager.publicState());
  assert.ok(!publicData.includes(syntheticKey));
  assert.ok(!publicData.includes('secretKey'));
  assert.ok(!publicData.includes('accessKeyId'));
  const saved = fs.readFileSync(store.file('accounts.encrypted.json'), 'utf8');
  assert.ok(!saved.includes(syntheticKey));
  assert.ok(!saved.includes('synthetic-secret-key'));
  const restored = new AccountManager({ store, settings, clientFactory: (p, r) => createClient(p, r, fixtureFetch) });
  t.after(() => restored.dispose());
  restored.load();
  assert.equal(restored.activeId, a);
  assert.equal(restored.runtimes.get(b).monitor.state.parts.credits.windows[0].remainingPercent, 72);
  assert.notEqual(restored.runtimes.get(a).scoped.root, restored.runtimes.get(b).scoped.root);
});
test('duplicate credential updates same connection while region and different keys remain isolated', async (t) => {
  const { manager } = harness(t);
  const id = await manager.connect(input());
  const duplicate = await manager.connect(input('glm', { label: 'renamed' }));
  assert.equal(duplicate, id);
  assert.equal(manager.entries.length, 1);
  const second = await manager.connect(input('glm', { apiKey: 'another-synthetic-test-key' }));
  assert.notEqual(second, id);
  await manager.connect(input('glm', { region: 'global' }));
  assert.equal(manager.entries.length, 3);
});
test('failed validation or encryption retains previous accounts and active selection', async (t) => {
  const { manager, store } = harness(t);
  const id = await manager.connect(input());
  manager.clientFactory = (p, r) => createClient(p, r, async () => response({}, 401));
  await assert.rejects(() => manager.connect(input('minimax')));
  assert.equal(manager.activeId, id);
  assert.equal(manager.entries.length, 1);
  manager.clientFactory = (p, r) => createClient(p, r, fixtureFetch);
  store.safeStorage.isEncryptionAvailable = () => false;
  await assert.rejects(() => manager.connect(input('minimax')));
  assert.equal(manager.activeId, id);
  assert.equal(manager.entries.length, 1);
});
test('updating/removing an account cannot leave an in-flight request writing its old cache', async (t) => {
  const { manager } = harness(t);
  const id = await manager.connect(input());
  const old = manager.active;
  let resolve;
  old.monitor.client = { usage: () => new Promise((r) => (resolve = r)) };
  const pending = old.monitor.refresh();
  await manager.connect(input('glm', { accountId: id, apiKey: 'replacement-test-key' }));
  const replacement = manager.active;
  resolve({
    parts: { credits: normalizeGlm({ data: { limits: [{ type: 'TOKENS_LIMIT', percentage: 99 }] } }) },
    errors: [],
  });
  await pending;
  assert.equal(replacement.monitor.state.parts.credits.windows[0].remainingPercent, 68);
  manager.remove(id);
  assert.equal(manager.activeId, '');
  assert.equal(fs.existsSync(replacement.scoped.file('snapshot.json')), false);
  assert.equal(manager.active.monitor.key, '');
});
test('removing one account preserves other credentials, cache, settings and refresh timer', async (t) => {
  const { manager, store } = harness(t);
  store.saveSettings({ ...settings, theme: 'dark' }, { main: { x: 1 } });
  const a = await manager.connect(input()),
    b = await manager.connect(input('minimax'));
  manager.select(a);
  manager.remove(a);
  assert.equal(manager.activeId, b);
  assert.ok(manager.active.monitor.timer);
  assert.ok(fs.existsSync(manager.active.scoped.file('snapshot.json')));
  assert.equal(store.accounts().accounts[0].id, b);
  assert.equal(store.settings().preferences.theme, 'dark');
});
test('legacy Command Code migrates without losing cache, settings, bounds or credentials', async (t) => {
  const { manager, store } = harness(t);
  store.saveCredentials(syntheticKey, 'legacy-org');
  store.saveSettings({ ...settings, threshold: 30 }, { main: { x: 50, y: 60 } });
  store.saveCache(fingerprint(syntheticKey, 'legacy-org'), {
    parts: { summary: { total: 123 } },
    updatedAt: { summary: NOW },
  });
  manager.load();
  assert.equal(manager.activeId, 'legacy-commandcode');
  assert.equal(manager.active.monitor.state.parts.summary.total, 123);
  await manager.connect(input('glm'));
  assert.equal(store.accounts().accounts.length, 2);
  assert.equal(fs.existsSync(store.file('credentials.encrypted.json')), false);
  manager.select('legacy-commandcode');
  assert.equal(manager.active.monitor.key, syntheticKey);
  assert.equal(manager.active.monitor.orgId, 'legacy-org');
  assert.equal(store.settings().preferences.threshold, 30);
  assert.equal(store.settings().bounds.main.x, 50);
});
test('a corrupt encrypted vault is never replaced with an empty vault', async (t) => {
  const { manager, store } = harness(t);
  fs.writeFileSync(store.file('accounts.encrypted.json'), 'corrupt');
  manager.load();
  assert.ok(manager.issue);
  await assert.rejects(() => manager.connect(input()));
  assert.equal(fs.readFileSync(store.file('accounts.encrypted.json'), 'utf8'), 'corrupt');
});

test('a damaged legacy credential file blocks migration instead of being silently replaced', async (t) => {
  const { manager, store } = harness(t);
  fs.writeFileSync(store.file('credentials.encrypted.json'), 'corrupt legacy');
  manager.load();
  assert.ok(manager.issue);
  await assert.rejects(() => manager.connect(input()));
  assert.equal(fs.readFileSync(store.file('credentials.encrypted.json'), 'utf8'), 'corrupt legacy');
  assert.equal(fs.existsSync(store.file('accounts.encrypted.json')), false);
});
test('new providers do not call Command Code summaries or fabricate token/cost analytics', async (t) => {
  const { manager, store } = harness(t);
  await manager.connect(input());
  const active = manager.active,
    service = new AnalyticsService({
      store,
      monitor: active.monitor,
      history: active.history,
      client: active.client,
      localReader: async () => ({ summary: { total: 7 }, status: 'ready' }),
    });
  const report = await service.get({ source: 'account', range: 'today' });
  assert.equal(report.status, 'unavailable');
  assert.equal(report.summary, null);
  assert.equal(report.prediction, null);
  const local = await service.get({ source: 'local', range: 'today' });
  assert.equal(local.summary.total, 7);
  assert.equal(local.source, 'local');
});
test('one failing provider does not stop the other account monitors', async (t) => {
  const { manager } = harness(t);
  const a = await manager.connect(input()),
    b = await manager.connect(input('minimax'));
  manager.runtimes.get(a).monitor.client = new QuotaClient('glm', 'cn', async () => response({}, 401));
  await manager.refreshAll();
  assert.equal(manager.runtimes.get(a).monitor.state.status, 'auth-error');
  assert.equal(manager.runtimes.get(a).monitor.state.nextRefreshAt, null);
  assert.equal(manager.runtimes.get(b).monitor.state.status, 'connected');
  assert.ok(manager.runtimes.get(b).monitor.state.nextRefreshAt);
});
