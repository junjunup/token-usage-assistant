// Qwen Code session files (T12.5, D19): <home>/projects/<project>/chats/<session id>.jsonl (older versions:
// <home>/tmp/<hash>/chats), written by Qwen Code's chat recording service (QwenLM/qwen-code). Read-only and by
// structure (D15): only the whitelisted leaves below are decoded, so prompts, replies and tool data never enter memory.
// - Every line is a ChatRecord (uuid, sessionId, timestamp, type). `assistant` records carry the model reply's
//   usageMetadata (Gemini API field names) and the model.
// - /branch copies records verbatim, keeping their uuid: each uuid counts once. Rewinds keep the old records (the
//   replies were generated and reported their usage), so they still count.
// - Gemini's totalTokenCount = prompt + candidates + thoughts + tool-use prompt. Here output = candidates + thoughts
//   and reasoning = thoughts (a subset of output), cached = cache reads within input; nothing is counted twice.
const fs = require('node:fs');
const path = require('node:path');
const { projectJSON } = require('./metadata-json.cjs');
const { lines } = require('./codex-reader.cjs');
const { normalizeSubscriptionRecord } = require('./tool-analytics.cjs');
const {
  qwenUsageViolation,
  missingOptional,
  SOURCE_OPTIONAL,
  partialNote,
  usageFieldNames,
} = require('./upstream-contracts.cjs');
const usageFields = {
  promptTokenCount: true,
  candidatesTokenCount: true,
  cachedContentTokenCount: true,
  thoughtsTokenCount: true,
  toolUsePromptTokenCount: true,
  totalTokenCount: true,
};
const selection = { uuid: true, sessionId: true, timestamp: true, type: true, model: true, usageMetadata: usageFields };
// Cheap pre-filter: only assistant lines with usage are projected at all.
const USAGE_LINE = /"usageMetadata"\s*:/;

function readChat(file, sourceId) {
  const rows = [],
    fieldSet = new Set();
  for (const line of lines(file)) {
    if (!USAGE_LINE.test(line)) continue;
    const record = projectJSON(line, selection);
    if (record.type !== 'assistant' || record.usageMetadata === undefined || record.usageMetadata === null) continue;
    // T9.14: the names of the counters this version reports; values are never kept.
    try {
      const raw = JSON.parse(line)?.usageMetadata;
      if (raw && typeof raw === 'object' && !Array.isArray(raw))
        for (const name of Object.keys(raw)) fieldSet.add(name);
    } catch {
      // The projection already accepted the line; only the fingerprint stays incomplete.
    }
    const u = record.usageMetadata,
      at = Date.parse(record.timestamp);
    if (qwenUsageViolation(u)) throw Object.assign(new Error('structure'), { code: 'unsupported' });
    if (typeof record.uuid !== 'string' || !record.uuid || typeof record.sessionId !== 'string' || !Number.isFinite(at))
      throw new Error('metadata');
    const thoughts = u.thoughtsTokenCount ?? null;
    rows.push(
      normalizeSubscriptionRecord(
        {
          tool: 'qwen-code',
          requestId: record.uuid,
          attemptId: record.uuid,
          sessionId: record.sessionId,
          timestamp: at,
          model: typeof record.model === 'string' ? record.model : null,
          project: null,
          status: 'unknown',
          usage: {
            input: u.promptTokenCount,
            output: u.candidatesTokenCount + (thoughts ?? 0),
            read: u.cachedContentTokenCount ?? null,
            write: null,
            reasoning: thoughts,
            total: u.totalTokenCount,
          },
        },
        sourceId,
      ),
    );
  }
  return { rows, fields: usageFieldNames(fieldSet) };
}

function scanQwen(db, source, range) {
  const roots = ['projects', 'tmp'].map((d) => path.join(source.file, d)).filter((d) => fs.existsSync(d));
  if (!roots.length) return { rows: [], status: 'missing', message: 'Qwen Code 目录已移动，请重新选择。' };
  const files = [];
  function visit(dir, depth) {
    if (depth > 6 || !fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isSymbolicLink()) continue;
      const file = path.join(dir, e.name);
      if (e.isDirectory()) visit(file, depth + 1);
      else if (e.isFile() && e.name.endsWith('.jsonl') && path.basename(path.dirname(file)) === 'chats') {
        if (files.length >= 50000) throw new Error('file-limit');
        files.push(file);
      }
    }
  }
  for (const root of roots) visit(root, 0);
  db.exec(
    'CREATE TABLE IF NOT EXISTS qwen_files(source_id TEXT,file TEXT,size INTEGER,modified REAL,rows TEXT,fields TEXT,PRIMARY KEY(source_id,file));',
  );
  const get = db.prepare('SELECT * FROM qwen_files WHERE source_id=? AND file=?'),
    save = db.prepare('INSERT OR REPLACE INTO qwen_files VALUES (?,?,?,?,?,?)');
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
          ({ rows, fields } = readChat(file, source.id));
          save.run(source.id, file, stat.size, stat.mtimeMs, JSON.stringify(rows), JSON.stringify(fields));
        }
        if (fields.length && stat.mtimeMs > latestModified) {
          latestModified = stat.mtimeMs;
          latestFields = fields;
        }
        // A branched session's copy of a reply keeps its uuid: kept once.
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
    missing = missingOptional(rows, SOURCE_OPTIONAL.gemini);
  return {
    rows,
    status: rejected ? 'stale' : 'ready',
    truncated,
    ...(missing.length ? { contract: 'partial', missing } : {}),
    ...(latestFields ? { fields: latestFields } : {}),
    message:
      (rejected ? `${rejected} 个会话文件的用量格式不兼容，已排除。` : '') +
      partialNote(missing) +
      'Qwen Code 本机会话记录的用量',
    messageDetail:
      '按结构契约读取：每条模型回复的输入、输出、总量是核心字段，缓存与思考计数可选。回退保留的回复照样计入，分支会话复制的回复按编号只算一次；不读取对话内容。',
  };
}
module.exports = { readChat, scanQwen, selection };
