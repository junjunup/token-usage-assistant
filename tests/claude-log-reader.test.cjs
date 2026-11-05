const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { readLog, scanClaudeLogs, dedupeAgainstOtlp } = require('../desktop/claude-log-reader.cjs');
const { toolKind } = require('../desktop/tool-kinds/index.cjs');
const { execute } = require('../desktop/tool-worker.cjs');
const { discoverTools } = require('../desktop/tool-discovery.cjs');

// T14.1 (D21): Claude Code session logs, shaped like ~/.claude/projects/<project>/<session>.jsonl (synthetic; only
// the structure was taken from real files, by key names and value types).
const NOW = Date.UTC(2026, 10, 5, 9);
const iso = (ms) => new Date(ms).toISOString();
const range = { start: NOW - 86400000, end: NOW + 60000 };
const home = (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tua-claude-logs-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
};
const write = (dir, rel, records) => {
  const file = path.join(dir, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, records.map((r) => JSON.stringify(r)).join('\n') + '\n');
  return file;
};
const usage = (input, output, extra = {}) => ({
  input_tokens: input,
  cache_creation_input_tokens: 200,
  cache_read_input_tokens: 5000,
  output_tokens: output,
  output_tokens_details: { thinking_tokens: 10 },
  server_tool_use: { web_search_requests: 0, web_fetch_requests: 0 },
  service_tier: 'standard',
  cache_creation: { ephemeral_1h_input_tokens: 200, ephemeral_5m_input_tokens: 0 },
  ...extra,
});
// One API response written as one line per content block: same message id and request id.
const reply = (uuid, sessionId, at, messageId, requestId, u, block = { type: 'text', text: 'PRIVATE_REPLY' }) => ({
  parentUuid: null,
  isSidechain: false,
  type: 'assistant',
  uuid,
  sessionId,
  timestamp: iso(at),
  requestId,
  cwd: '/Users/PRIVATE_USER/project',
  gitBranch: 'PRIVATE_BRANCH',
  message: {
    model: 'claude-opus-5-5',
    id: messageId,
    type: 'message',
    role: 'assistant',
    content: [block],
    stop_reason: 'end_turn',
    usage: u,
  },
});
const session = (sessionId) => [
  {
    type: 'user',
    uuid: 'u1',
    sessionId,
    timestamp: iso(NOW - 600000),
    message: { role: 'user', content: 'PRIVATE_PROMPT "usage": 1' },
  },
  reply('a1', sessionId, NOW - 590000, 'msg_1', 'req_1', usage(3, 40), {
    type: 'thinking',
    thinking: 'PRIVATE_THOUGHT',
  }),
  reply('a2', sessionId, NOW - 589000, 'msg_1', 'req_1', usage(3, 40), { type: 'tool_use', input: { cmd: 'PRIVATE' } }),
  reply('a3', sessionId, NOW - 500000, 'msg_2', 'req_2', usage(5, 60)),
  // An API error placeholder is not a model call.
  {
    ...reply('e1', sessionId, NOW - 400000, 'msg_e', undefined, usage(0, 0)),
    isApiErrorMessage: true,
    message: { ...reply('e1', sessionId, 0, 'msg_e', 0, usage(0, 0)).message, model: '<synthetic>' },
  },
];

test('T14.1: one row per response (multi-line responses once); cache inside input, thinking inside output; nothing private', (t) => {
  const dir = home(t);
  const { rows, fields } = readLog(write(dir, 'projects/-p/s1.jsonl', session('s1')), 'src');
  assert.equal(rows.length, 2);
  const [a, b] = rows;
  assert.deepEqual([a.input, a.output, a.read, a.write, a.reasoning, a.total], [5203, 40, 5000, 200, 10, 5243]);
  assert.deepEqual([a.requestId, a.attemptId, a.sessionId], ['req_1', 'msg_1:req_1', 's1']);
  assert.equal(a.at, NOW - 590000, 'dated by the first line of the response');
  assert.deepEqual([a.tool, a.provider, a.model, a.status], ['claude-code', 'anthropic', 'claude-opus-5-5', 'unknown']);
  assert.equal(a.provenance, 'claude-code/session-log');
  assert.equal(a.recordUnit, 'request');
  assert.equal(b.output, 60);
  assert.deepEqual(fields, ['cache_creation_input_tokens', 'cache_read_input_tokens', 'input_tokens', 'output_tokens']);
  assert.doesNotMatch(JSON.stringify(rows), /PRIVATE/);
});

test('T14.1: resumed copies count once, sub-agent logs count, optional fields may be missing, a broken count rejects that file', (t) => {
  const dir = home(t);
  write(dir, 'projects/-p/s1.jsonl', session('s1'));
  // A resumed session copies earlier lines (same message and request ids) into a new file, then continues.
  write(dir, 'projects/-p/s2.jsonl', [
    ...session('s1').map((r) => ({ ...r, uuid: r.uuid + '-copy' })),
    reply('b1', 's1', NOW - 100000, 'msg_3', 'req_3', usage(1, 2)),
  ]);
  write(dir, 'projects/-p/s1/subagents/agent-x.jsonl', [
    { ...reply('c1', 's1', NOW - 90000, 'msg_4', 'req_4', { input_tokens: 7, output_tokens: 8 }), isSidechain: true },
  ]);
  write(dir, 'projects/-p/bad.jsonl', [reply('x1', 's9', NOW - 9000, 'msg_x', 'req_x', { input_tokens: 5 })]);
  const db = new DatabaseSync(':memory:');
  const result = scanClaudeLogs(db, { id: 'src', file: dir }, range);
  assert.equal(result.status, 'stale');
  assert.match(result.message, /1 个会话文件的用量格式不兼容/);
  assert.deepEqual(result.rows.map((r) => r.requestId).sort(), ['req_1', 'req_2', 'req_3', 'req_4']);
  const sub = result.rows.find((r) => r.requestId === 'req_4');
  assert.deepEqual([sub.input, sub.read, sub.write, sub.reasoning], [null, null, null, null]);
  assert.equal(result.contract, 'partial');
  assert.deepEqual(result.missing, ['缓存读取', '缓存写入', '推理 Token']);
  // The cached projection gives the same rows.
  assert.equal(scanClaudeLogs(db, { id: 'src', file: dir }, range).rows.length, 4);
});

test('T14.1 (D21 ②): requests the launcher also reported count once; unmatched OTLP records pause the log source', (t) => {
  const logs = [
    { requestId: 'req_1', sessionId: 's1' },
    { requestId: 'req_2', sessionId: 's1' },
    { requestId: 'req_3', sessionId: 's2' },
  ];
  assert.deepEqual(dedupeAgainstOtlp(logs, [{ requestId: 'req_2', sessionId: 's1' }]), {
    rows: [logs[0], logs[2]],
    removed: 1,
    overlap: false,
  });
  const opaque = 'a'.repeat(64);
  assert.equal(dedupeAgainstOtlp(logs, [{ requestId: opaque, sessionId: 's2' }]).overlap, true);
  assert.equal(dedupeAgainstOtlp(logs, [{ requestId: opaque, sessionId: 'other' }]).overlap, false);

  // End to end through the worker: a launcher export with req_2, and the logs.
  const dir = home(t);
  write(dir, 'claude/projects/-p/s1.jsonl', session('s1'));
  const otlp = path.join(dir, 'otlp');
  fs.mkdirSync(otlp);
  fs.writeFileSync(
    path.join(otlp, 'source.json'),
    JSON.stringify({ schema: 'token-usage-assistant.claude-source', schemaVersion: 1, sourceId: 'inst' }),
  );
  const record = {
    tool: 'claude-code',
    requestId: 'req_2',
    attemptId: 's1:req_2',
    sessionId: 's1',
    at: NOW - 500000,
    model: 'claude-opus-5-5',
    status: 'completed',
    input: 5205,
    output: 60,
    read: 5000,
    write: 200,
  };
  fs.writeFileSync(
    path.join(otlp, 'usage.jsonl'),
    JSON.stringify({ schema: 'token-usage-assistant.claude-record', schemaVersion: 1, sourceId: 'inst', record }) +
      '\n',
  );
  const sources = [
    { id: 'logs', kind: 'claude-code-logs', file: path.join(dir, 'claude'), label: 'logs', enabled: true },
    { id: 'otlp', kind: 'claude-code', file: path.join(otlp, 'usage.jsonl'), label: 'otlp', enabled: true },
  ];
  const result = execute({
    operation: 'export',
    indexFile: path.join(dir, 'index', 'tool-usage.sqlite'),
    sources,
    range,
    filters: {},
    prices: {},
  });
  assert.deepEqual(
    result.sourceReports.map((r) => r.id),
    ['logs', 'otlp'],
    'reports keep the sources order',
  );
  assert.equal(result.rows.length, 2, 'req_1 from the logs, req_2 once (from the launcher)');
  assert.deepEqual(result.rows.map((r) => r.requestId).sort(), ['req_1', 'req_2']);
  const analysis = execute({
    operation: 'query',
    indexFile: path.join(dir, 'index', 'tool-usage.sqlite'),
    sources,
    range,
    filters: {},
    prices: {},
  });
  const logReport = analysis.sourceReports.find((r) => r.id === 'logs');
  assert.equal(logReport.duplicates, 1);
  assert.match(logReport.message, /重复的 1 次请求只算一次/);
});

test('T14.1: the session-log kind wants the Claude Code home with projects, and discovery finds it', (t) => {
  const dir = home(t);
  const kind = toolKind('claude-code-logs');
  assert.equal(kind.picker.defaultHomePath, '.claude');
  assert.throws(() => kind.inspect({ file: dir }), /projects/);
  fs.mkdirSync(path.join(dir, '.claude', 'projects'), { recursive: true });
  assert.deepEqual(kind.inspect({ file: path.join(dir, '.claude') }), { installationId: null });
  assert.deepEqual(discoverTools(dir, []), [{ kind: 'claude-code-logs', path: '~/.claude', added: false }]);
  assert.equal(
    scanClaudeLogs(new DatabaseSync(':memory:'), { id: 's', file: path.join(dir, 'gone') }, range).status,
    'missing',
  );
});
