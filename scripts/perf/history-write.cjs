// T4.0: time HistoryStore.append() (synchronous whole-file rewrite) on synthetic records in a temp directory.
// Never reads real user data. Usage: node scripts/perf/history-write.cjs [--sqlite] [count ...]
// --sqlite measures the T4.1 SqliteHistoryStore instead (history.json is migrated once, then never written).
const fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path');
const { HistoryStore } = require('../../desktop/history.cjs');
const { HistoryDatabase, createHistory } = require('../../desktop/history-db.cjs');

const sqlite = process.argv.includes('--sqlite');

const counts = process.argv
  .slice(2)
  .map(Number)
  .filter((n) => n > 0);
const record = (t) => ({
  t,
  summary: {
    total: 123456789,
    input: 98765432,
    output: 1234567,
    cost: 12.345678,
    requests: 4321,
    periodStart: t - 86400000,
  },
  credits: {
    five: { used: 12.5, limit: 100, resetAt: t + 3600000 },
    week: { used: 40.25, limit: 100, resetAt: t + 86400000 },
    purchased: 10,
    monthly: { used: 1.5, limit: 50 },
    free: 0,
  },
  creditAt: t,
});
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tua-perf-history-'));
const results = [];
try {
  for (const count of counts.length ? counts : [589, 4000, 16000]) {
    const file = path.join(root, `history-${count}.json`),
      start = Date.now() - count * 60000;
    fs.writeFileSync(
      file,
      JSON.stringify({
        version: 1,
        fingerprint: 'perf',
        records: Array.from({ length: count }, (_, i) => record(start + i * 60000)),
      }),
    );
    const database = sqlite ? new HistoryDatabase(path.join(root, `history-${count}.sqlite`)) : null;
    const store = sqlite ? createHistory(database, file) : new HistoryStore(file);
    store.configure('perf');
    const times = [];
    for (let i = 0; i < 30; i++) {
      const t = Date.now() + (i + 1) * 60000,
        r = record(t);
      const begin = process.hrtime.bigint();
      store.append({ parts: { summary: r.summary, credits: r.credits }, updatedAt: { summary: t, credits: t } });
      times.push(Number(process.hrtime.bigint() - begin) / 1e6);
    }
    database?.close();
    times.sort((a, b) => a - b);
    results.push({
      records: store.records.length,
      bytes: fs.statSync(sqlite ? path.join(root, `history-${count}.sqlite`) : file).size,
      medianMs: +times[14].toFixed(2),
      p95Ms: +times[28].toFixed(2),
      maxMs: +times[29].toFixed(2),
    });
  }
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
console.log(
  JSON.stringify(
    {
      store: sqlite ? 'sqlite' : 'json',
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      results,
    },
    null,
    2,
  ),
);
