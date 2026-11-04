// Tools that keep only each session's running token total (T13.2, D20: "会话级汇总"): Goose (sessions.db) and Crush
// (a project's .crush/crush.db). Read-only like the OpenCode reader: the database is opened read-only, only the
// whitelisted columns below are selected (never names, descriptions, recipes, message content or settings), and
// nothing is written.
// - One row per session, dated by the session's last update, so a session spanning days counts on its last day.
//   The tool analysis says so ("会话级汇总，不是请求数"); these rows have no request status.
// - Input is the tool's own accumulated input; cache counts are not used (not recorded, or provider-dependent), so
//   cache stays unknown ("—").
// - Crush: only top-level sessions, like Crush's own statistics (sub-agent sessions are rolled into their parent).
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');
const { normalizeSubscriptionRecord } = require('./tool-analytics.cjs');
const { missingOptional, SOURCE_OPTIONAL, partialNote } = require('./upstream-contracts.cjs');
const MAX_ROWS = 100000;

/** SQLite timestamps: Unix seconds or milliseconds, or text in UTC ("YYYY-MM-DD HH:MM:SS", ISO with or without Z). */
function parseTime(v) {
  if (typeof v === 'number' || typeof v === 'bigint') {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? (n > 1e12 ? n : n * 1000) : null;
  }
  if (typeof v !== 'string') return null;
  const text = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(v) ? v.replace(' ', 'T') + 'Z' : v;
  const at = Date.parse(text);
  return Number.isFinite(at) && at > 0 ? at : null;
}

const TOOLS = {
  goose: {
    name: 'Goose',
    dbName: 'sessions.db',
    table: 'sessions',
    required: ['id', 'updated_at', 'accumulated_input_tokens', 'accumulated_output_tokens'],
    query: (has) =>
      `SELECT id,updated_at,accumulated_input_tokens AS input,accumulated_output_tokens AS output,` +
      `${has('accumulated_total_tokens') ? 'accumulated_total_tokens' : 'NULL'} AS total,` +
      `${has('provider_name') ? 'provider_name' : 'NULL'} AS provider,` +
      // Only the model name leaf of the model settings JSON.
      `${has('model_config_json') ? "CASE WHEN json_valid(model_config_json) THEN json_extract(model_config_json,'$.model_name') END" : 'NULL'} AS model,` +
      `${has('working_dir') ? 'working_dir' : 'NULL'} AS project FROM sessions`,
  },
  crush: {
    name: 'Crush',
    dbName: 'crush.db',
    table: 'sessions',
    required: ['id', 'parent_session_id', 'prompt_tokens', 'completion_tokens', 'updated_at'],
    query: (has, hasMessages) =>
      `SELECT s.id,s.updated_at,s.prompt_tokens AS input,s.completion_tokens AS output,NULL AS total,` +
      (hasMessages
        ? "(SELECT m.provider FROM messages m WHERE m.session_id=s.id AND m.role='assistant' ORDER BY m.created_at DESC LIMIT 1) AS provider," +
          "(SELECT m.model FROM messages m WHERE m.session_id=s.id AND m.role='assistant' ORDER BY m.created_at DESC LIMIT 1) AS model,"
        : 'NULL AS provider,NULL AS model,') +
      'NULL AS project FROM sessions s WHERE s.parent_session_id IS NULL',
  },
};

const integer = (v) => {
  const n = typeof v === 'bigint' ? Number(v) : v;
  return typeof n === 'number' && Number.isSafeInteger(n) && n >= 0 ? n : null;
};

/** @param {'goose'|'crush'} tool */
function readSessionTotals(tool, source, range) {
  const t = TOOLS[tool];
  if (!fs.existsSync(source.file))
    return { rows: [], status: 'missing', message: `未找到 ${t.name} 数据库，请重新选择 ${t.dbName}。` };
  const schema = { rows: [], status: 'schema', message: `${t.name} 数据库结构暂不支持，原文件未修改。` };
  let db;
  try {
    db = new DatabaseSync(source.file, { readOnly: true, enableLoadExtension: false });
    db.exec('PRAGMA query_only=ON; PRAGMA busy_timeout=3000; BEGIN');
    const columns = (name) =>
      new Set(
        db
          .prepare(`PRAGMA table_info(${name})`)
          .all()
          .map((c) => c.name),
      );
    const cols = columns(t.table);
    if (!t.required.every((c) => cols.has(c))) return schema;
    const messageCols = columns('messages'),
      hasMessages = ['session_id', 'role', 'created_at', 'model', 'provider'].every((c) => messageCols.has(c));
    const from = range.start - (range.end - range.start);
    const rows = [];
    let invalid = 0,
      truncated = false;
    for (const r of db.prepare(t.query((c) => cols.has(c), hasMessages)).iterate()) {
      const input = integer(r.input),
        output = integer(r.output),
        at = parseTime(r.updated_at);
      // A session that never reported usage is not a zero.
      if ((r.input === null || r.input === undefined) && (r.output === null || r.output === undefined)) continue;
      if (input === null || output === null || at === null || typeof r.id !== 'string' || !r.id) {
        invalid++;
        continue;
      }
      if (at < from || at > range.end) continue;
      if (rows.length >= MAX_ROWS) {
        truncated = true;
        break;
      }
      rows.push(
        normalizeSubscriptionRecord(
          {
            tool,
            requestId: r.id,
            attemptId: r.id,
            sessionId: r.id,
            timestamp: at,
            revision: at,
            provider: typeof r.provider === 'string' ? r.provider : null,
            model: typeof r.model === 'string' ? r.model : null,
            project: typeof r.project === 'string' ? r.project : null,
            status: 'unknown',
            usage: { input, output, read: null, write: null, reasoning: null, total: integer(r.total) },
          },
          source.id,
        ),
      );
    }
    const missing = missingOptional(rows, SOURCE_OPTIONAL.sessionTotals);
    return {
      rows,
      status: invalid ? 'stale' : 'ready',
      truncated,
      ...(missing.length ? { contract: 'partial', missing } : {}),
      message:
        (invalid ? `${invalid} 个会话的用量格式不兼容，已排除。` : '') +
        partialNote(missing) +
        `${t.name} 会话级汇总：每条是一个会话的累计用量，不是请求数`,
      messageDetail: `${t.name} 只保存每个会话一共用了多少，没有逐次请求记录。每个会话记一行，时间取会话最后更新的时间，跨天的会话整段算在最后那天。缓存读写不计入、显示为「—」。数据库只读打开，不读会话标题和对话内容。`,
    };
  } catch {
    return { rows: [], status: 'error', message: `暂时无法只读解析 ${t.name} 数据库，请稍后重试或检查文件。` };
  } finally {
    if (db) {
      try {
        db.exec('ROLLBACK');
      } catch {
        // Best-effort rollback of the read transaction.
      }
      db.close();
    }
  }
}
module.exports = { readSessionTotals, parseTime, TOOLS };
