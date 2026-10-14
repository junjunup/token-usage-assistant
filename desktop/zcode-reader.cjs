const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');
const { aggregateLocal } = require('./analytics-core.cjs');
const REQUIRED = ['id', 'session_id', 'started_at', 'model_id', 'status', 'input_tokens', 'output_tokens'];
const OPTIONAL = ['provider_id', 'cache_creation_input_tokens', 'cache_read_input_tokens', 'computed_total_tokens'];
function readZcodeRows(file, range) {
  if (!fs.existsSync(file))
    return {
      source: 'local',
      status: 'missing',
      message: '未找到本机 Zcode 用量数据库，可在下方选择数据库文件。',
      range,
    };
  let db;
  try {
    db = new DatabaseSync(file, { readOnly: true, enableLoadExtension: false });
    db.exec('PRAGMA query_only=ON; PRAGMA busy_timeout=3000; BEGIN');
    const columns = new Set(
      db
        .prepare('PRAGMA table_info(model_usage)')
        .all()
        .map((c) => c.name),
    );
    const sessionColumns = new Set(
      db
        .prepare('PRAGMA table_info(session)')
        .all()
        .map((c) => c.name),
    );
    if (REQUIRED.some((c) => !columns.has(c)) || !sessionColumns.has('id') || !sessionColumns.has('directory'))
      return { source: 'local', status: 'schema', message: '这份数据库缺少所需用量字段，暂不支持当前格式。', range };
    // Explicit projection intentionally excludes prompts, messages, raw payloads and error text.
    const projection = [
      ...REQUIRED.map((c) => `u.${c}`),
      ...OPTIONAL.map((c) => (columns.has(c) ? `u.${c}` : `NULL AS ${c}`)),
      's.directory',
    ].join(',');
    const start = range.start - (range.end - range.start),
      rows = db
        .prepare(
          `SELECT ${projection} FROM model_usage u LEFT JOIN (SELECT id,MIN(directory) AS directory FROM session GROUP BY id) s ON s.id=u.session_id WHERE u.started_at>=? AND u.started_at<=? ORDER BY u.started_at DESC LIMIT 100001`,
        )
        .all(start, range.end);
    const truncated = rows.length > 100000;
    if (truncated) rows.pop();
    return {
      rows,
      status: 'ready',
      updatedAt: Date.now(),
      truncated,
      scannedRows: rows.length,
      cacheColumns: OPTIONAL.slice(1, 3).every((c) => columns.has(c)),
      oldestIncludedAt: rows.length ? rows.reduce((n, r) => Math.min(n, r.started_at), Infinity) : null,
    };
  } catch {
    return {
      source: 'local',
      status: 'error',
      message: '暂时无法只读打开 Zcode 数据，请稍后重试或重新选择数据库。',
      range,
    };
  } finally {
    if (db) {
      try {
        db.exec('ROLLBACK');
      } catch {}
      db.close();
    }
  }
}
function readZcode(file, range, filters = {}, prices = {}) {
  const result = readZcodeRows(file, range);
  if (result.status !== 'ready') return result;
  const { rows, ...metadata } = result;
  return { ...aggregateLocal(rows, range, filters, prices), ...metadata };
}
module.exports = { readZcode, readZcodeRows, REQUIRED, OPTIONAL };
