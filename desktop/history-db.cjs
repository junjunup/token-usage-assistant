// Account sample history in <userData>/history.sqlite (T4.1). Same API and semantics as HistoryStore
// (history.cjs): a later sample in the same minute replaces the earlier one, samples not newer than the last
// are ignored, 31 days and at most 16000 records are kept. `records` stays in memory and append() only writes
// the change instead of rewriting a whole JSON file on the main thread.
// Migration: the first configure(hash) for a fingerprint with no rows imports a matching history.json once.
// history.json is never written or removed here, so an older version can still read it after a rollback.
const { DatabaseSync } = require('node:sqlite');
const { readJson } = require('./store.cjs');
const { DAY } = require('./analytics-core.cjs');
const { HistoryStore } = require('./history.cjs');
const { log } = require('./logger.cjs');

const KEEP_MS = 31 * DAY,
  MAX_RECORDS = 16000;

class HistoryDatabase {
  constructor(file) {
    this.file = file;
    this.db = null;
    this.failed = false;
  }
  // Returns null when the database cannot be opened; callers then fall back to the JSON store.
  open() {
    if (this.db || this.failed) return this.db;
    try {
      const db = new DatabaseSync(this.file, { enableLoadExtension: false });
      db.exec(
        'PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; CREATE TABLE IF NOT EXISTS history(fp TEXT NOT NULL, t INTEGER NOT NULL, record TEXT NOT NULL, PRIMARY KEY(fp, t)) WITHOUT ROWID;',
      );
      this.sql = {
        has: db.prepare('SELECT 1 FROM history WHERE fp=? LIMIT 1'),
        list: db.prepare('SELECT record FROM history WHERE fp=? ORDER BY t'),
        put: db.prepare('INSERT OR REPLACE INTO history(fp, t, record) VALUES(?, ?, ?)'),
        drop: db.prepare('DELETE FROM history WHERE fp=? AND t=?'),
        prune: db.prepare('DELETE FROM history WHERE fp=? AND t<?'),
        purge: db.prepare('DELETE FROM history WHERE fp=?'),
      };
      this.db = db;
    } catch (e) {
      this.failed = true;
      log.warn('history', 'open-failed', { errno: e?.code });
    }
    return this.db;
  }
  transaction(run) {
    this.db.exec('BEGIN');
    try {
      run(this.sql);
      this.db.exec('COMMIT');
    } catch (e) {
      try {
        this.db.exec('ROLLBACK');
      } catch {
        // The transaction may already be closed; the original error is rethrown below.
      }
      throw e;
    }
  }
  close() {
    try {
      this.db?.close();
    } catch {
      // Closing is best-effort at shutdown.
    }
    this.db = null;
  }
}

class SqliteHistoryStore {
  constructor(database, legacyFile) {
    this.database = database;
    this.legacyFile = legacyFile;
    this.hash = '';
    this.records = [];
    this.logged = false;
  }
  configure(hash) {
    if (hash === this.hash) return;
    this.hash = hash;
    this.records = [];
    if (!hash) return;
    const { sql } = this.database;
    if (sql.has.get(hash)) {
      this.records = sql.list
        .all(hash)
        .map((row) => JSON.parse(row.record))
        .filter((r) => Number.isFinite(r.t));
      return;
    }
    const saved = readJson(this.legacyFile, {});
    if (saved.fingerprint !== hash || !Array.isArray(saved.records)) return;
    this.records = saved.records.filter((r) => Number.isFinite(r.t));
    try {
      this.database.transaction((s) => {
        for (const r of this.records) s.put.run(hash, r.t, JSON.stringify(r));
      });
      log.info('history', 'migrated', { count: this.records.length });
    } catch (e) {
      log.warn('history', 'migrate-failed', { errno: e?.code });
    }
  }
  append(data) {
    if (!this.hash || !data.parts.summary || !data.updatedAt.summary) return;
    const t = data.updatedAt.summary;
    if (this.records.at(-1)?.t >= t) return;
    const started = process.hrtime.bigint();
    const s = data.parts.summary,
      c = data.parts.credits;
    let replaced = null;
    if (this.records.at(-1) && Math.floor(this.records.at(-1).t / 60000) === Math.floor(t / 60000))
      replaced = this.records.pop().t;
    const record = {
      t,
      summary: {
        total: s.total,
        input: s.input,
        output: s.output,
        cost: s.cost,
        requests: s.requests,
        periodStart: s.periodStart,
      },
      credits: c ? { five: c.five, week: c.week, purchased: c.purchased, monthly: c.monthly, free: c.free } : null,
      creditAt: data.updatedAt.credits || null,
    };
    this.records.push(record);
    this.records = this.records.filter((r) => r.t >= t - KEEP_MS).slice(-MAX_RECORDS);
    const hash = this.hash,
      first = this.records[0].t;
    this.database.transaction((sql) => {
      if (replaced !== null) sql.drop.run(hash, replaced);
      sql.put.run(hash, t, JSON.stringify(record));
      sql.prune.run(hash, first);
    });
    const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
    if (durationMs > 5) log.warn('history', 'append-slow', { durationMs, count: this.records.length });
    else if (!this.logged) log.info('history', 'append', { durationMs, count: this.records.length });
    this.logged = true;
  }
  clear() {
    this.hash = '';
    this.records = [];
  }
  // Removing an account also deletes its rows (history.json is unlinked by the caller as before).
  purge() {
    if (this.hash)
      try {
        this.database.sql.purge.run(this.hash);
      } catch (e) {
        log.warn('history', 'purge-failed', { errno: e?.code });
      }
    this.clear();
  }
}

// SQLite when the database opens; otherwise the original JSON store, so history never blocks an account.
function createHistory(database, legacyFile) {
  return database.open() ? new SqliteHistoryStore(database, legacyFile) : new HistoryStore(legacyFile);
}

module.exports = { HistoryDatabase, SqliteHistoryStore, createHistory, KEEP_MS, MAX_RECORDS };
