const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const domain = require('../desktop/domain.cjs');
const { CommandCodeClient, ApiError } = require('../desktop/api.cjs');
const { UsageMonitor } = require('../desktop/monitor.cjs');
const { LocalStore, fingerprint } = require('../desktop/store.cjs');
const { resizedWidgetBounds } = require('../desktop/widget-bounds.cjs');
const fixtures = {
  identity: { success: true, user: { id: 'account-1', userName: 'demo' }, org: null },
  credits: {
    credits: { monthlyCredits: 40, purchasedCredits: 5, freeCredits: 0 },
    windowLimits: {
      limited: true,
      fiveHour: { used: 32, cap: 100, resetAt: 1790000000000 },
      weekly: { used: 60, cap: 100, resetAt: 1790009000000 },
    },
  },
  subscription: {
    success: true,
    data: {
      status: 'active',
      planId: 'test',
      currentPeriodStart: '2026-09-01T00:00:00Z',
      currentPeriodEnd: '2026-10-01T00:00:00Z',
    },
  },
  summary: { totalTokensIn: 200, totalTokensOut: 30, totalTokens: 230, totalCount: 3, totalCost: 1.5 },
};
const response = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers });
const route = (url) => Object.entries(domain.ENDPOINTS).find(([, p]) => new URL(url).pathname === p)?.[0];
const settings = { ...domain.DEFAULT_SETTINGS };
const normalCredits = (v) =>
  domain.normalizeCredits({
    ...fixtures.credits,
    windowLimits: {
      ...fixtures.credits.windowLimits,
      fiveHour: { ...fixtures.credits.windowLimits.fiveHour, used: 100 - v },
    },
  });
test('unknown fields never become zero or full allowance', () => {
  const v = domain.normalizeWindow({ used: null, cap: 100 });
  assert.equal(v.remainingPercent, null);
  assert.equal(domain.normalizeWindow({ used: 0, cap: 0 }).remainingPercent, null);
  assert.equal(domain.normalizeWindow(null).unlimited, false);
  assert.equal(domain.normalizeWindow(null, false).unlimited, true);
  assert.equal(domain.finite(''), null);
  assert.equal(domain.finite(false), null);
});
test('quota percentages clamp over-cap usage and preserve actual values', () => {
  const w = domain.normalizeWindow({ used: 120, cap: 100, resetAt: 1790000000 });
  assert.equal(w.remainingPercent, 0);
  assert.equal(w.used, 120);
  assert.equal(w.exceeded, true);
  assert.equal(w.resetAt, 1790000000000);
  assert.equal(domain.normalizeWindow({ used: 25, cap: 100 }).remainingPercent, 75);
});
test('dates accept seconds, milliseconds and ISO; inactive reset stays absent', () => {
  assert.equal(domain.timestamp(0), null);
  assert.equal(domain.timestamp(null), null);
  assert.equal(domain.timestamp('bad'), null);
  assert.equal(domain.timestamp('2026-09-01T00:00:00Z'), 1788220800000);
  assert.equal(domain.timestamp(1790000000000), 1790000000000);
});
test('summary has explicit period and never fills unknown request/cost with zero', () => {
  const s = domain.normalizeSummary({ data: { totalTokensIn: 20, totalTokensOut: 4 } });
  assert.equal(s.total, 24);
  assert.equal(s.requests, null);
  assert.equal(s.cost, null);
  assert.equal(s.scope, 'history');
  assert.equal(domain.normalizeSummary(fixtures.summary, 1788220800000).scope, 'billing');
  assert.throws(() => domain.normalizeSummary({ success: true, data: {} }));
});
test('balance does not assume absent purchased/free credits are zero', () => {
  const c = domain.normalizeCredits({ credits: { monthlyCredits: 25 } });
  assert.equal(c.monthly, 25);
  assert.equal(c.total, null);
  assert.equal(c.purchased, null);
});
test('subscription missing is a valid no-subscription state', () => {
  assert.equal(domain.normalizeSubscription({ success: true, data: null }).start, null);
  assert.throws(() => domain.normalizeSubscription({ success: true, data: {} }));
});
test('preference validation whitelists supported keys and types', () => {
  assert.equal(domain.patchSettings(settings, { threshold: 10 }).threshold, 10);
  assert.throws(() => domain.patchSettings(settings, { notifications: 'false' }));
  assert.throws(() => domain.patchSettings(settings, { refreshSeconds: 0 }));
  assert.throws(() => domain.patchSettings(settings, { apiKey: 'secret' }));
});
test('backoff honors Retry-After and stops automatic auth retries', () => {
  assert.equal(domain.retryAfter('120'), 120000);
  assert.equal(domain.nextDelay([{ status: 429, retryAfterMs: 900000 }], 1, 60), 900000);
  assert.equal(domain.nextDelay([{ status: 503 }], 5, 60), 300000);
  assert.equal(domain.nextDelay([{ status: 401 }], 1, 60), null);
  assert.equal(domain.retryAfter('Wed, 23 Sep 2026 00:02:00 GMT', Date.parse('2026-09-23T00:00:00Z')), 120000);
});
test('alerts notify only on crossing/escalation, then rearm after recovery', () => {
  const a = new domain.AlertTracker();
  assert.equal(a.check(normalCredits(18), settings).length, 1);
  assert.equal(a.check(normalCredits(15), settings).length, 0);
  assert.equal(a.check(normalCredits(0), settings)[0].level, 2);
  assert.equal(a.check(normalCredits(68), settings).length, 0);
  assert.equal(a.check(normalCredits(10), settings).length, 1);
  assert.equal(new domain.AlertTracker().check(normalCredits(18), { ...settings, threshold: 10 }).length, 0);
  assert.equal(new domain.AlertTracker().check(normalCredits(18), { ...settings, notifications: false }).length, 0);
});
test('API uses only fixed read-only origin, disallows redirects, applies billing since', async () => {
  const calls = [];
  const client = new CommandCodeClient(async (url, opts) => {
    calls.push({ url, opts });
    return response(fixtures[route(url)]);
  });
  const r = await client.usage('unit-test-credential');
  assert.equal(r.errors.length, 0);
  assert.equal(r.parts.credits.five.remainingPercent, 68);
  assert.equal(r.parts.summary.scope, 'billing');
  for (const c of calls) {
    assert.equal(new URL(c.url).origin, 'https://api.commandcode.ai');
    assert.equal(c.opts.method, 'GET');
    assert.equal(c.opts.redirect, 'error');
  }
  assert.equal(
    new URL(calls.find((c) => route(c.url) === 'summary').url).searchParams.get('since'),
    '2026-09-01T00:00:00.000Z',
  );
  assert.ok(!JSON.stringify(r).includes('unit-test-credential'));
});
test('organization scope propagates to all billing endpoints', async () => {
  const urls = [];
  const client = new CommandCodeClient(async (url) => {
    urls.push(new URL(url));
    return response(
      route(url) === 'identity' ? { ...fixtures.identity, org: { id: 'org-1', name: 'Team' } } : fixtures[route(url)],
    );
  });
  const r = await client.usage('test-key', 'org-1');
  assert.equal(r.errors.length, 0);
  assert.ok(urls.every((u) => u.searchParams.get('orgId') === 'org-1'));
});
test('organization mismatch stops billing requests', async () => {
  let calls = 0;
  const c = new CommandCodeClient(async () => {
    calls++;
    return response(fixtures.identity);
  });
  const r = await c.usage('test-key', 'org-2');
  assert.equal(calls, 1);
  assert.equal(r.errors[0].status, 403);
  assert.deepEqual(r.parts, {});
});
test('partial subscription failure labels summary as historical', async () => {
  const c = new CommandCodeClient(async (url) =>
    route(url) === 'subscription' ? response({}, 503) : response(fixtures[route(url)]),
  );
  const r = await c.usage('test-key');
  assert.equal(r.errors[0].endpoint, 'subscription');
  assert.equal(r.parts.summary.scope, 'history');
  assert.equal(r.parts.summary.periodStart, null);
  assert.ok(r.parts.credits);
});
test('server text and secrets never appear in exposed errors', async () => {
  const c = new CommandCodeClient(async () => response({ error: 'SECRET-server-echo' }, 401));
  const r = await c.usage('SECRET-input');
  assert.equal(r.errors[0].status, 401);
  assert.ok(!JSON.stringify(r).includes('SECRET'));
  assert.deepEqual(r.parts, {});
});
test('malformed JSON becomes schema error without body leakage', async () => {
  const c = new CommandCodeClient(async () => new Response('PRIVATE html', { status: 200 }));
  await assert.rejects(
    () => c.request('credits', 'key'),
    (e) => e instanceof ApiError && e.code === 'schema' && !e.message.includes('PRIVATE'),
  );
});
test('monitor retains successful quotas on outage and emits stale status', async () => {
  let attempt = 0;
  const m = new UsageMonitor(
    {
      usage: async () =>
        ++attempt === 1
          ? { parts: { credits: normalCredits(68) }, errors: [] }
          : { parts: {}, errors: [{ endpoint: 'identity', status: 503, message: 'Unavailable' }] },
    },
    { settings },
  );
  m.configure('key');
  await m.refresh();
  await m.refresh();
  assert.equal(m.state.parts.credits.five.remainingPercent, 68);
  assert.equal(m.state.status, 'offline');
  assert.ok(m.state.nextRefreshAt);
  m.dispose();
});
test('monitor keeps successful section while another endpoint fails', async () => {
  const m = new UsageMonitor(
    {
      usage: async () => ({
        parts: { summary: domain.normalizeSummary(fixtures.summary) },
        errors: [{ endpoint: 'credits', status: 503, message: 'Unavailable' }],
      }),
    },
    { settings },
  );
  m.configure('key', '', { parts: { credits: normalCredits(68) }, updatedAt: { credits: 1 } });
  await m.refresh();
  assert.equal(m.state.parts.credits.five.remainingPercent, 68);
  assert.equal(m.state.updatedAt.credits, 1);
  assert.equal(m.state.parts.summary.total, 230);
  assert.equal(m.state.status, 'partial');
  m.dispose();
});
test('old in-flight account cannot overwrite a newly connected account', async (t) => {
  let resolve;
  const client = {
    usage: (key) =>
      key === 'old'
        ? new Promise((r) => (resolve = r))
        : Promise.resolve({ parts: { credits: normalCredits(42) }, errors: [] }),
  };
  const m = new UsageMonitor(client, { settings });
  t.after(() => m.dispose());
  m.configure('old');
  const old = m.refresh();
  m.configure('new');
  await m.refresh();
  resolve({ parts: { credits: normalCredits(1) }, errors: [] });
  await old;
  assert.ok(Math.abs(m.state.parts.credits.five.remainingPercent - 42) < 1e-9);
  m.dispose();
});
test('manual refresh cannot bypass server rate limit', async () => {
  let calls = 0;
  const m = new UsageMonitor(
    {
      usage: async () => {
        calls++;
        return { parts: {}, errors: [{ endpoint: 'identity', status: 429, retryAfterMs: 900000 }] };
      },
    },
    { settings, now: () => 10000 },
  );
  m.configure('key');
  await m.refresh();
  await m.refresh();
  assert.equal(calls, 1);
  assert.equal(m.state.nextRefreshAt, 910000);
  m.dispose();
});
test('encrypted store separates accounts and removes only local credentials/cache', () => {
  const root = path.resolve(__dirname, '../../../work/native-unit-tests');
  fs.mkdirSync(root, { recursive: true });
  const dir = fs.mkdtempSync(path.join(root, 'store-'));
  const secret = crypto.randomBytes(32);
  const vault = {
    isEncryptionAvailable: () => true,
    encryptString: (s) => {
      const iv = crypto.randomBytes(12),
        c = crypto.createCipheriv('aes-256-gcm', secret, iv);
      const b = Buffer.concat([c.update(s, 'utf8'), c.final()]);
      return Buffer.concat([iv, c.getAuthTag(), b]);
    },
    decryptString: (b) => {
      const d = crypto.createDecipheriv('aes-256-gcm', secret, b.subarray(0, 12));
      d.setAuthTag(b.subarray(12, 28));
      return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8');
    },
  };
  try {
    const store = new LocalStore(dir, vault);
    store.saveCredentials('a-very-sensitive-unit-test-key', 'org');
    assert.ok(!fs.readFileSync(store.file('credentials.encrypted.json'), 'utf8').includes('sensitive'));
    assert.equal(store.credentials().orgId, 'org');
    const hash = fingerprint('test', 'org');
    store.saveCache(hash, { parts: { credits: normalCredits(80) } });
    assert.ok(store.cache(hash));
    assert.equal(store.cache(fingerprint('other')), null);
    store.saveSettings(settings, {});
    store.clearCredentials();
    assert.equal(store.credentials(), null);
    assert.ok(fs.existsSync(store.file('settings.json')));
  } finally {
    assert.ok(dir.startsWith(root + path.sep));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
test('unavailable platform encryption never writes plaintext fallback', () => {
  const root = path.resolve(__dirname, '../../../work/native-unit-tests/no-encryption');
  const store = new LocalStore(root, { isEncryptionAvailable: () => false });
  assert.throws(() => store.saveCredentials('secret', ''));
  assert.equal(fs.existsSync(store.file('credentials.encrypted.json')), false);
});

test('changing preferences does not resume automatic queries after authentication failure', async (t) => {
  const m = new UsageMonitor(
    { usage: async () => ({ parts: {}, errors: [{ endpoint: 'identity', status: 401, retryAfterMs: 0 }] }) },
    { settings },
  );
  t.after(() => m.dispose());
  m.configure('key');
  await m.refresh();
  assert.equal(m.state.status, 'auth-error');
  m.updateSettings({ ...settings, theme: 'dark' });
  assert.equal(m.state.nextRefreshAt, null);
});

const { monthlyQuota, quotaStatus, resetDescription } = domain;
function quotaState(balance = 50, spent = 20, purchased = 0, free = 0) {
  return {
    hasCredential: true,
    settings,
    data: {
      status: 'connected',
      errors: [],
      parts: {
        credits: { ...normalCredits(80), monthly: balance, purchased, free },
        subscription: { active: true, start: 1000, end: 2000 },
        summary: { scope: 'billing', periodStart: 1000, funding: { monthly: spent } },
      },
      updatedAt: { credits: 5000, summary: 5000 },
    },
  };
}
test('monthly depletion overrides available short-window quota', () => {
  const s = quotaState(0, 70);
  assert.deepEqual(quotaStatus(s), ['可用余额已用尽', 'red']);
  assert.equal(quotaStatus(quotaState(0, 70, 5))[0], '月额度已用尽 · 有购买余额');
  assert.equal(quotaStatus(quotaState(0, 70, 0, 2))[0], '月额度已用尽 · 有免费余额');
});
test('monthly pool derives only from same-period synchronized balances and spending', () => {
  const s = quotaState();
  const m = monthlyQuota(s.data);
  assert.equal(m.pool, 70);
  assert.equal(m.spent, 20);
  assert.equal(m.remaining, 50);
  assert.ok(Math.abs(m.remainingPercent - (50 / 70) * 100) < 1e-9);
  s.data.updatedAt.summary = 4000;
  assert.equal(monthlyQuota(s.data).pool, null);
  s.data.updatedAt.summary = 5000;
  s.data.parts.summary.periodStart = 500;
  assert.equal(monthlyQuota(s.data).pool, null);
});
test('missing monthly figures remain unknown; low monthly balance affects global state', () => {
  const s = quotaState(null, null);
  assert.equal(monthlyQuota(s.data).remainingPercent, null);
  assert.deepEqual(quotaStatus(s), ['月额度待同步', 'neutral']);
  assert.deepEqual(quotaStatus(quotaState(1, 69)), ['额度偏低', 'amber']);
});
test('explicit inactive reset differs from missing, active and expired timestamps', () => {
  const idle = domain.normalizeWindow({ used: 0, cap: 14, resetAt: 0 });
  assert.equal(idle.resetState, 'idle');
  assert.equal(resetDescription(idle, 10000), '待首次使用后开始计时');
  const missing = domain.normalizeWindow({ used: 0, cap: 14 });
  assert.equal(missing.resetState, 'unknown');
  assert.equal(resetDescription(missing, 10000), '重置时间暂未返回');
  assert.equal(resetDescription({ resetAt: 1790003600000 }, 1790000000000), '01:00:00 后重置');
  assert.match(resetDescription({ resetAt: 1790000000000 }, 1790000010000), /已到期/);
  assert.equal(resetDescription({ unlimited: true }, 10000), '当前不设窗口限制');
});
test('monthly alerts emit only when exhausted or crossing a known threshold', () => {
  const a = new domain.AlertTracker(),
    s = quotaState(1, 69);
  assert.equal(a.check(s.data.parts.credits, settings, monthlyQuota(s.data))[0].key, 'monthly');
  assert.equal(a.check(s.data.parts.credits, settings, monthlyQuota(s.data)).length, 0);
  const exhausted = quotaState(0, 70, 5);
  const alert = a.check(exhausted.data.parts.credits, settings, monthlyQuota(exhausted.data))[0];
  assert.equal(alert.level, 2);
  assert.equal(alert.hasPurchased, true);
});
test('widget expansion is an explicitly allowed boolean preference', () => {
  assert.equal(domain.patchSettings(settings, { widgetExpanded: true }).widgetExpanded, true);
  assert.throws(() => domain.patchSettings(settings, { widgetExpanded: 'yes' }));
});
test('widget expansion and collapse keep the same bottom edge', () => {
  const area = { x: 0, y: 0, width: 1920, height: 1040 };
  const compact = { x: 1572, y: 650, width: 324, height: 366 };
  const expanded = resizedWidgetBounds(compact, area, 552);
  assert.deepEqual(expanded, { x: 1572, y: 464, width: 324, height: 552 });
  assert.deepEqual(resizedWidgetBounds(expanded, area, 366), compact);
});
test('widget expansion stays within the selected display work area', () => {
  const area = { x: 1920, y: 40, width: 1280, height: 720 };
  const compact = { x: 2800, y: 50, width: 324, height: 366 };
  const expanded = resizedWidgetBounds(compact, area, 552);
  assert.equal(expanded.y, 40);
  assert.equal(expanded.x, compact.x);
});

// T8.2: preferences this build does not know (written by a newer version) survive a save.
test('T8.2: unknown preferences are kept on save; invalid known values still fall back to the default', () => {
  const os = require('node:os');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tua-prefs-'));
  try {
    const store = new LocalStore(dir, { isEncryptionAvailable: () => false });
    fs.writeFileSync(
      store.file('settings.json'),
      JSON.stringify({
        preferences: { theme: 'dark', refreshSeconds: 999, futurePreference: { a: 1 }, futureFlag: false },
        bounds: { main: { x: 5 } },
      }),
    );
    const { preferences, bounds } = store.settings();
    assert.equal(preferences.theme, 'dark');
    assert.equal(preferences.refreshSeconds, settings.refreshSeconds);
    assert.equal(Object.hasOwn(preferences, 'futurePreference'), false);
    store.saveSettings({ ...preferences, threshold: 10 }, bounds);
    const raw = JSON.parse(fs.readFileSync(store.file('settings.json'), 'utf8'));
    assert.deepEqual(raw.preferences.futurePreference, { a: 1 });
    assert.equal(raw.preferences.futureFlag, false);
    assert.equal(raw.preferences.threshold, 10);
    assert.equal(raw.preferences.refreshSeconds, settings.refreshSeconds);
    assert.deepEqual(raw.bounds, { main: { x: 5 } });
    // A fresh read after the save still keeps them aside.
    const again = new LocalStore(dir, { isEncryptionAvailable: () => false });
    again.saveSettings(again.settings().preferences, {});
    assert.deepEqual(JSON.parse(fs.readFileSync(again.file('settings.json'), 'utf8')).preferences.futurePreference, {
      a: 1,
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('T8.2: a settings file whose preferences are not an object keeps nothing unknown', () => {
  const os = require('node:os');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tua-prefs-'));
  try {
    const store = new LocalStore(dir, { isEncryptionAvailable: () => false });
    fs.writeFileSync(store.file('settings.json'), JSON.stringify({ preferences: ['dark'], bounds: {} }));
    store.saveSettings(store.settings().preferences, {});
    const raw = JSON.parse(fs.readFileSync(store.file('settings.json'), 'utf8'));
    assert.deepEqual(Object.keys(raw.preferences).sort(), Object.keys(settings).sort());
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
