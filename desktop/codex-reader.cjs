const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { projectJSON } = require('./metadata-json.cjs');
const { normalizeSubscriptionRecord } = require('./tool-analytics.cjs');
const count = (v) => Number.isSafeInteger(v) && v >= 0;
// Locally verified rollout contracts (T5.1). Other versions are read only when their structure matches exactly
// and are reported as unverified; a renamed or missing field fails closed (no guessing at field meanings).
const VERIFIED_VERSIONS = [/^0\.155\./];
const VERSION = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;
const verified = (v) => VERIFIED_VERSIONS.some((re) => re.test(v));
const usageShape = (u) =>
  !!u &&
  typeof u === 'object' &&
  Object.values(u).every(count) &&
  count(u.input_tokens) &&
  count(u.output_tokens) &&
  count(u.total_tokens);
// Highest version by numeric major.minor.patch.
const newest = (versions) =>
  [...versions].sort((a, b) => {
    const x = a.split(/[.+-]/).map(Number),
      y = b.split(/[.+-]/).map(Number);
    for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return y[i] - x[i];
    return 0;
  })[0] || null;
const unverifiedNote = (version) => `${version.split('.').slice(0, 2).join('.')} 版本未经验证，按已知结构读取。`;
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
  let strict = false,
    session = null,
    born = 0,
    version,
    project = null,
    model = null,
    previous = null,
    epoch = 0,
    seen = new Set(),
    unsupported = false;
  const rows = [];
  for (const line of lines(file)) {
    if (!line.trim()) continue;
    const event = projectJSON(line, selection),
      p = event.payload || {},
      at = Date.parse(event.timestamp);
    if (event.type === 'session_meta') {
      if (session && session !== p.id) throw new Error('session');
      session = p.id;
      born = at;
      version = p.cli_version || '';
      project = p.cwd || null;
      if (!VERSION.test(version) || typeof session !== 'string' || !Number.isFinite(born)) {
        unsupported = true;
        break;
      }
      // Unverified versions must match the full known structure (checked per token_count below).
      strict = !verified(version);
      continue;
    }
    if (event.type === 'turn_context') {
      model = p.model || model;
      project = p.cwd || project;
      continue;
    }
    if (event.type !== 'event_msg' || p.type !== 'token_count' || !p.info) continue;
    if (!session || !Number.isFinite(at)) throw new Error('metadata');
    const cumulative = p.info.total_token_usage,
      u = p.info.last_token_usage;
    if (strict && (!usageShape(cumulative) || !usageShape(u)))
      throw Object.assign(new Error('structure'), { code: 'unsupported' });
    if (!cumulative || !count(cumulative.total_tokens)) throw new Error('usage');
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
    if (
      !u ||
      !Object.values(u).every(count) ||
      !count(u.input_tokens) ||
      !count(u.output_tokens) ||
      !count(u.total_tokens)
    )
      throw new Error('usage');
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
  return { rows, version };
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
      // T5.1: each cached file's rollout version. Rows of unverified versions are cached only here (never in
      // codex_files), so an older build that rejects those versions cannot read them from its cache after a rollback.
      'CREATE TABLE IF NOT EXISTS codex_file_versions(source_id TEXT,file TEXT,size INTEGER,modified REAL,version TEXT,rows TEXT,PRIMARY KEY(source_id,file));',
  );
  const get = db.prepare('SELECT * FROM codex_files WHERE source_id=? AND file=?'),
    save = db.prepare('INSERT OR REPLACE INTO codex_files VALUES (?,?,?,?,?)'),
    getVersion = db.prepare('SELECT * FROM codex_file_versions WHERE source_id=? AND file=?'),
    saveVersion = db.prepare('INSERT OR REPLACE INTO codex_file_versions VALUES (?,?,?,?,?,?)'),
    dropCached = db.prepare('DELETE FROM codex_files WHERE source_id=? AND file=?');
  const records = new Map();
  const unverified = new Set();
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
        let rows, version;
        if (fresh(cachedVersion) && !verified(cachedVersion.version) && cachedVersion.rows) {
          rows = JSON.parse(cachedVersion.rows);
          version = cachedVersion.version;
        } else if (fresh(cachedVersion) && verified(cachedVersion.version) && fresh(cached)) {
          rows = JSON.parse(cached.rows);
          version = cachedVersion.version;
        } else {
          ({ rows, version } = readRollout(file, source.id));
          if (verified(version)) {
            save.run(source.id, file, stat.size, stat.mtimeMs, JSON.stringify(rows));
            saveVersion.run(source.id, file, stat.size, stat.mtimeMs, version, null);
          } else {
            dropCached.run(source.id, file);
            saveVersion.run(source.id, file, stat.size, stat.mtimeMs, version, JSON.stringify(rows));
          }
        }
        if (!verified(version)) unverified.add(version);
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
  const observedVersion = newest(unverified);
  return {
    rows: [...records.values()].slice(0, 100000),
    status: rejected ? 'stale' : 'ready',
    truncated,
    ...(observedVersion ? { contract: 'unverified-version', observedVersion } : {}),
    message:
      (rejected ? `${rejected} 个日志的版本或用量格式不受支持，已排除。` : '') +
      (observedVersion ? unverifiedNote(observedVersion) : '') +
      'Codex 本机用量快照，不等于请求次数',
    messageDetail: '0.155.x 格式。缺少终态的记录不参与成功率；历史继承与重复快照不累计。',
  };
}
module.exports = { readFile, readRollout, scanCodex, selection, lines, VERIFIED_VERSIONS, newest, unverifiedNote };
