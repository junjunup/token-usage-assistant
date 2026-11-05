// Claude Code session logs (T14.1, D21): <home>/projects/<project>/<session id>.jsonl (sub-agents:
// <session id>/subagents/agent-*.jsonl), written by Claude Code itself for every session however it was started.
// Read-only and by structure (D15): only the whitelisted leaves below are decoded, so prompts, replies, thinking and
// tool data never enter memory.
// - An `assistant` line carries the API response's `message.usage`. One response is written as several lines (one
//   per content block) with the same message id and request id: each (message id, request id) counts once, keeping
//   the line with the largest reported counts.
// - Resumed or forked sessions copy earlier lines into the new file: the same key, so counted once.
// - `<synthetic>` / API-error placeholders are not model calls and are skipped.
// - input = input_tokens + cache reads + cache writes (the same as the OTLP collector); output already includes
//   thinking, so reasoning (thinking_tokens, optional) is a subset of output and never added twice.
// Records use tool 'claude-code', so they sit next to the launcher's OTLP records; tool-worker.cjs removes the
// requests both report (D21 ②).
const fs = require('node:fs');
const path = require('node:path');
const { projectJSON } = require('./metadata-json.cjs');
const { lines } = require('./codex-reader.cjs');
const { normalizeSubscriptionRecord } = require('./tool-analytics.cjs');
const {
  claudeLogUsageViolation,
  missingOptional,
  SOURCE_OPTIONAL,
  partialNote,
  usageFieldNames,
} = require('./upstream-contracts.cjs');

const usageFields = {
  input_tokens: true,
  output_tokens: true,
  cache_read_input_tokens: true,
  cache_creation_input_tokens: true,
  output_tokens_details: { thinking_tokens: true },
};
const selection = {
  type: true,
  sessionId: true,
  timestamp: true,
  requestId: true,
  isApiErrorMessage: true,
  message: { id: true, model: true, usage: usageFields },
};
// Cheap pre-filter: only lines that can hold a response's usage are projected at all.
const USAGE_LINE = /"usage"\s*:/;
const sum = (u) =>
  [u.input_tokens, u.output_tokens, u.cache_read_input_tokens, u.cache_creation_input_tokens].reduce(
    (a, b) => a + (typeof b === 'number' ? b : 0),
    0,
  );

function readLog(file, sourceId) {
  const best = new Map(),
    fieldSet = new Set();
  for (const line of lines(file)) {
    if (!USAGE_LINE.test(line)) continue;
    const record = projectJSON(line, selection),
      m = record.message;
    if (record.type !== 'assistant' || !m || m.usage === undefined || m.usage === null) continue;
    if (record.isApiErrorMessage === true || m.model === '<synthetic>') continue;
    // T9.14: the names of the counters this version reports; values are never kept.
    try {
      const raw = JSON.parse(line)?.message?.usage;
      if (raw && typeof raw === 'object' && !Array.isArray(raw))
        for (const [name, value] of Object.entries(raw)) if (typeof value === 'number') fieldSet.add(name);
    } catch {
      // The projection already accepted the line; only the fingerprint stays incomplete.
    }
    const u = m.usage,
      at = Date.parse(record.timestamp);
    if (claudeLogUsageViolation(u)) throw Object.assign(new Error('structure'), { code: 'unsupported' });
    if (typeof m.id !== 'string' || !m.id || typeof record.sessionId !== 'string' || !Number.isFinite(at))
      throw new Error('metadata');
    const requestId = typeof record.requestId === 'string' && record.requestId ? record.requestId : null,
      key = m.id + ':' + (requestId || ''),
      old = best.get(key);
    if (old && sum(old.u) > sum(u)) continue;
    // Dated by the response's first line, so a later block of the same response does not move it.
    best.set(key, {
      u,
      at: old ? Math.min(old.at, at) : at,
      requestId,
      key,
      sessionId: record.sessionId,
      model: m.model,
    });
  }
  const rows = [...best.values()].map(({ u, at, requestId, key, sessionId, model }) => {
    const read = u.cache_read_input_tokens ?? null,
      write = u.cache_creation_input_tokens ?? null;
    return normalizeSubscriptionRecord(
      {
        tool: 'claude-code',
        provenance: 'claude-code/session-log',
        // The upstream request id (req_…) when the log has one: the OTLP events carry the same id.
        requestId: requestId || key,
        attemptId: key,
        sessionId,
        timestamp: at,
        model: typeof model === 'string' ? model : null,
        project: null,
        status: 'unknown',
        usage: {
          input: read !== null && write !== null ? u.input_tokens + read + write : null,
          output: u.output_tokens,
          read,
          write,
          reasoning: u.output_tokens_details?.thinking_tokens ?? null,
        },
      },
      sourceId,
    );
  });
  return { rows, fields: usageFieldNames(fieldSet) };
}

function scanClaudeLogs(db, source, range) {
  const root = path.join(source.file, 'projects');
  if (!fs.existsSync(root)) return { rows: [], status: 'missing', message: 'Claude Code 目录已移动，请重新选择。' };
  const files = [];
  (function visit(dir, depth) {
    if (depth > 5) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isSymbolicLink()) continue;
      const file = path.join(dir, e.name);
      if (e.isDirectory()) visit(file, depth + 1);
      else if (e.isFile() && e.name.endsWith('.jsonl')) {
        if (files.length >= 50000) throw new Error('file-limit');
        files.push(file);
      }
    }
  })(root, 0);
  db.exec(
    'CREATE TABLE IF NOT EXISTS claude_log_files(source_id TEXT,file TEXT,size INTEGER,modified REAL,rows TEXT,fields TEXT,PRIMARY KEY(source_id,file));',
  );
  const get = db.prepare('SELECT * FROM claude_log_files WHERE source_id=? AND file=?'),
    save = db.prepare('INSERT OR REPLACE INTO claude_log_files VALUES (?,?,?,?,?,?)');
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
          ({ rows, fields } = readLog(file, source.id));
          save.run(source.id, file, stat.size, stat.mtimeMs, JSON.stringify(rows), JSON.stringify(fields));
        }
        if (fields.length && stat.mtimeMs > latestModified) {
          latestModified = stat.mtimeMs;
          latestFields = fields;
        }
        // A resumed or forked session's copy of a response keeps its ids: kept once, the larger counts win.
        for (const row of rows)
          if (row.at >= from && row.at <= range.end) {
            const old = records.get(row.attemptId);
            if (!old || (row.total ?? 0) > (old.total ?? 0)) records.set(row.attemptId, row);
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
    missing = missingOptional(rows, SOURCE_OPTIONAL.claudeLog);
  return {
    rows,
    status: rejected ? 'stale' : 'ready',
    truncated,
    ...(missing.length ? { contract: 'partial', missing } : {}),
    ...(latestFields ? { fields: latestFields } : {}),
    message:
      (rejected ? `${rejected} 个会话文件的用量格式不兼容，已排除。` : '') +
      partialNote(missing) +
      'Claude Code 本机会话日志的用量',
    messageDetail:
      '按结构契约读取：每次模型回复的输入、输出是核心字段，缓存与思考计数可选。同一次回复写成多行、恢复或分叉会话复制的记录都只算一次；与启动脚本来源同时启用时，两边都有的请求只算一次。不读取对话内容。',
  };
}

/**
 * D21 ②: requests the launcher's OTLP export already reports are dropped from the session-log rows. When the OTLP
 * export has records without an upstream request id in a session the logs also cover, the two cannot be matched,
 * so the log source pauses (overlap) instead of counting anything twice.
 * @param {any[]} logRows rows of a claude-code-logs source
 * @param {any[]} otlpRows rows of every claude-code (launcher) source
 * @returns {{ rows: any[], removed: number, overlap: boolean }}
 */
function dedupeAgainstOtlp(logRows, otlpRows) {
  const ids = new Set(),
    opaque = new Set();
  for (const r of otlpRows) {
    // parseOtel falls back to a SHA-256 of (session, time, sequence, …) when the event has no request id.
    if (/^[0-9a-f]{64}$/.test(r.requestId)) opaque.add(r.sessionId);
    else ids.add(r.requestId);
  }
  const rows = logRows.filter((r) => !ids.has(r.requestId));
  if (rows.some((r) => opaque.has(r.sessionId))) return { rows: [], removed: 0, overlap: true };
  return { rows, removed: logRows.length - rows.length, overlap: false };
}

module.exports = { readLog, scanClaudeLogs, dedupeAgainstOtlp, selection };
