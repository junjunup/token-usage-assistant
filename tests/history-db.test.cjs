const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path');
const { HistoryStore } = require('../desktop/history.cjs');
const { HistoryDatabase, SqliteHistoryStore, createHistory, MAX_RECORDS } = require('../desktop/history-db.cjs');

const MINUTE = 60000,
  DAY = 86400000;
// Databases opened in a test are closed before its directory is removed (Windows locks open files).
const temp = (t, databases = []) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tua-history-db-'));
  t.after(() => {
    for (const database of databases) database.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return dir;
};
const sample = (t, total, credits = true) => ({
  parts: {
    summary: { total, input: total - 10, output: 10, cost: total / 1000, requests: 1, periodStart: t - DAY },
    credits: credits ? { five: { used: total % 100 }, week: null, purchased: 1, monthly: null, free: 0 } : null,
  },
  updatedAt: { summary: t, credits: credits ? t - 5 : undefined },
});
const legacy = (file, fingerprint, records) =>
  fs.writeFileSync(file, JSON.stringify({ version: 1, fingerprint, records }));
const seedRecords = (count, end) =>
  Array.from({ length: count }, (_, i) => ({
    t: end - (count - i) * MINUTE,
    summary: { total: i, input: i, output: 0, cost: 0, requests: i, periodStart: 0 },
    credits: null,
    creditAt: null,
  }));

test('SQLite history matches the JSON implementation record for record (dupes, time travel, 31 days, 16000 cap)', (t) => {
  const databases = [],
    dir = temp(t, databases),
    now = Date.UTC(2026, 9, 16, 12, 0, 30),
    seeded = seedRecords(MAX_RECORDS - 10, now);
  legacy(path.join(dir, 'old.json'), 'fp', seeded);
  legacy(path.join(dir, 'new.json'), 'fp', seeded);
  const before = fs.readFileSync(path.join(dir, 'new.json'));
  const oldStore = new HistoryStore(path.join(dir, 'old.json')),
    database = new HistoryDatabase(path.join(dir, 'history.sqlite'));
  databases.push(database);
  const newStore = createHistory(database, path.join(dir, 'new.json'));
  assert.ok(newStore instanceof SqliteHistoryStore);
  oldStore.configure('fp');
  newStore.configure('fp');
  assert.deepEqual(newStore.records, oldStore.records, 'migration imports the same records');
  const steps = [];
  let clock = now;
  for (let i = 0; i < 25; i++) steps.push(sample((clock += MINUTE), 1000 + i)); // crosses the 16000 cap
  steps.push(sample(clock + 10000, 2000)); // same minute: replaces the previous sample
  steps.push(sample(clock + 20000, 2001, false)); // same minute again, no credits
  steps.push(sample(clock - 5 * MINUTE, 9)); // older than the last sample: ignored
  steps.push(sample(clock + 20000, 9)); // equal to the last sample: ignored
  steps.push({ parts: { summary: null }, updatedAt: { summary: clock + MINUTE } }); // no summary: ignored
  steps.push(sample((clock += 40 * DAY), 3000)); // jump past 31 days: everything older is dropped
  steps.push(sample(clock + MINUTE, 3001));
  for (const step of steps) {
    oldStore.append(step);
    newStore.append(step);
    assert.deepEqual(newStore.records, oldStore.records);
  }
  assert.equal(newStore.records.length, 2);
  const reopened = new SqliteHistoryStore(database, path.join(dir, 'new.json'));
  reopened.configure('fp');
  assert.deepEqual(reopened.records, oldStore.records, 'the database holds exactly the in-memory records');
  assert.deepEqual(fs.readFileSync(path.join(dir, 'new.json')), before, 'history.json is never written');
});

test('the cap keeps exactly 16000 records in memory and in the database', (t) => {
  const databases = [],
    dir = temp(t, databases),
    now = Date.UTC(2026, 9, 16),
    database = new HistoryDatabase(path.join(dir, 'history.sqlite'));
  databases.push(database);
  legacy(path.join(dir, 'history.json'), 'fp', seedRecords(MAX_RECORDS, now));
  const store = createHistory(database, path.join(dir, 'history.json'));
  store.configure('fp');
  store.append(sample(now + MINUTE, 1));
  assert.equal(store.records.length, MAX_RECORDS);
  const reopened = new SqliteHistoryStore(database, path.join(dir, 'history.json'));
  reopened.configure('fp');
  assert.equal(reopened.records.length, MAX_RECORDS);
  assert.deepEqual(reopened.records, store.records);
});

test('migration happens once per fingerprint; mismatched files are not imported', (t) => {
  const databases = [],
    dir = temp(t, databases),
    now = Date.UTC(2026, 9, 16),
    file = path.join(dir, 'history.json'),
    database = new HistoryDatabase(path.join(dir, 'history.sqlite'));
  databases.push(database);
  legacy(file, 'other', seedRecords(3, now));
  const store = createHistory(database, file);
  store.configure('fp');
  assert.equal(store.records.length, 0, 'a different fingerprint is not imported');
  legacy(file, 'fp', seedRecords(3, now));
  store.configure('x');
  store.configure('fp');
  assert.equal(store.records.length, 3);
  // After migration the database is the source of truth: later changes to history.json are ignored.
  legacy(file, 'fp', seedRecords(5, now));
  const again = new SqliteHistoryStore(database, file);
  again.configure('fp');
  assert.equal(again.records.length, 3);
});

test('purge removes only that fingerprint; an unopenable database falls back to the JSON store', (t) => {
  const databases = [],
    dir = temp(t, databases),
    now = Date.UTC(2026, 9, 16),
    database = new HistoryDatabase(path.join(dir, 'history.sqlite'));
  databases.push(database);
  const a = createHistory(database, path.join(dir, 'a.json')),
    b = createHistory(database, path.join(dir, 'b.json'));
  a.configure('a');
  b.configure('b');
  a.append(sample(now, 1));
  b.append(sample(now, 2));
  a.purge();
  assert.equal(a.hash, '');
  const checkA = new SqliteHistoryStore(database, path.join(dir, 'a.json')),
    checkB = new SqliteHistoryStore(database, path.join(dir, 'b.json'));
  checkA.configure('a');
  checkB.configure('b');
  assert.equal(checkA.records.length, 0);
  assert.equal(checkB.records.length, 1);
  const blocked = path.join(dir, 'blocked');
  fs.mkdirSync(blocked);
  const broken = new HistoryDatabase(blocked);
  databases.push(broken);
  assert.equal(broken.open(), null);
  assert.ok(createHistory(broken, path.join(dir, 'c.json')) instanceof HistoryStore);
});

test('AccountManager uses the history database and closes it on dispose', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'desktop', 'accounts.cjs'), 'utf8');
  assert.match(source, /new HistoryDatabase\(store\.file\('history\.sqlite'\)\)/);
  assert.match(source, /createHistory\(this\.historyDb, scoped\.file\('history\.json'\)\)/);
  assert.match(source, /this\.historyDb\.close\(\);/);
  assert.match(source, /runtime\.history\.purge\(\)/);
});
