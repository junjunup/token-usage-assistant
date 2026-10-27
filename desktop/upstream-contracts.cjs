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

module.exports = {
  OPTIONAL,
  SOURCE_OPTIONAL,
  codexUsageViolation,
  claudeUsageViolation,
  missingOptional,
  contractState,
  partialNote,
};
