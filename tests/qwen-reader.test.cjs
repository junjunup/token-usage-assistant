const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { readChat, scanQwen } = require('../desktop/qwen-reader.cjs');
const { toolKind } = require('../desktop/tool-kinds/index.cjs');

// T12.5: Qwen Code chat records, shaped like QwenLM/qwen-code core/src/services/chatRecordingService.ts (synthetic).
const NOW = Date.UTC(2026, 10, 3, 9);
const iso = (ms) => new Date(ms).toISOString();
const range = { start: NOW - 86400000, end: NOW + 60000 };
const home = (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tua-qwen-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
};
const write = (dir, rel, records) => {
  const file = path.join(dir, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, records.map((r) => JSON.stringify(r)).join('\n') + '\n');
  return file;
};
const usage = (prompt, candidates, extra = {}) => ({
  promptTokenCount: prompt,
  candidatesTokenCount: candidates,
  totalTokenCount: prompt + candidates,
  ...extra,
});
const reply = (uuid, sessionId, at, usageMetadata, extra = {}) => ({
  uuid,
  parentUuid: null,
  sessionId,
  timestamp: iso(at),
  type: 'assistant',
  model: 'qwen3-coder-plus',
  message: { role: 'model', parts: [{ text: 'PRIVATE_REPLY' }, { thought: true, text: 'PRIVATE_THOUGHT' }] },
  usageMetadata,
  ...extra,
});
const session = (sessionId) => [
  {
    uuid: 'u1',
    parentUuid: null,
    sessionId,
    timestamp: iso(NOW - 600000),
    type: 'user',
    message: { role: 'user', parts: [{ text: 'PRIVATE_PROMPT' }] },
  },
  reply(
    'a1',
    sessionId,
    NOW - 590000,
    usage(1000, 50, { cachedContentTokenCount: 600, thoughtsTokenCount: 20, totalTokenCount: 1070 }),
  ),
  {
    uuid: 'r1',
    parentUuid: 'a1',
    sessionId,
    timestamp: iso(NOW - 580000),
    type: 'system',
    subtype: 'rewind',
    systemPayload: { note: 'PRIVATE' },
  },
  reply('a2', sessionId, NOW - 500000, usage(300, 30, { toolUsePromptTokenCount: 5, totalTokenCount: 335 })),
  reply('a3', sessionId, NOW - 400000, undefined),
];

test('T12.5: one row per assistant reply with usage; thoughts are reasoning inside output; nothing private', (t) => {
  const dir = home(t);
  const { rows, fields } = readChat(write(dir, 'projects/p/chats/s1.jsonl', session('s1')), 'src');
  assert.equal(rows.length, 2);
  const [a, b] = rows;
  assert.deepEqual([a.input, a.output, a.read, a.write, a.reasoning, a.total], [1000, 70, 600, null, 20, 1070]);
  assert.equal(a.provider, 'alibaba');
  assert.equal(a.model, 'qwen3-coder-plus');
  assert.deepEqual([b.input, b.output, b.total, b.extra], [300, 30, 335, 5]);
  // Names hinting at content (prompt…, …Content…) are never fingerprinted (T9.14), even for counters; a rename of
  // those core counts still shows up, as an incompatible format.
  assert.deepEqual(fields, ['candidatesTokenCount', 'thoughtsTokenCount', 'totalTokenCount']);
  assert.doesNotMatch(JSON.stringify(rows), /PRIVATE/);
});

test('T12.5: a branched copy keeps each uuid once; older tmp chats are read; a broken count rejects that file', (t) => {
  const dir = home(t);
  write(dir, 'projects/p/chats/s1.jsonl', session('s1'));
  // /branch copies records verbatim with a new session id and the same uuids, then continues.
  write(dir, 'projects/p/chats/s2.jsonl', [
    ...session('s2').map((r) => ({ ...r, forkedFrom: { sessionId: 's1', messageUuid: r.uuid } })),
    reply('a4', 's2', NOW - 100000, usage(10, 1)),
  ]);
  write(dir, 'tmp/hash/chats/old.jsonl', [reply('o1', 's0', NOW - 9000, usage(7, 3))]);
  write(dir, 'projects/p/chats/bad.jsonl', [
    reply('x1', 's9', NOW - 9000, { promptTokenCount: 5, totalTokenCount: 5 }),
  ]);
  // Not under chats: ignored.
  write(dir, 'projects/p/other/s.jsonl', [reply('z1', 's9', NOW - 9000, usage(1, 1))]);
  const db = new DatabaseSync(':memory:');
  const result = scanQwen(db, { id: 'src', file: dir }, range);
  assert.equal(result.status, 'stale');
  assert.match(result.message, /1 个会话文件的用量格式不兼容/);
  assert.deepEqual(result.rows.map((r) => r.attemptId).sort(), ['a1', 'a2', 'a4', 'o1']);
  assert.equal(scanQwen(db, { id: 'src', file: dir }, range).rows.length, 4);
});

test('T12.5: the Qwen Code kind wants the home directory with projects', (t) => {
  const dir = home(t);
  const kind = toolKind('qwen-code');
  assert.equal(kind.picker.defaultHomePath, '.qwen');
  assert.throws(() => kind.inspect({ file: dir }), /projects/);
  fs.mkdirSync(path.join(dir, 'projects'));
  assert.deepEqual(kind.inspect({ file: dir }), { installationId: null });
  assert.equal(
    scanQwen(new DatabaseSync(':memory:'), { id: 's', file: path.join(dir, 'gone') }, range).status,
    'missing',
  );
});
