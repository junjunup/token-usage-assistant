const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');
const { normalizeOpenCodeRecord } = require('./tool-analytics.cjs');
const MAX_ROWS = 100000;
const schema = () => ({
  status: 'schema',
  message: 'OpenCode 数据库结构暂不支持，原文件未修改。请选择含用量记录的 opencode.db。',
});

function readOpenCodeRows(file, range, sourceId) {
  if (!fs.existsSync(file)) return { status: 'missing', message: '未找到 OpenCode 数据库，请重新选择 opencode.db。' };
  let db;
  try {
    db = new DatabaseSync(file, { readOnly: true, enableLoadExtension: false });
    db.exec('PRAGMA query_only=ON; PRAGMA busy_timeout=3000; BEGIN');
    const tables = new Set(
      db
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all()
        .map((r) => r.name),
    );
    const columns = (name) =>
      new Set(
        db
          .prepare(`PRAGMA table_info(${name})`)
          .all()
          .map((c) => c.name),
      );
    const has = (name, required) => tables.has(name) && required.every((c) => columns(name).has(c));
    if (!has('session', ['id', 'directory', 'time_created'])) return schema();
    const v1 = has('message', ['id', 'session_id', 'time_created', 'time_updated', 'data']);
    const v2 = has('session_message', ['id', 'session_id', 'type', 'time_created', 'time_updated', 'data']);
    if ((!v1 && !v2) || (tables.has('message') && !v1) || (tables.has('session_message') && !v2)) return schema();
    const parts = has('part', ['id', 'message_id', 'session_id', 'data', 'time_created', 'time_updated']);
    if (tables.has('part') && !parts) return schema();
    // JSON extraction happens inside SQLite: no full message, content, error, or credential leaves the source database.
    const leaf = (alias, key) => `json_extract(${alias}.data,'$.${key}')`;
    const tokens = (alias) =>
      ['input', 'output', 'reasoning', 'total']
        .map((k) => `${leaf(alias, 'tokens.' + k)} AS ${k}`)
        .concat(['read', 'write'].map((k) => `${leaf(alias, 'tokens.cache.' + k)} AS ${k}`))
        .join(',');
    const at = (alias) => leaf(alias, 'time.created');
    const start = range.start - (range.end - range.start),
      end = range.end;
    const common = (alias) =>
      `s.directory,s.time_created AS session_created,${at(alias)} AS at,${alias}.time_updated AS updated_at`;
    // A session migrated to v2 has one authoritative representation; never add its legacy mirror again.
    const excludeV2 = v2
      ? "AND NOT EXISTS (SELECT 1 FROM session_message newer WHERE newer.session_id=m.session_id AND newer.type='assistant')"
      : '';
    const queries = [];
    if (v2)
      queries.push(`SELECT 'v2-message:'||m.id AS id,m.session_id,'v2-message' AS format,${common('m')},${leaf('m', 'model.providerID')} AS provider,${leaf('m', 'model.id')} AS model,${tokens('m')}
      FROM session_message m JOIN session s ON s.id=m.session_id WHERE m.type='assistant' AND json_valid(m.data) AND ${at('m')}>=? AND ${at('m')}<=?`);
    if (v1) {
      if (parts)
        queries.push(`SELECT 'v1-step:'||p.id AS id,m.session_id,'v1-step' AS format,${common('m')},${leaf('m', 'providerID')} AS provider,${leaf('m', 'modelID')} AS model,${tokens('p')}
        FROM message m JOIN session s ON s.id=m.session_id JOIN part p ON p.message_id=m.id AND p.session_id=m.session_id
        WHERE json_valid(m.data) AND json_valid(p.data) AND ${leaf('m', 'role')}='assistant' AND ${leaf('p', 'type')}='step-finish' AND ${at('m')}>=? AND ${at('m')}<=? ${excludeV2}`);
      queries.push(`SELECT 'v1-message:'||m.id AS id,m.session_id,'v1-message' AS format,${common('m')},${leaf('m', 'providerID')} AS provider,${leaf('m', 'modelID')} AS model,${tokens('m')}
        FROM message m JOIN session s ON s.id=m.session_id WHERE json_valid(m.data) AND ${leaf('m', 'role')}='assistant' AND ${at('m')}>=? AND ${at('m')}<=? ${excludeV2}
        ${parts ? "AND NOT EXISTS (SELECT 1 FROM part p WHERE p.message_id=m.id AND p.session_id=m.session_id AND json_valid(p.data) AND json_extract(p.data,'$.type')='step-finish')" : ''}`);
    }
    // Corrupt JSON or missing timestamps must not disappear as apparently complete successful imports.
    let invalid = 0;
    for (const [table, role] of [
      ['message', "json_extract(data,'$.role')='assistant'"],
      ['session_message', "type='assistant'"],
    ]) {
      if (!tables.has(table)) continue;
      invalid += Number(
        db
          .prepare(
            `SELECT COUNT(*) AS n FROM ${table} WHERE NOT json_valid(data) OR (CASE WHEN json_valid(data) THEN (${role} AND (json_type(data,'$.time.created') NOT IN ('integer','real') OR json_extract(data,'$.time.created') IS NULL)) ELSE 0 END)`,
          )
          .get().n,
      );
    }
    if (parts) invalid += Number(db.prepare('SELECT COUNT(*) AS n FROM part WHERE NOT json_valid(data)').get().n);
    if (invalid) return schema();
    const all = db
      .prepare(queries.map((q) => 'SELECT * FROM (' + q + ')').join(' UNION ALL ') + ' ORDER BY at DESC,id LIMIT ?')
      .all(...queries.flatMap(() => [start, end]), MAX_ROWS + 1);
    const truncated = all.length > MAX_ROWS;
    if (truncated) all.pop();
    let inherited = 0;
    const rows = [];
    for (const r of all) {
      if (
        typeof r.at !== 'number' ||
        !Number.isFinite(r.at) ||
        typeof r.session_created !== 'number' ||
        r.session_created <= 0
      )
        return schema();
      // Fork/import clones retain original event times. Exclude history predating this session.
      if (r.at < r.session_created) {
        inherited++;
        continue;
      }
      rows.push(normalizeOpenCodeRecord(r, sourceId));
    }
    const note =
      '统计 OpenCode 已保存的助手步骤/用量记录，不等于完整 HTTP 请求数；失败状态与未落盘重试不可核对。本机统计不代表套餐账单。';
    return {
      rows,
      status: 'ready',
      truncated,
      message:
        note +
        (inherited ? ` 已排除 ${inherited} 条早于本会话创建的复制历史。` : '') +
        (truncated ? ' 本次仅读取最近 100000 条记录。' : ''),
      inherited,
      formatVersion: v1 && v2 ? 'v1/v2' : v2 ? 'v2' : 'v1',
    };
  } catch {
    return { status: 'error', message: '暂时无法只读解析 OpenCode 数据库，请稍后重试或检查文件格式。' };
  } finally {
    if (db) {
      try {
        db.exec('ROLLBACK');
      } catch {
        // Best-effort rollback of the read transaction; no transaction may be open after an error.
      }
      db.close();
    }
  }
}
module.exports = { readOpenCodeRows };
