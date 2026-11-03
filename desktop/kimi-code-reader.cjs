// Kimi Code CLI session files (T12.4, D19): <home>/sessions/**/wire.jsonl, one per agent, written by Kimi Code
// (MoonshotAI/kimi-code). Read-only and by structure (D15): only the whitelisted leaves of `usage.record` lines are
// decoded, so prompts, replies and tool data never enter memory.
// - `usage.record` (agent-core-v2 agent/usage/usageOps.ts) is one model call's usage, added up by Kimi Code itself
//   for its session totals: { time, agentId, model, usage: { inputOther, output, inputCacheRead?, inputCacheCreation } }.
// - Input = inputOther + inputCacheRead + inputCacheCreation; when inputCacheRead is missing Kimi Code itself gives no
//   input total, so input stays unknown here too (never 0).
// - Undo keeps the records (the calls happened: reported usage counts). A fork copies the active chain into a new
//   session file, so identical records (same agent, time, model and counts) are counted once.
// - Records without a time (older wire versions may omit it) cannot be placed in a range and are skipped.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { projectJSON } = require('./metadata-json.cjs');
const { lines } = require('./codex-reader.cjs');
const { normalizeSubscriptionRecord } = require('./tool-analytics.cjs');
const {
  kimiCodeUsageViolation,
  missingOptional,
  SOURCE_OPTIONAL,
  partialNote,
  fieldNames,
} = require('./upstream-contracts.cjs');
const usageFields = { inputOther: true, output: true, inputCacheRead: true, inputCacheCreation: true };
const selection = { type: true, time: true, agentId: true, model: true, usage: usageFields };
// Cheap pre-filter: only lines that can be usage records are projected at all.
const USAGE_LINE = /"type"\s*:\s*"usage\.record"/;

/** One wire file: its usage records. `session` names the session directory the file belongs to. */
function readWire(file, sourceId, session) {
  const rows = [],
    fieldSet = new Set();
  let skipped = 0;
  for (const line of lines(file)) {
    if (!USAGE_LINE.test(line)) continue;
    const record = projectJSON(line, selection);
    if (record.type !== 'usage.record') continue;
    // T9.14: the names of the counters this version reports (as usage.<name>); values are never kept.
    try {
      const raw = JSON.parse(line)?.usage;
      if (raw && typeof raw === 'object' && !Array.isArray(raw))
        for (const name of Object.keys(raw)) if (name !== 'raw') fieldSet.add('usage.' + name);
    } catch {
      // The projection already accepted the line; only the fingerprint stays incomplete.
    }
    if (typeof record.agentId !== 'string' || typeof record.model !== 'string' || kimiCodeUsageViolation(record.usage))
      throw Object.assign(new Error('structure'), { code: 'unsupported' });
    if (typeof record.time !== 'number' || !Number.isFinite(record.time) || record.time <= 0) {
      skipped++;
      continue;
    }
    const u = record.usage,
      read = u.inputCacheRead ?? null,
      attemptId = crypto
        .createHash('sha256')
        .update(
          JSON.stringify([
            record.agentId,
            record.time,
            record.model,
            u.inputOther,
            read,
            u.inputCacheCreation,
            u.output,
          ]),
        )
        .digest('hex');
    rows.push(
      normalizeSubscriptionRecord(
        {
          tool: 'kimi-code-cli',
          requestId: attemptId,
          attemptId,
          sessionId: session,
          timestamp: record.time,
          model: record.model,
          project: null,
          status: 'unknown',
          usage: {
            input: read === null ? null : u.inputOther + read + u.inputCacheCreation,
            output: u.output,
            read,
            write: u.inputCacheCreation,
            reasoning: null,
            total: null,
          },
        },
        sourceId,
      ),
    );
  }
  return { rows, skipped, fields: fieldNames(fieldSet) };
}

/** The session directory a wire file belongs to: sessions/<workdir>/<session id>/…/wire.jsonl. */
function sessionOf(root, file) {
  const parts = path.relative(path.join(root, 'sessions'), file).split(path.sep);
  return parts.length >= 3 ? parts.slice(0, 2).join('/') : path.basename(path.dirname(file));
}

function scanKimiCode(db, source, range) {
  const sessions = path.join(source.file, 'sessions');
  if (!fs.existsSync(sessions)) return { rows: [], status: 'missing', message: 'Kimi Code 目录已移动，请重新选择。' };
  const files = [];
  function visit(dir, depth) {
    if (depth > 8 || !fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isSymbolicLink()) continue;
      const file = path.join(dir, e.name);
      if (e.isDirectory()) visit(file, depth + 1);
      else if (e.isFile() && e.name === 'wire.jsonl') {
        if (files.length >= 50000) throw new Error('file-limit');
        files.push(file);
      }
    }
  }
  visit(sessions, 0);
  db.exec(
    'CREATE TABLE IF NOT EXISTS kimi_code_files(source_id TEXT,file TEXT,size INTEGER,modified REAL,rows TEXT,skipped INTEGER,fields TEXT,PRIMARY KEY(source_id,file));',
  );
  const get = db.prepare('SELECT * FROM kimi_code_files WHERE source_id=? AND file=?'),
    save = db.prepare('INSERT OR REPLACE INTO kimi_code_files VALUES (?,?,?,?,?,?,?)');
  const records = new Map();
  let rejected = 0,
    skipped = 0,
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
        let result;
        if (cached && cached.size === stat.size && cached.modified === stat.mtimeMs)
          result = {
            rows: JSON.parse(cached.rows),
            skipped: cached.skipped,
            fields: JSON.parse(cached.fields || '[]'),
          };
        else {
          result = readWire(file, source.id, sessionOf(source.file, file));
          save.run(
            source.id,
            file,
            stat.size,
            stat.mtimeMs,
            JSON.stringify(result.rows),
            result.skipped,
            JSON.stringify(result.fields),
          );
        }
        skipped += result.skipped;
        if (result.fields.length && stat.mtimeMs > latestModified) {
          latestModified = stat.mtimeMs;
          latestFields = result.fields;
        }
        // A forked session's copy of a record has the same attempt id: kept once.
        for (const row of result.rows)
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
    missing = missingOptional(rows, SOURCE_OPTIONAL.kimiCode);
  return {
    rows,
    status: rejected ? 'stale' : 'ready',
    truncated,
    ...(missing.length ? { contract: 'partial', missing } : {}),
    ...(latestFields ? { fields: latestFields } : {}),
    message:
      (rejected ? `${rejected} 个会话文件的用量格式不兼容，已排除。` : '') +
      (skipped ? `${skipped} 条用量记录没有时间，未计入。` : '') +
      partialNote(missing) +
      'Kimi Code 本机会话里每次模型调用的用量',
    messageDetail:
      '按结构契约读取 usage.record：未缓存输入、输出、缓存写入是核心字段，缓存读取可选（缺失时输入总量未知）。撤销（undo）的调用照样计入，分叉会话复制的记录只算一次；不读取对话内容。',
  };
}
module.exports = { readWire, scanKimiCode, selection, sessionOf };
