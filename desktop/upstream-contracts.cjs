'use strict';
// T9.13 (D15): data from local tools is trusted by its structure, not by the tool's version. Each source has core
// fields (missing or not a non-negative integer -> the record is incompatible and rejected) and optional fields
// (missing -> shown as "—" and the source is "partial"); relational constraints are flagged per record
// (invalidUsage) as before. Versions are recorded for details only.
// See docs/research/UPSTREAM-CONTRACTS.md.

/** @typedef {'ok'|'partial'} ContractState */

/** Optional per-record fields, by the normalized record key, with the name users see. */
const OPTIONAL = Object.freeze({ read: '缓存读取', write: '缓存写入', reasoning: '推理 Token' });

/** @param {unknown} v */
const count = (v) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;

/**
 * Codex `token_count` usage (snake_case, as stored in rollout files). Returns null when the record satisfies the
 * contract, otherwise the reason it is incompatible.
 * @param {any} u
 * @returns {string|null}
 */
function codexUsageViolation(u) {
  if (!u || typeof u !== 'object' || Array.isArray(u)) return 'shape';
  if (!count(u.input_tokens) || !count(u.output_tokens) || !count(u.total_tokens)) return 'core';
  for (const key of ['cached_input_tokens', 'cache_write_input_tokens', 'reasoning_output_tokens'])
    if (u[key] !== undefined && u[key] !== null && !count(u[key])) return 'type';
  // Relational inconsistencies (cache above input, reasoning above output, total below input + output) keep the
  // record and are flagged as invalidUsage by normalizeSubscriptionRecord, as before; only structure rejects.
  return null;
}

/**
 * Claude Code `api_request` attributes: input and output are core, cache counters optional.
 * @param {{ input: number|null, output: number|null, read: number|null, write: number|null }} u
 * @returns {string|null}
 */
function claudeUsageViolation(u) {
  if (u.input === null || u.output === null) return 'core';
  return null;
}

/** The optional fields each source can report (Claude Code reports no reasoning tokens at all). */
const SOURCE_OPTIONAL = Object.freeze({
  codex: /** @type {(keyof typeof OPTIONAL)[]} */ (['read', 'write', 'reasoning']),
  claude: /** @type {(keyof typeof OPTIONAL)[]} */ (['read', 'write']),
});

/**
 * Which of a source's optional fields are missing in rows that did report usage, in a fixed order.
 * @param {any[]} rows normalized tool records
 * @param {(keyof typeof OPTIONAL)[]} keys the source's optional fields
 * @returns {string[]} user-facing field names
 */
function missingOptional(rows, keys) {
  return keys
    .filter((key) => rows.some((r) => r && r.usageReported && (r[key] === null || r[key] === undefined)))
    .map((key) => OPTIONAL[key]);
}

/** @param {string[]} missing @returns {ContractState} */
const contractState = (missing) => (missing.length ? 'partial' : 'ok');

/** @param {string[]} missing */
const partialNote = (missing) => (missing.length ? `部分字段缺失：${missing.join('、')}，显示为「—」。` : '');

// T9.14 (D15): field-name fingerprints. Only names are kept, never values; a name must look like an identifier
// (anything else is dropped), and at most 64 names per source are kept.
const FIELD_NAME = /^[A-Za-z][A-Za-z0-9_.:-]{0,63}$/;
// Only usage-counter names are fingerprinted (what a rename of a counter would change); names that hint at
// content or credentials are never kept, even though their values are never read.
const USAGE_NAME = /tokens?|cache/i;
const SENSITIVE_NAME = /auth|key|secret|password|credential|cookie|session|prompt|content|body|message/i;

/**
 * The usage-counter names among `names` (for fingerprints of tools whose records also carry other attributes).
 * @param {Iterable<unknown>} names
 * @returns {string[]}
 */
function usageFieldNames(names) {
  return fieldNames([...names].filter((n) => typeof n === 'string' && USAGE_NAME.test(n) && !SENSITIVE_NAME.test(n)));
}

/**
 * The sorted, de-duplicated identifier-like names among `names`.
 * @param {Iterable<unknown>} names
 * @returns {string[]}
 */
function fieldNames(names) {
  const out = new Set();
  for (const n of names) if (typeof n === 'string' && FIELD_NAME.test(n)) out.add(n);
  return [...out].sort().slice(0, 64);
}

/**
 * What changed between two fingerprints; null when either is unknown or nothing changed.
 * @param {unknown} previous
 * @param {unknown} current
 * @returns {{ added: string[], removed: string[] }|null}
 */
function fieldChange(previous, current) {
  if (!Array.isArray(previous) || !Array.isArray(current) || !previous.length || !current.length) return null;
  const a = new Set(fieldNames(previous)),
    b = new Set(fieldNames(current));
  const added = [...b].filter((n) => !a.has(n)),
    removed = [...a].filter((n) => !b.has(n));
  return added.length || removed.length ? { added, removed } : null;
}

/** How long a field change stays visible on the source card. */
const FIELD_CHANGE_VISIBLE_MS = 14 * 86400000;

/**
 * @param {{ added: string[], removed: string[] }} change
 * @returns {string}
 */
function fieldChangeNote(change) {
  const parts = [];
  if (change.added.length) parts.push('新增 ' + change.added.join('、'));
  if (change.removed.length) parts.push('不再提供 ' + change.removed.join('、'));
  return '数据字段有变化：' + parts.join('；') + '。';
}

module.exports = {
  fieldNames,
  usageFieldNames,
  fieldChange,
  fieldChangeNote,
  FIELD_CHANGE_VISIBLE_MS,
  OPTIONAL,
  SOURCE_OPTIONAL,
  codexUsageViolation,
  claudeUsageViolation,
  missingOptional,
  contractState,
  partialNote,
};
