// T9.13 (D15): the structure contracts for local tool data, and the read-only boundary of the Codex client.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  codexUsageViolation,
  claudeUsageViolation,
  missingOptional,
  contractState,
  partialNote,
  SOURCE_OPTIONAL,
} = require('../desktop/upstream-contracts.cjs');

const usage = {
  input_tokens: 20,
  cached_input_tokens: 4,
  cache_write_input_tokens: 2,
  output_tokens: 10,
  reasoning_output_tokens: 3,
  total_tokens: 30,
};

test('Codex: core counts present and every count a non-negative integer; optional counters may be absent', () => {
  assert.equal(codexUsageViolation(usage), null);
  const core = { ...usage };
  for (const key of ['cached_input_tokens', 'cache_write_input_tokens', 'reasoning_output_tokens']) delete core[key];
  assert.equal(codexUsageViolation(core), null);
  for (const key of ['input_tokens', 'output_tokens', 'total_tokens']) {
    const rest = { ...usage };
    delete rest[key];
    assert.equal(codexUsageViolation(rest), 'core', key);
  }
  assert.equal(codexUsageViolation({ ...usage, output_tokens: -1 }), 'core');
  assert.equal(codexUsageViolation({ ...usage, input_tokens: 1.5 }), 'core');
  assert.equal(codexUsageViolation({ ...usage, cached_input_tokens: '4' }), 'type');
  assert.equal(codexUsageViolation({ ...usage, reasoning_output_tokens: -3 }), 'type');
  for (const bad of [null, undefined, [], 'x']) assert.equal(codexUsageViolation(bad), 'shape');
  // Relational inconsistencies are flagged per record (invalidUsage), never a reason to drop it.
  assert.equal(codexUsageViolation({ ...usage, cached_input_tokens: 50 }), null);
});

test('Claude: input and output are core', () => {
  assert.equal(claudeUsageViolation({ input: 10, output: 5, read: null, write: null }), null);
  assert.equal(claudeUsageViolation({ input: null, output: 5, read: 1, write: 1 }), 'core');
  assert.equal(claudeUsageViolation({ input: 10, output: null, read: 1, write: 1 }), 'core');
});

test('partial fields come from rows that reported usage, per source, in a fixed order', () => {
  const rows = [
    { usageReported: true, read: 1, write: null, reasoning: null },
    { usageReported: true, read: null, write: 2, reasoning: 3 },
    { usageReported: false, read: null, write: null, reasoning: null },
  ];
  assert.deepEqual(missingOptional(rows, SOURCE_OPTIONAL.codex), ['缓存读取', '缓存写入', '推理 Token']);
  // Claude Code never reports reasoning tokens: that is not a missing field.
  assert.deepEqual(missingOptional(rows, SOURCE_OPTIONAL.claude), ['缓存读取', '缓存写入']);
  assert.deepEqual(missingOptional([rows[2]], SOURCE_OPTIONAL.codex), []);
  assert.equal(contractState([]), 'ok');
  assert.equal(contractState(['缓存读取']), 'partial');
  assert.equal(partialNote([]), '');
  assert.equal(partialNote(['缓存读取', '推理 Token']), '部分字段缺失：缓存读取、推理 Token，显示为「—」。');
});

test('the Codex client sends only the four read-only methods, never one that consumes reset credits', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'desktop', 'codex-rpc.cjs'), 'utf8');
  const sent = [...source.matchAll(/request\('([^']+)'|method: '([^']+)'/g)].map((m) => m[1] || m[2]).sort();
  assert.deepEqual(sent, ['account/rateLimits/read', 'account/read', 'initialize', 'initialized']);
  assert.doesNotMatch(source, /consume|ResetCredit|resetCredit/i);
});
