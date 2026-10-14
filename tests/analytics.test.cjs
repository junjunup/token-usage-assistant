const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const {
  rangeFor,
  priceKey,
  aggregateLocal,
  validatePrice,
  accountBins,
  forecast,
} = require('../desktop/analytics-core.cjs');
const { HistoryStore } = require('../desktop/history.cjs');
const { AnalyticsService } = require('../desktop/analytics-service.cjs');
const { readZcode } = require('../desktop/zcode-reader.cjs');
const { normalizeSummary } = require('../desktop/domain.cjs');
const now = new Date(2026, 8, 23, 12, 0).getTime(),
  range = rangeFor('today', now),
  key = priceKey('provider-a', 'model-a'),
  prices = { [key]: { input: 3, output: 15, read: 0.3, write: 3.75 } };
const row = (patch = {}) => ({
  id: 'r1',
  session_id: 'session-a',
  directory: 'C:/Demo/project-a',
  started_at: now - 60000,
  status: 'completed',
  provider_id: 'provider-a',
  model_id: 'model-a',
  input_tokens: 1000,
  output_tokens: 100,
  cache_read_input_tokens: 600,
  cache_creation_input_tokens: 100,
  computed_total_tokens: 1100,
  ...patch,
});
const temp = (t) => {
  const root = path.resolve(__dirname, '../../../work/analytics-tests');
  fs.mkdirSync(root, { recursive: true });
  const dir = fs.mkdtempSync(path.join(root, 'case-'));
  t.after(() => {
    assert.ok(dir.startsWith(root + path.sep));
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return dir;
};
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
function samples({
  step = 60000,
  start = now - 20 * 60000,
  used = 10,
  increment = 1,
  reset = now + 60 * 60000,
  period = range.start,
} = {}) {
  return Array.from({ length: Math.round((now - start) / step) + 1 }, (_, i) => ({
    t: start + i * step,
    summary: { periodStart: period, total: i * 1000, cost: i * 0.1, requests: i, input: i * 900, output: i * 100 },
    creditAt: start + i * step,
    credits: {
      purchased: 5,
      five: { used: used + i * increment, cap: 100, resetAt: reset },
      week: { used: used + i * increment, cap: 100, resetAt: now + 7 * 86400000 },
    },
  }));
}
function service(
  t,
  client = {
    summary: async () =>
      normalizeSummary(
        { totalTokens: 100, totalCount: 2, totalCost: 1, completedCount: 1, failedCount: 1 },
        range.start,
      ),
  },
) {
  const dir = temp(t),
    store = { file: (n) => path.join(dir, n) },
    history = { records: [], hash: 'account-a' },
    data = {
      parts: {
        subscription: { start: range.start - 86400000 },
        summary: normalizeSummary({ totalTokens: 100, totalCount: 2 }, range.start - 86400000),
      },
      updatedAt: { summary: now, credits: now },
      errors: [],
      status: 'connected',
    },
    monitor = {
      key: 'test-only',
      orgId: '',
      rateLimitUntil: 0,
      settings: { refreshSeconds: 60 },
      snapshot: () => data,
    };
  const clock = { value: now },
    s = new AnalyticsService({
      store,
      monitor,
      history,
      client,
      now: () => clock.value,
      localReader: async (_f, r, filters, p) => ({
        ...aggregateLocal([row()], r, filters, p),
        status: 'ready',
        updatedAt: clock.value,
      }),
    });
  return { s, monitor, data, clock, history };
}

test('today and seven-day ranges use local calendar boundaries; missing billing is unavailable', () => {
  assert.equal(new Date(range.start).getHours(), 0);
  assert.equal(range.end, now);
  assert.equal(new Date(rangeFor('7d', now).start).getDate(), 17);
  assert.equal(rangeFor('billing', now).start, null);
  assert.equal(rangeFor('billing', now, now + 1).start, null);
  assert.throws(() => rangeFor('bad', now));
});
test('cache is a partition of input, never added again to token total or price', () => {
  const s = aggregateLocal([row()], range, {}, prices).summary;
  assert.equal(s.total, 1100);
  assert.equal(s.input, 1000);
  assert.equal(s.cache.read, 600);
  assert.equal(s.cache.write, 100);
  assert.equal(s.cache.fresh, 300);
  close(s.cache.hitRate, 60);
  close(s.cost, (300 * 3 + 100 * 15 + 600 * 0.3 + 100 * 3.75) / 1e6);
  close(s.cache.estimatedSavings, (600 * (3 - 0.3)) / 1e6);
});
test('missing cache columns stay unknown and do not create a zero-cost request', () => {
  const s = aggregateLocal([row({ cache_read_input_tokens: null })], range, {}, prices).summary;
  assert.equal(s.cache.hitRate, null);
  assert.equal(s.cache.requests, 0);
  assert.equal(s.cache.missing, 1);
  assert.equal(s.cost, null);
  assert.equal(s.unpricedRequests, 1);
  assert.equal(s.total, 1100);
});
test('unknown token counts do not masquerade as complete totals', () => {
  const s = aggregateLocal([row({ output_tokens: null })], range, {}, prices).summary;
  assert.equal(s.total, null);
  assert.equal(s.averageTokens, null);
  assert.equal(s.missingTokenRequests, 1);
  assert.equal(s.cost, null);
});
test('status accounting keeps failed and cancelled requests out of completed-token totals', () => {
  const r = aggregateLocal(
    [
      row(),
      row({ id: 'r2', status: 'error' }),
      row({ id: 'r3', status: 'cancelled' }),
      row({ id: 'r4', status: 'pending' }),
    ],
    range,
    {},
    prices,
  );
  assert.equal(r.summary.requests, 4);
  assert.equal(r.summary.completed, 1);
  assert.equal(r.summary.failed, 1);
  assert.equal(r.summary.cancelled, 1);
  assert.equal(r.summary.pending, 1);
  assert.equal(r.summary.successRate, 50);
  assert.equal(r.summary.averageTokens, 1100);
  assert.equal(r.summary.total, 1100);
  assert.equal(
    r.bins.reduce((n, b) => n + b.requests, 0),
    4,
  );
});
test('model prices are provider-specific; mixed unknown prices remain partial', () => {
  const s = aggregateLocal([row(), row({ id: 'r2', provider_id: 'provider-b' })], range, {}, prices).summary;
  assert.equal(s.cost, null);
  assert.equal(s.pricedRequests, 1);
  assert.equal(s.unpricedRequests, 1);
  assert.ok(s.knownCost > 0);
  assert.throws(() => validatePrice({ input: 0, output: 0, read: -1, write: 0 }));
  assert.throws(() => validatePrice({ input: 1, output: 1 }));
  assert.deepEqual(validatePrice({ input: 0, output: 0, read: 0, write: 0 }), {
    input: 0,
    output: 0,
    read: 0,
    write: 0,
  });
});
test('model/project/session filters affect all aggregates; options stay discoverable', () => {
  const rows = [
    row(),
    row({ id: 'b', model_id: 'model-b', directory: 'C:/Demo/project-b', session_id: 'b' }),
    row({ id: 'c', session_id: 'other' }),
  ];
  const r = aggregateLocal(rows, range, { model: key, project: 'C:/Demo/project-a', session: 'session-a' }, prices);
  assert.equal(r.summary.requests, 1);
  assert.equal(r.models.length, 1);
  assert.equal(r.projects.length, 1);
  assert.equal(r.sessions.length, 1);
  assert.equal(r.options.models.length, 2);
  assert.equal(r.options.projects.length, 2);
});
test('previous-period comparison excludes present, future and older records', () => {
  const r = aggregateLocal(
    [
      row(),
      row({ id: 'prev', started_at: range.start - 1 }),
      row({ id: 'future', started_at: now + 1 }),
      row({ id: 'old', started_at: range.start - 2 * (now - range.start) }),
    ],
    range,
    {},
    prices,
  );
  assert.equal(r.summary.requests, 1);
  assert.equal(r.previous.requests, 1);
});
test('account trend leaves unobserved bins empty and ignores resets and long gaps', () => {
  const t = range.start + 5 * 60000;
  const points = [
    { t, summary: { total: 100, cost: 1, requests: 1, periodStart: 1 } },
    { t: t + 60000, summary: { total: 150, cost: 1.2, requests: 2, periodStart: 1 } },
    { t: t + 120000, summary: { total: 20, cost: 0.1, requests: 1, periodStart: 2 } },
    { t: t + 3600000, summary: { total: 200, cost: 1, requests: 3, periodStart: 2 } },
  ];
  const b = accountBins(points, range);
  assert.equal(b[0].tokens, 50);
  assert.equal(b[0].requests, 1);
  assert.equal(b[1].tokens, null);
  assert.equal(b[0].coverageMs, 60000);
});
test('quota forecast waits ten minutes, rejects stale or discontinuous samples', () => {
  assert.equal(forecast(samples().slice(-9), now).available, false);
  assert.equal(forecast(samples(), now + 10 * 60000).available, false);
  assert.equal(forecast([samples()[0], ...samples().slice(-5)], now).available, false);
});
test('forecast measures rates and distinguishes cap-before-reset from reset-before-cap', () => {
  const f = forecast(samples(), now);
  assert.equal(f.available, true);
  assert.equal(f.tokensPerMinute, 1000);
  close(f.costPerHour, 6);
  assert.equal(f.windows[0].status, 'after-reset');
  assert.equal(f.windows[1].status, 'before-reset');
  assert.equal(f.purchasedAvailable, true);
});
test('quota reset, null usage and zero burn do not produce invented depletion dates', () => {
  let a = samples();
  a.at(-1).credits.five.resetAt = now + 5 * 3600000;
  assert.equal(forecast(a, now).windows[0].status, 'insufficient');
  a = samples({ increment: 0 });
  assert.equal(forecast(a, now).windows[0].status, 'idle');
  a.forEach((r) => (r.credits.five.used = null));
  assert.equal(forecast(a, now).windows[0].status, 'insufficient');
});
test('history is account-isolated and deduplicates minute samples', (t) => {
  const file = path.join(temp(t), 'history.json'),
    h = new HistoryStore(file);
  h.configure('a');
  const append = (time, total) =>
    h.append({ parts: { summary: { total, periodStart: range.start }, credits: null }, updatedAt: { summary: time } });
  append(now, 100);
  append(now + 10000, 200);
  assert.equal(h.records.length, 1);
  assert.equal(h.records[0].summary.total, 200);
  const h2 = new HistoryStore(file);
  h2.configure('a');
  assert.equal(h2.records.length, 1);
  h2.configure('b');
  assert.equal(h2.records.length, 0);
  h2.clear();
  assert.equal(h2.hash, '');
});
test('SQLite metadata adapter is read-only, excludes private columns, avoids duplicate joins', (t) => {
  const file = path.join(temp(t), 'usage.sqlite'),
    db = new DatabaseSync(file);
  db.exec(
    'CREATE TABLE model_usage (id TEXT,session_id TEXT,started_at INTEGER,model_id TEXT,status TEXT,input_tokens INTEGER,output_tokens INTEGER,raw_usage_json TEXT,error_message TEXT); CREATE TABLE session (id TEXT,directory TEXT,title TEXT);',
  );
  db.prepare('INSERT INTO model_usage VALUES (?,?,?,?,?,?,?,?,?)').run(
    '1',
    's',
    now - 1,
    'm',
    'completed',
    10,
    5,
    'PRIVATE_RAW',
    'PRIVATE_ERROR',
  );
  db.prepare('INSERT INTO session VALUES (?,?,?)').run('s', 'C:/Demo/project', 'PRIVATE_TITLE');
  db.prepare('INSERT INTO session VALUES (?,?,?)').run('s', 'C:/Demo/project', 'PRIVATE_TITLE2');
  db.close();
  const hash = () => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),
    before = hash();
  const r = readZcode(file, range);
  assert.equal(r.status, 'ready');
  assert.equal(r.summary.requests, 1);
  assert.equal(r.summary.total, 15);
  assert.equal(r.summary.cache.hitRate, null);
  assert.ok(!JSON.stringify(r).includes('PRIVATE'));
  assert.equal(hash(), before);
});
test('missing or incompatible local DB reports an empty state instead of zero totals', (t) => {
  const dir = temp(t);
  assert.equal(readZcode(path.join(dir, 'none'), range).status, 'missing');
  const file = path.join(dir, 'empty.sqlite'),
    db = new DatabaseSync(file);
  db.close();
  assert.equal(readZcode(file, range).status, 'schema');
});
test('account range requests cache independently and preserve the requested since value', async (t) => {
  const calls = [];
  const { s } = service(t, {
    summary: async (_k, _o, since) => {
      calls.push(since);
      return normalizeSummary({ totalTokens: 100, totalCount: 1 }, since);
    },
  });
  await s.get({ source: 'account', range: 'today' });
  await s.get({ source: 'account', range: 'today' });
  await s.get({ source: 'account', range: '7d' });
  assert.deepEqual(calls, [range.start, rangeFor('7d', now).start]);
});
test('analytics honors 429 cooldown even for another range and force refresh', async (t) => {
  let count = 0;
  const { s, monitor } = service(t, {
    summary: async () => {
      count++;
      throw Object.assign(new Error('Rate limited'), { status: 429, retryAfterMs: 300000 });
    },
  });
  assert.equal((await s.get({ range: 'today' })).status, 'stale');
  await s.get({ range: '7d', force: true });
  assert.equal(count, 1);
  assert.equal(monitor.rateLimitUntil, now + 300000);
});
test('account switch rejects old in-flight analytics responses', async (t) => {
  let resolve;
  const { s } = service(t, { summary: () => new Promise((r) => (resolve = r)) });
  const pending = s.get({ range: 'today' });
  s.resetAccount();
  resolve(normalizeSummary({ totalTokens: 100 }, range.start));
  const r = await pending;
  assert.equal(r.status, 'unavailable');
  assert.equal(r.summary, null);
  assert.equal(s.cache.size, 0);
});
test('billing analysis refuses to label an all-time fallback as current-period data', async (t) => {
  const { s, data } = service(t);
  data.parts.summary = normalizeSummary({ totalTokens: 99 });
  const r = await s.get({ range: 'billing' });
  assert.equal(r.status, 'unavailable');
  assert.equal(r.summary, null);
});
test('price changes invalidate local analytics and recompute costs', async (t) => {
  const { s } = service(t);
  const query = { source: 'local', range: 'today' };
  assert.equal((await s.get(query)).summary.cost, null);
  s.savePrice(key, prices[key]);
  assert.ok((await s.get(query)).summary.cost > 0);
});
test('account request health and funding fields retain unknown values', () => {
  const a = normalizeSummary({
    totalTokens: 100,
    totalCount: 10,
    completedCount: 8,
    failedCount: 2,
    totalCost: 2,
    totalPurchasedCredits: 1,
  });
  assert.equal(a.successRate, 80);
  assert.equal(a.averageTokens, 10);
  assert.equal(a.averageCost, 0.2);
  assert.equal(a.funding.purchased, 1);
  assert.equal(a.funding.free, null);
  assert.equal(normalizeSummary({ totalTokens: 0, totalCount: 0 }).successRate, null);
});
test('inconsistent cache counts stay unavailable instead of being silently clamped', () => {
  const s = aggregateLocal(
    [row({ cache_read_input_tokens: 950, cache_creation_input_tokens: 200 })],
    range,
    {},
    prices,
  ).summary;
  assert.equal(s.cache.requests, 0);
  assert.equal(s.cache.hitRate, null);
  assert.equal(s.cost, null);
});
