// Gemini CLI session files (T12.3, D19): <home>/tmp/<project hash>/chats/**/session-*.jsonl (and the older
// session-*.json), written by Gemini CLI's chat recording service. Read-only and by structure (D15): only the
// whitelisted leaves below are decoded, so prompts, replies, thoughts and tool data never enter memory.
// - A line is session metadata (sessionId, startTime), a message (id, timestamp, type, model, tokens), a `$set`
//   metadata update, or a `$rewindTo` / `$patch` edit. Only `gemini` messages carry tokens.
// - A message written again with the same id is a later revision of that response: the last one counts.
// - Rewinds hide messages from the conversation, but those responses were generated and reported their usage, so
//   they still count (AGENTS §2, reported usage). Resumed sessions copy messages with their ids: counted once.
// - Gemini's totalTokenCount = prompt + candidates + thoughts + tool-use prompt. Here output = candidates + thoughts
//   and reasoning = thoughts (a subset of output), cached = cache reads within input; nothing is counted twice.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { projectJSON } = require('./metadata-json.cjs');
const { lines } = require('./codex-reader.cjs');
const { normalizeSubscriptionRecord } = require('./tool-analytics.cjs');
const {
  geminiUsageViolation,
  missingOptional,
  SOURCE_OPTIONAL,
  partialNote,
  usageFieldNames,
  fieldNames,
} = require('./upstream-contracts.cjs');
const tokenFields = { input: true, output: true, cached: true, thoughts: true, tool: true, total: true };
const message = { id: true, timestamp: true, type: true, model: true, tokens: tokenFields };
const selection = {
  sessionId: true,
  startTime: true,
  ...message,
  $set: { sessionId: true, startTime: true },
  messages: [message],
};

/** One session file: its session id and the token-reporting responses by message id. */
function readSession(file, sourceId) {
  let session = null,
    born = null;
  const responses = new Map(),
    fieldSet = new Set();
  const take = (record, line) => {
    if (record.type !== 'gemini' || record.tokens === undefined || record.tokens === null) return;
    // T9.14: the names of the counters this version reports (as tokens.<name>); values are never kept.
    try {
      const raw = line ? JSON.parse(line)?.tokens : null;
      if (raw && typeof raw === 'object' && !Array.isArray(raw))
        for (const name of Object.keys(raw)) fieldSet.add('tokens.' + name);
    } catch {
      // The projection already accepted the line; only the fingerprint stays incomplete.
    }
    if (geminiUsageViolation(record.tokens)) throw Object.assign(new Error('structure'), { code: 'unsupported' });
    const at = Date.parse(record.timestamp);
    if (typeof record.id !== 'string' || !record.id || !Number.isFinite(at)) throw new Error('metadata');
    responses.set(record.id, {
      at,
      model: typeof record.model === 'string' ? record.model : null,
      tokens: record.tokens,
    });
  };
  if (file.endsWith('.json')) {
    // Older format: one ConversationRecord. Messages are projected one by one, content skipped.
    const whole = projectJSON(fs.readFileSync(file, 'utf8'), selection);
    session = whole.sessionId;
    born = Date.parse(whole.startTime);
    for (const record of whole.messages || []) take(record, null);
  } else
    for (const line of lines(file)) {
      if (!line.trim()) continue;
      const record = projectJSON(line, selection);
      if (typeof record.sessionId === 'string' && !record.type) {
        if (session && session !== record.sessionId) throw new Error('session');
        session = record.sessionId;
        born = Date.parse(record.startTime);
        continue;
      }
      if (record.$set) {
        if (typeof record.$set.sessionId === 'string') session = record.$set.sessionId;
        continue;
      }
      take(record, line);
    }
  if (typeof session !== 'string' || !session) {
    if (responses.size) throw new Error('metadata');
    return { rows: [], fields: [] };
  }
  const rows = [...responses].map(([id, r]) => {
    const t = r.tokens,
      thoughts = t.thoughts ?? null,
      attemptId = crypto
        .createHash('sha256')
        .update(JSON.stringify([session, id]))
        .digest('hex');
    return normalizeSubscriptionRecord(
      {
        tool: 'gemini-cli',
        requestId: attemptId,
        attemptId,
        sessionId: session,
        timestamp: r.at,
        model: r.model,
        project: null,
        status: 'unknown',
        usage: {
          input: t.input,
          output: t.output + (thoughts ?? 0),
          read: t.cached ?? null,
          write: null,
          reasoning: thoughts,
          total: t.total,
        },
      },
      sourceId,
    );
  });
  return { rows, born: Number.isFinite(born) ? born : null, fields: usageFieldNames(fieldSet) };
}

function scanGemini(db, source, range) {
  const tmp = path.join(source.file, 'tmp');
  if (!fs.existsSync(tmp)) return { rows: [], status: 'missing', message: 'Gemini CLI 目录已移动，请重新选择。' };
  const files = [];
  function visit(dir, depth) {
    if (depth > 6 || !fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isSymbolicLink()) continue;
      const file = path.join(dir, e.name);
      if (e.isDirectory()) visit(file, depth + 1);
      else if (e.isFile() && /^session-.*\.jsonl?$/.test(e.name) && /[\\/]chats[\\/]/.test(file)) {
        if (files.length >= 50000) throw new Error('file-limit');
        files.push(file);
      }
    }
  }
  visit(tmp, 0);
  db.exec(
    'CREATE TABLE IF NOT EXISTS gemini_files(source_id TEXT,file TEXT,size INTEGER,modified REAL,rows TEXT,fields TEXT,PRIMARY KEY(source_id,file));',
  );
  const get = db.prepare('SELECT * FROM gemini_files WHERE source_id=? AND file=?'),
    save = db.prepare('INSERT OR REPLACE INTO gemini_files VALUES (?,?,?,?,?,?)');
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
          ({ rows, fields } = readSession(file, source.id));
          save.run(source.id, file, stat.size, stat.mtimeMs, JSON.stringify(rows), JSON.stringify(fields));
        }
        if (fields.length && stat.mtimeMs > latestModified) {
          latestModified = stat.mtimeMs;
          latestFields = fieldNames(fields);
        }
        // The same response in a resumed copy has the same attempt id: kept once.
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
      'Gemini CLI 本机会话记录的用量',
    messageDetail:
      '按结构契约读取：每条模型回复的输入、输出、总量是核心字段，缓存与思考计数可选。回退（rewind）掉的回复也照样计入，恢复会话复制的历史只算一次；不读取对话内容。',
  };
}
module.exports = { readSession, scanGemini, selection };
