const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { readSession, scanGemini } = require('../desktop/gemini-reader.cjs');
const { toolKind } = require('../desktop/tool-kinds/index.cjs');

// T12.3: Gemini CLI session files, shaped like packages/core/src/services/chatRecordingTypes.ts (synthetic data).
const NOW = Date.UTC(2026, 10, 3, 9);
const iso = (ms) => new Date(ms).toISOString();
const tokens = (input, output, extra = {}) => ({
  input,
  output,
  cached: 0,
  thoughts: 0,
  tool: 0,
  total: input + output,
  ...extra,
});
const home = (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tua-gemini-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
};
const write = (dir, rel, lines) => {
  const file = path.join(dir, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    Array.isArray(lines) ? lines.map((l) => JSON.stringify(l)).join('\n') + '\n' : JSON.stringify(lines),
  );
  return file;
};
const meta = (sessionId) => ({
  sessionId,
  projectHash: 'PRIVATE_HASH',
  startTime: iso(NOW - 3600000),
  lastUpdated: iso(NOW),
  kind: 'main',
});
const reply = (id, at, t, extra = {}) => ({
  id,
  timestamp: iso(at),
  type: 'gemini',
  content: [{ text: 'PRIVATE_REPLY' }],
  thoughts: [{ subject: 'PRIVATE_THOUGHT', description: 'PRIVATE', timestamp: iso(at) }],
  toolCalls: [{ id: 't', name: 'shell', args: { command: 'PRIVATE_COMMAND' }, status: 'success', timestamp: iso(at) }],
  model: 'gemini-2.5-pro',
  tokens: t,
  ...extra,
});
const range = { start: NOW - 86400000, end: NOW + 60000 };

test('T12.3: one row per response, the last revision wins, rewound responses still count, nothing private kept', (t) => {
  const dir = home(t);
  const file = write(dir, 'tmp/hash/chats/session-2026-11-03T09-00-abc.jsonl', [
    meta('s1'),
    { id: 'u1', timestamp: iso(NOW - 600000), type: 'user', content: [{ text: 'PRIVATE_PROMPT' }] },
    reply('g1', NOW - 590000, tokens(100, 10)),
    // The same response written again (for example after its tool calls finished): this revision counts.
    reply('g1', NOW - 580000, tokens(120, 20, { cached: 30, thoughts: 5, total: 145 })),
    reply('g2', NOW - 500000, tokens(200, 40, { tool: 7, total: 247 })),
    { $rewindTo: 'g1' },
    { $patch: { id: 'g1', content: [{ text: 'PRIVATE_PATCH' }] } },
    { $set: { summary: 'PRIVATE_SUMMARY' } },
    { id: 'i1', timestamp: iso(NOW), type: 'info', content: 'PRIVATE_INFO' },
    { id: 'g3', timestamp: iso(NOW - 400000), type: 'gemini', content: 'no usage reported', tokens: null },
  ]);
  const { rows, fields } = readSession(file, 'src');
  assert.equal(rows.length, 2);
  const [a, b] = rows;
  assert.deepEqual(
    [a.input, a.output, a.read, a.write, a.reasoning, a.total, a.fresh],
    [120, 25, 30, null, 5, 145, null],
  );
  assert.equal(a.at, NOW - 580000);
  assert.equal(a.model, 'gemini-2.5-pro');
  assert.equal(a.provider, 'google');
  assert.equal(a.invalidUsage, false);
  // The tool-use prompt sits in the total but outside input + output: kept as the extra part, not counted twice.
  assert.deepEqual([b.input, b.output, b.total, b.extra], [200, 40, 247, 7]);
  assert.deepEqual(fields, [
    'tokens.cached',
    'tokens.input',
    'tokens.output',
    'tokens.thoughts',
    'tokens.tool',
    'tokens.total',
  ]);
  assert.doesNotMatch(JSON.stringify(rows), /PRIVATE/);
});

test('T12.3: a resumed copy of the same session counts once; the older single-file format is read too', (t) => {
  const dir = home(t);
  const first = [meta('s1'), reply('g1', NOW - 590000, tokens(100, 10)), reply('g2', NOW - 500000, tokens(50, 5))];
  write(dir, 'tmp/hash/chats/session-a.jsonl', first);
  write(dir, 'tmp/hash/chats/session-b.jsonl', [...first, reply('g3', NOW - 100000, tokens(10, 1))]);
  // The older format: one ConversationRecord per file, messages in an array.
  write(dir, 'tmp/other/chats/session-old.json', {
    ...meta('s2'),
    messages: [
      { id: 'u', timestamp: iso(NOW - 9000), type: 'user', content: 'PRIVATE_PROMPT' },
      reply('x1', NOW - 8000, tokens(7, 3)),
    ],
  });
  // Not a session file, and not under chats: ignored.
  write(dir, 'tmp/hash/logs.json', [{ PRIVATE: true }]);
  const db = new DatabaseSync(':memory:');
  const result = scanGemini(db, { id: 'src', file: dir }, range);
  assert.equal(result.status, 'ready');
  assert.equal(result.rows.length, 4);
  assert.deepEqual(
    result.rows.map((r) => r.total).sort((x, y) => x - y),
    [10, 11, 55, 110],
  );
  assert.doesNotMatch(JSON.stringify(result.rows), /PRIVATE/);
  // A second scan reuses the cached rows and gives the same answer.
  assert.deepEqual(scanGemini(db, { id: 'src', file: dir }, range).rows.length, 4);
});

test('T12.3: a broken core count rejects only that file; missing optional counts are reported as partial', (t) => {
  const dir = home(t);
  write(dir, 'tmp/h/chats/session-bad.jsonl', [meta('s1'), reply('g1', NOW - 1000, { input: 5, total: 5 })]);
  write(dir, 'tmp/h/chats/session-text.jsonl', [meta('s2'), reply('g1', NOW - 1000, tokens('5', 1))]);
  write(dir, 'tmp/h/chats/session-ok.jsonl', [meta('s3'), reply('g1', NOW - 1000, { input: 5, output: 1, total: 6 })]);
  const result = scanGemini(new DatabaseSync(':memory:'), { id: 'src', file: dir }, range);
  assert.equal(result.status, 'stale');
  assert.match(result.message, /2 个会话文件的用量格式不兼容/);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].read, null);
  assert.equal(result.rows[0].reasoning, null);
  assert.equal(result.contract, 'partial');
  assert.deepEqual(result.missing, ['缓存读取', '推理 Token']);
});

test('T12.3: the Gemini CLI kind wants the home directory with tmp, and reports a moved directory', (t) => {
  const dir = home(t);
  const kind = toolKind('gemini-cli');
  assert.equal(kind.picker.type, 'directory');
  assert.equal(kind.picker.defaultHomePath, '.gemini');
  assert.throws(() => kind.inspect({ file: dir }), /tmp/);
  fs.mkdirSync(path.join(dir, 'tmp'));
  assert.deepEqual(kind.inspect({ file: dir }), { installationId: null });
  assert.equal(
    scanGemini(new DatabaseSync(':memory:'), { id: 's', file: path.join(dir, 'gone') }, range).status,
    'missing',
  );
});
