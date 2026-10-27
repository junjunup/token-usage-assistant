const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { projectJSON } = require('./metadata-json.cjs');
const { normalizeSubscriptionRecord } = require('./tool-analytics.cjs');
// Rollout usage follows the structure contract (T5.1, T9.13 / D15): any version is read when the core counts are
// present and well-formed; a renamed or missing core field fails closed (no guessing at field meanings).
// T9.13 (D15): the versions whose rollout structure was last reviewed by hand. Informational only — the upstream
// check script compares new releases against it; reading follows the structure contract for every version.
const VERIFIED_VERSIONS = [/^0\.155\./];
const VERSION = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;
const {
  codexUsageViolation,
  missingOptional,
  SOURCE_OPTIONAL,
  partialNote,
  fieldNames,
  usageFieldNames,
} = require('./upstream-contracts.cjs');
// Highest version by numeric major.minor.patch.
const newest = (versions) =>
  [...versions].sort((a, b) => {
    const x = a.split(/[.+-]/).map(Number),
      y = b.split(/[.+-]/).map(Number);
    for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return y[i] - x[i];
    return 0;
  })[0] || null;
const tokenFields = Object.fromEntries(
  [
    'input_tokens',
    'cached_input_tokens',
    'cache_write_input_tokens',
    'output_tokens',
    'reasoning_output_tokens',
    'total_tokens',
  ].map((k) => [k, true]),
);
const selection = {
  timestamp: true,
  type: true,
  payload: {
    type: true,
    id: true,
    cwd: true,
    cli_version: true,
    forked_from_id: true,
    model: true,
    turn_id: true,
    info: { total_token_usage: tokenFields, last_token_usage: tokenFields },
  },
};
function* lines(file) {
  const fd = fs.openSync(file, 'r'),
    buf = Buffer.alloc(65536);
  let carry = Buffer.alloc(0);
  try {
    let n;
    while ((n = fs.readSync(fd, buf, 0, buf.length, null))) {
      const data = Buffer.concat([carry, buf.subarray(0, n)]);
      let start = 0,
        end;
      while ((end = data.indexOf(10, start)) >= 0) {
        yield data.subarray(start, end).toString('utf8');
        start = end + 1;
      }
      carry = Buffer.from(data.subarray(start));
      if (carry.length > 64 * 1024 * 1024) throw new Error('line-limit');
    }
  } finally {
    fs.closeSync(fd);
  }
}
function readRollout(file, sourceId) {
  let session = null,
    born = 0,
    version,
    project = null,
    model = null,
    previous = null,
    epoch = 0,
    seen = new Set(),
    unsupported = false;
  const rows = [],
    fieldSet = new Set();
  for (const line of lines(file)) {
    if (!line.trim()) continue;
    const event = projectJSON(line, selection),
      p = event.payload || {},
      at = Date.parse(event.timestamp);
    if (event.type === 'session_meta') {
      if (session && session !== p.id) throw new Error('session');
      session = p.id;
      born = at;
      // The version is kept for details only (D15); a session needs an id and a start time.
      version = typeof p.cli_version === 'string' && VERSION.test(p.cli_version) ? p.cli_version : null;
      project = p.cwd || null;
      if (typeof session !== 'string' || !Number.isFinite(born)) {
        unsupported = true;
        break;
      }
      continue;
    }
    if (event.type === 'turn_context') {
      model = p.model || model;
      project = p.cwd || project;
      continue;
    }
    if (event.type !== 'event_msg' || p.type !== 'token_count' || !p.info) continue;
    // T9.14: the names of the usage counters this version reports. token_count lines carry only numbers, so the full
    // line is parsed here to see names outside the projection; values are never kept.
    try {
      const raw = JSON.parse(line)?.payload?.info?.last_token_usage;
      if (raw && typeof raw === 'object' && !Array.isArray(raw))
        for (const name of Object.keys(raw)) fieldSet.add(name);
    } catch {
      // The projection above already accepted the line; a parse failure only leaves the fingerprint incomplete.
    }
    if (!session || !Number.isFinite(at)) throw new Error('metadata');
    const cumulative = p.info.total_token_usage,
      u = p.info.last_token_usage;
    // T9.13: the structure contract applies to every version (core counts present, every count a non-negative integer).
    if (codexUsageViolation(cumulative) || codexUsageViolation(u))
      throw Object.assign(new Error('structure'), { code: 'unsupported' });
    const signature = JSON.stringify(cumulative);
    // Forks retain old event timestamps. These establish context, never new consumption.
    if (at < born) {
      previous = cumulative;
      continue;
    }
    if (previous && cumulative.total_tokens < previous.total_tokens) {
      epoch++;
      previous = cumulative;
      continue;
    }
    if (previous && signature === JSON.stringify(previous)) continue;
    previous = cumulative;
    const attemptId = crypto
      .createHash('sha256')
      .update(JSON.stringify([session, epoch, cumulative]))
      .digest('hex');
    if (seen.has(attemptId)) continue;
    seen.add(attemptId);
    rows.push(
      normalizeSubscriptionRecord(
        {
          tool: 'codex',
          requestId: attemptId,
          attemptId,
          sessionId: session,
          timestamp: at,
          model,
          project,
          status: 'unknown',
          usage: {
            input: u.input_tokens,
            output: u.output_tokens,
            read: u.cached_input_tokens ?? null,
            write: u.cache_write_input_tokens ?? null,
            reasoning: u.reasoning_output_tokens ?? null,
            total: u.total_tokens,
          },
        },
        sourceId,
      ),
    );
  }
  if (unsupported) throw Object.assign(new Error('version'), { code: 'unsupported' });
  return { rows, version, fields: usageFieldNames(fieldSet) };
}
function readFile(file, sourceId) {
  return readRollout(file, sourceId).rows;
}
function scanCodex(db, source, range) {
  if (!fs.existsSync(source.file))
    return { rows: [], status: 'missing', message: 'Codex 配置目录已移动，请重新选择。' };
  const files = [];
  function visit(dir) {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isSymbolicLink()) continue;
      const file = path.join(dir, e.name);
      if (e.isDirectory()) visit(file);
      else if (e.isFile() && /^rollout-.*\.jsonl$/.test(e.name)) {
        if (files.length >= 50000) throw new Error('file-limit');
        files.push(file);
      }
    }
  }
  visit(path.join(source.file, 'sessions'));
  visit(path.join(source.file, 'archived_sessions'));
  db.exec(
    'CREATE TABLE IF NOT EXISTS codex_files(source_id TEXT,file TEXT,size INTEGER,modified REAL,rows TEXT,PRIMARY KEY(source_id,file));' +
      // T5.1: each cached file's rollout version. Since T9.13 rows of every version are cached only here and
      // codex_files is no longer written, so an older build after a rollback re-reads 0.155 files itself and only
      // reuses rows of other versions, which it also accepted under its own (stricter) structural check.
      'CREATE TABLE IF NOT EXISTS codex_file_versions(source_id TEXT,file TEXT,size INTEGER,modified REAL,version TEXT,rows TEXT,PRIMARY KEY(source_id,file));' +
      // T9.14: field-name fingerprints in their own table, so the tables older builds write keep their columns.
      'CREATE TABLE IF NOT EXISTS codex_file_fields(source_id TEXT,file TEXT,size INTEGER,modified REAL,fields TEXT,PRIMARY KEY(source_id,file));',
  );
  const get = db.prepare('SELECT * FROM codex_files WHERE source_id=? AND file=?'),
    getVersion = db.prepare('SELECT * FROM codex_file_versions WHERE source_id=? AND file=?'),
    saveVersion = db.prepare('INSERT OR REPLACE INTO codex_file_versions VALUES (?,?,?,?,?,?)'),
    dropCached = db.prepare('DELETE FROM codex_files WHERE source_id=? AND file=?'),
    getFields = db.prepare('SELECT * FROM codex_file_fields WHERE source_id=? AND file=?'),
    saveFields = db.prepare('INSERT OR REPLACE INTO codex_file_fields VALUES (?,?,?,?,?)');
  // The fingerprint of the most recently modified file that has one: what the current Codex version writes.
  let latestFields = null,
    latestModified = -Infinity;
  const records = new Map();
  let rejected = 0,
    unsupported = 0,
    truncated = false;
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const file of files) {
      const stat = fs.statSync(file);
      if (stat.mtimeMs < range.start - (range.end - range.start)) continue;
      try {
        const cached = get.get(source.id, file),
          cachedVersion = getVersion.get(source.id, file),
          fresh = (c) => c && c.size === stat.size && c.modified === stat.mtimeMs;
        let rows;
        if (fresh(cachedVersion) && cachedVersion.rows) {
          rows = JSON.parse(cachedVersion.rows);
        } else if (fresh(cachedVersion) && fresh(cached)) {
          // Cached by a build before T9.13 (a reviewed 0.155 file): reuse once, then move it to the new table.
          rows = JSON.parse(cached.rows);
          dropCached.run(source.id, file);
          saveVersion.run(source.id, file, stat.size, stat.mtimeMs, cachedVersion.version, cached.rows);
        } else {
          let version, fields;
          ({ rows, version, fields } = readRollout(file, source.id));
          dropCached.run(source.id, file);
          saveVersion.run(source.id, file, stat.size, stat.mtimeMs, version ?? '', JSON.stringify(rows));
          if (fields.length) saveFields.run(source.id, file, stat.size, stat.mtimeMs, JSON.stringify(fields));
        }
        const cachedFields = getFields.get(source.id, file);
        if (fresh(cachedFields) && stat.mtimeMs > latestModified) {
          latestModified = stat.mtimeMs;
          latestFields = fieldNames(JSON.parse(cachedFields.fields));
        }
        for (const row of rows)
          if (row.at >= range.start - (range.end - range.start) && row.at <= range.end) {
            records.set(row.attemptId, row);
            if (records.size > 100000) {
              truncated = true;
              break;
            }
          }
      } catch (e) {
        rejected++;
        if (e.code === 'unsupported') unsupported++;
      }
      if (truncated) break;
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  const rows = [...records.values()].slice(0, 100000),
    missing = missingOptional(rows, SOURCE_OPTIONAL.codex);
  return {
    rows,
    status: rejected ? 'stale' : 'ready',
    truncated,
    ...(missing.length ? { contract: 'partial', missing } : {}),
    ...(latestFields ? { fields: latestFields } : {}),
    message:
      (rejected ? `${rejected} 个日志的用量格式不兼容，已排除。` : '') +
      partialNote(missing) +
      'Codex 本机用量快照，不等于请求次数',
    messageDetail:
      '按结构契约读取，任何版本只要核心字段齐全就照常统计。缺少终态的记录不参与成功率；历史继承与重复快照不累计。',
  };
}
module.exports = { readFile, readRollout, scanCodex, selection, lines, VERIFIED_VERSIONS, newest };
