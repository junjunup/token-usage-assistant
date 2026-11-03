const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { readWire, scanKimiCode, sessionOf } = require('../desktop/kimi-code-reader.cjs');
const { toolKind } = require('../desktop/tool-kinds/index.cjs');

// T12.4: Kimi Code wire.jsonl files, shaped like MoonshotAI/kimi-code agent-core-v2 (synthetic data).
const NOW = Date.UTC(2026, 10, 3, 9);
const range = { start: NOW - 86400000, end: NOW + 60000 };
const home = (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tua-kimi-code-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
};
const write = (dir, rel, records) => {
  const file = path.join(dir, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, records.map((r) => JSON.stringify(r)).join('\n') + '\n');
  return file;
};
const usage = (time, counts, extra = {}) => ({
  type: 'usage.record',
  time,
  agentId: 'main',
  model: 'kimi-for-coding',
  usage: {
    inputOther: 100,
    output: 20,
    inputCacheRead: 300,
    inputCacheCreation: 10,
    raw: { secret: 'PRIVATE_RAW' },
    ...counts,
  },
  usageScope: 'turn',
  ...extra,
});
const chat = [
  { type: 'metadata', protocol_version: '1.5', created_at: NOW - 3600000 },
  {
    type: 'context.append_message',
    time: NOW - 600000,
    message: { role: 'user', id: 'm1', content: [{ type: 'text', text: 'PRIVATE_PROMPT' }] },
  },
  usage(NOW - 590000, {}),
  {
    type: 'context.append_message',
    time: NOW - 589000,
    message: {
      role: 'assistant',
      id: 'm2',
      content: [{ type: 'text', text: 'PRIVATE_REPLY' }],
      usage: { inputOther: 1, output: 1, inputCacheCreation: 0 },
    },
  },
  { type: 'context.undo', time: NOW - 500000, count: 1 },
  usage(NOW - 400000, { inputCacheRead: undefined, output: 7 }, { usageScope: 'session' }),
];

test('T12.4: one row per usage record (undone calls included), input known only with cache reads, nothing private', (t) => {
  const dir = home(t);
  const file = write(dir, 'sessions/proj/s1/agents/main/wire.jsonl', chat);
  const { rows, skipped, fields } = readWire(file, 'src', 'proj/s1');
  assert.equal(skipped, 0);
  assert.equal(rows.length, 2);
  const [a, b] = rows;
  assert.deepEqual(
    [a.input, a.output, a.read, a.write, a.total, a.fresh, a.reasoning],
    [410, 20, 300, 10, 430, 100, null],
  );
  assert.equal(a.model, 'kimi-for-coding');
  assert.equal(a.provider, 'moonshot');
  assert.equal(a.sessionId, 'proj/s1');
  // Without cache reads Kimi Code gives no input total: input and total stay unknown, never 0.
  assert.deepEqual([b.input, b.output, b.read, b.total], [null, 7, null, null]);
  assert.deepEqual(fields, ['usage.inputCacheCreation', 'usage.inputCacheRead', 'usage.inputOther', 'usage.output']);
  assert.doesNotMatch(JSON.stringify(rows), /PRIVATE/);
});

test('T12.4: a forked session copying the same records counts them once; records without a time are skipped', (t) => {
  const dir = home(t);
  write(dir, 'sessions/proj/s1/agents/main/wire.jsonl', chat);
  write(dir, 'sessions/proj/s2/agents/main/wire.jsonl', [...chat, usage(NOW - 100000, { output: 3 })]);
  write(dir, 'sessions/proj/s3/agents/sub/wire.jsonl', [
    { type: 'metadata', protocol_version: '1.4', created_at: NOW - 9000 },
    usage(undefined, {}),
    usage(NOW - 8000, { inputOther: 5, inputCacheRead: 0, inputCacheCreation: 0, output: 1 }, { agentId: 'sub' }),
  ]);
  const db = new DatabaseSync(':memory:');
  const result = scanKimiCode(db, { id: 'src', file: dir }, range);
  assert.equal(result.status, 'ready');
  assert.equal(result.rows.length, 4);
  assert.match(result.message, /1 条用量记录没有时间，未计入/);
  assert.equal(result.contract, 'partial');
  assert.deepEqual(result.missing, ['缓存读取']);
  assert.equal(scanKimiCode(db, { id: 'src', file: dir }, range).rows.length, 4);
});

test('T12.4: a broken core count rejects only that file', (t) => {
  const dir = home(t);
  write(dir, 'sessions/p/a/wire.jsonl', [usage(NOW - 1000, { inputCacheCreation: undefined })]);
  write(dir, 'sessions/p/b/wire.jsonl', [usage(NOW - 1000, { output: '7' })]);
  write(dir, 'sessions/p/c/wire.jsonl', [usage(NOW - 1000, {}, { model: undefined })]);
  write(dir, 'sessions/p/d/wire.jsonl', [usage(NOW - 1000, {})]);
  const result = scanKimiCode(new DatabaseSync(':memory:'), { id: 'src', file: dir }, range);
  assert.equal(result.status, 'stale');
  assert.match(result.message, /3 个会话文件的用量格式不兼容/);
  assert.equal(result.rows.length, 1);
});

test('T12.4: the Kimi Code CLI kind wants the home directory with sessions; sessions are named by directory', (t) => {
  const dir = home(t);
  const kind = toolKind('kimi-code-cli');
  assert.equal(kind.picker.defaultHomePath, '.kimi-code');
  assert.throws(() => kind.inspect({ file: dir }), /sessions/);
  fs.mkdirSync(path.join(dir, 'sessions'));
  assert.deepEqual(kind.inspect({ file: dir }), { installationId: null });
  assert.equal(sessionOf(dir, path.join(dir, 'sessions', 'w', 's9', 'agents', 'x', 'wire.jsonl')), 'w/s9');
  assert.equal(
    scanKimiCode(new DatabaseSync(':memory:'), { id: 's', file: path.join(dir, 'gone') }, range).status,
    'missing',
  );
});
