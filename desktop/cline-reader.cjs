// Cline session files (T13.2, D20): <data>/sessions/<id>/<id>.messages.json (default data folder ~/.cline/data), the
// SDK store Cline's VS Code extension and CLI write since its storage move (cline/cline sdk/packages/core,
// docs/messages-contract-v1.md). Read-only and by structure (D15): only the whitelisted leaves below are decoded, so
// prompts, replies, thinking and tool data never enter memory as values.
// - The last assistant message of a turn carries `metrics` (inputTokens, outputTokens, cacheReadTokens,
//   cacheWriteTokens, cost) and `modelInfo` (id, provider): one row per turn, not per model call.
// - Whether inputTokens includes cache reads / writes depends on the provider (the SDK keeps what each provider
//   reports), so the cache counts are not used: input is Cline's reported input, cache stays unknown ("—").
// - A message keeps its id when a session is forked, so each message id counts once.
// - Pre-SDK tasks (tasks/<id>/ui_messages.json in VS Code's storage) are not read: their counts sit inside a string
//   that also holds the prompt.
const fs = require('node:fs');
const path = require('node:path');
const { projectJSON } = require('./metadata-json.cjs');
const { normalizeSubscriptionRecord } = require('./tool-analytics.cjs');
const {
  clineUsageViolation,
  missingOptional,
  SOURCE_OPTIONAL,
  partialNote,
  usageFieldNames,
} = require('./upstream-contracts.cjs');
const metrics = { inputTokens: true, outputTokens: true, cacheReadTokens: true, cacheWriteTokens: true, cost: true };
const selection = {
  sessionId: true,
  messages: [{ id: true, role: true, ts: true, modelInfo: { id: true, provider: true }, metrics }],
};
const MAX_FILE = 64 * 1024 * 1024;

function readMessages(file, sourceId) {
  if (fs.statSync(file).size > MAX_FILE) throw new Error('size');
  const doc = projectJSON(fs.readFileSync(file, 'utf8'), selection);
  if (!Array.isArray(doc.messages)) throw Object.assign(new Error('structure'), { code: 'unsupported' });
  const session =
    typeof doc.sessionId === 'string' && doc.sessionId ? doc.sessionId : path.basename(path.dirname(file));
  const rows = [],
    fieldSet = new Set();
  for (const m of doc.messages) {
    if (!m || m.role !== 'assistant' || m.metrics === undefined || m.metrics === null) continue;
    // T9.14: the names of the counters this version reports; values are never kept.
    if (typeof m.metrics === 'object') for (const name of Object.keys(m.metrics)) fieldSet.add('metrics.' + name);
    if (clineUsageViolation(m.metrics)) throw Object.assign(new Error('structure'), { code: 'unsupported' });
    if (typeof m.id !== 'string' || !m.id || typeof m.ts !== 'number' || !Number.isFinite(m.ts) || m.ts <= 0)
      throw new Error('metadata');
    rows.push(
      normalizeSubscriptionRecord(
        {
          tool: 'cline',
          requestId: m.id,
          attemptId: m.id,
          sessionId: session,
          timestamp: m.ts,
          model: typeof m.modelInfo?.id === 'string' ? m.modelInfo.id : null,
          provider: typeof m.modelInfo?.provider === 'string' ? m.modelInfo.provider : null,
          project: null,
          status: 'unknown',
          usage: {
            input: m.metrics.inputTokens,
            output: m.metrics.outputTokens,
            read: null,
            write: null,
            reasoning: null,
            total: null,
          },
        },
        sourceId,
      ),
    );
  }
  return { rows, fields: usageFieldNames(fieldSet) };
}

function scanCline(db, source, range) {
  const sessions = path.join(source.file, 'sessions');
  if (!fs.existsSync(sessions)) return { rows: [], status: 'missing', message: 'Cline 数据目录已移动，请重新选择。' };
  const files = [];
  for (const e of fs.readdirSync(sessions, { withFileTypes: true })) {
    if (!e.isDirectory() || e.isSymbolicLink()) continue;
    const file = path.join(sessions, e.name, e.name + '.messages.json');
    if (fs.existsSync(file)) {
      if (files.length >= 50000) throw new Error('file-limit');
      files.push(file);
    }
  }
  db.exec(
    'CREATE TABLE IF NOT EXISTS cline_files(source_id TEXT,file TEXT,size INTEGER,modified REAL,rows TEXT,fields TEXT,PRIMARY KEY(source_id,file));',
  );
  const get = db.prepare('SELECT * FROM cline_files WHERE source_id=? AND file=?'),
    save = db.prepare('INSERT OR REPLACE INTO cline_files VALUES (?,?,?,?,?,?)');
  const records = new Map();
  let rejected = 0,
    truncated = false,
    latestFields = null,
    latestModified = -Infinity;
  const from = range.start - (range.end - range.start);
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const file of files) {
      const stat = fs.statSync(file);
      if (stat.mtimeMs < from) continue;
      try {
        const cached = get.get(source.id, file);
        let rows, fields;
        if (cached && cached.size === stat.size && cached.modified === stat.mtimeMs) {
          rows = JSON.parse(cached.rows);
          fields = JSON.parse(cached.fields || '[]');
        } else {
          ({ rows, fields } = readMessages(file, source.id));
          save.run(source.id, file, stat.size, stat.mtimeMs, JSON.stringify(rows), JSON.stringify(fields));
        }
        if (fields.length && stat.mtimeMs > latestModified) {
          latestModified = stat.mtimeMs;
          latestFields = fields;
        }
        // A forked session's copy of a turn keeps its message id: kept once.
        for (const row of rows)
          if (row.at >= from && row.at <= range.end) {
            records.set(row.attemptId, row);
            if (records.size > 100000) {
              truncated = true;
              break;
            }
          }
      } catch {
        rejected++;
      }
      if (truncated) break;
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  const rows = [...records.values()].slice(0, 100000),
    missing = missingOptional(rows, SOURCE_OPTIONAL.sessionTotals);
  return {
    rows,
    status: rejected ? 'stale' : 'ready',
    truncated,
    ...(missing.length ? { contract: 'partial', missing } : {}),
    ...(latestFields ? { fields: latestFields } : {}),
    message:
      (rejected ? `${rejected} 个会话文件的用量格式不兼容，已排除。` : '') +
      partialNote(missing) +
      'Cline 本机会话里每轮对话的用量',
    messageDetail:
      '按结构契约读取每轮最后一条回复的 metrics：输入、输出是核心字段。输入是否含缓存因服务商而异，所以缓存读写不计入、显示为「—」。一轮可能包含多次模型调用，记录数不等于请求数；分叉会话复制的轮次只算一次；不读取对话内容。旧版（存储迁移前）的任务不读取。',
  };
}
module.exports = { readMessages, scanCline, selection };
