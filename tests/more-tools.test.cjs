// T13.2 (D20): Cline turns, Kilo Code (OpenCode structure) and the session totals of Goose and Crush, on synthetic
// data shaped like each tool's official source. Nothing private is projected; Goose / Crush rows are session totals.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { readMessages, scanCline } = require('../desktop/cline-reader.cjs');
const { readSessionTotals, parseTime } = require('../desktop/session-totals-reader.cjs');
const { toolKind, pickerPath } = require('../desktop/tool-kinds/index.cjs');
const { discoverTools } = require('../desktop/tool-discovery.cjs');
const { createOpenCode } = require('../desktop/smoke/opencode-fixture.cjs');
const { aggregateTools } = require('../desktop/tool-analytics.cjs');

const NOW = Date.UTC(2026, 10, 5, 9);
const range = { start: NOW - 86400000, end: NOW + 60000 };
const temp = (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tua-more-tools-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  return dir;
};
const digest = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

function clineSession(dir, id, messages) {
  const file = path.join(dir, 'sessions', id, id + '.messages.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    JSON.stringify({ version: 1, agent: 'lead', sessionId: id, system_prompt: 'PRIVATE_SYSTEM', messages }, null, 2),
  );
  return file;
}
const turn = (id, ts, metrics, extra = {}) => ({
  id,
  role: 'assistant',
  ts,
  content: [
    { type: 'thinking', thinking: 'PRIVATE_THOUGHT' },
    { type: 'text', text: 'PRIVATE_REPLY' },
  ],
  modelInfo: { id: 'claude-sonnet-4-5', provider: 'anthropic' },
  ...(metrics ? { metrics } : {}),
  ...extra,
});
const chat = [
  { id: 'u1', role: 'user', content: [{ type: 'text', text: 'PRIVATE_PROMPT' }] },
  turn('a1', NOW - 600000, null),
  turn('a2', NOW - 590000, {
    inputTokens: 1200,
    outputTokens: 300,
    cacheReadTokens: 900,
    cacheWriteTokens: 0,
    cost: 0.01,
  }),
  { id: 'u2', role: 'user', content: [{ type: 'tool_result', content: 'PRIVATE_TOOL' }] },
  turn('a3', NOW - 300000, { inputTokens: 50, outputTokens: 5 }),
];

test('T13.2 Cline: one row per turn with metrics, input as reported, cache unknown, nothing private', (t) => {
  const dir = temp(t);
  const { rows, fields } = readMessages(clineSession(dir, 's1', chat), 'src');
  assert.equal(rows.length, 2);
  assert.deepEqual(
    rows.map((r) => [r.input, r.output, r.total, r.read, r.write, r.provider, r.model]),
    [
      [1200, 300, 1500, null, null, 'anthropic', 'claude-sonnet-4-5'],
      [50, 5, 55, null, null, 'anthropic', 'claude-sonnet-4-5'],
    ],
  );
  assert.equal(rows[0].recordUnit, 'turn');
  // Only token counter names are kept (cost is not a counter).
  assert.deepEqual(fields, [
    'metrics.cacheReadTokens',
    'metrics.cacheWriteTokens',
    'metrics.inputTokens',
    'metrics.outputTokens',
  ]);
  assert.doesNotMatch(JSON.stringify(rows), /PRIVATE/);
});

test('T13.2 Cline: a fork counts each turn once; a broken file is rejected alone; the kind wants sessions/', (t) => {
  const dir = temp(t);
  clineSession(dir, 's1', chat);
  clineSession(dir, 's2', [...chat, turn('a9', NOW - 1000, { inputTokens: 1, outputTokens: 1 })]);
  clineSession(dir, 's3', [turn('b1', NOW - 1000, { inputTokens: '7', outputTokens: 1 })]);
  const result = scanCline(new DatabaseSync(':memory:'), { id: 'src', file: dir }, range);
  assert.equal(result.rows.length, 3);
  assert.equal(result.status, 'stale');
  assert.match(result.message, /1 个会话文件的用量格式不兼容/);
  assert.equal(result.contract, 'partial');
  assert.deepEqual(result.missing, ['缓存读取', '缓存写入']);
  const kind = toolKind('cline');
  assert.throws(() => kind.inspect({ file: path.join(dir, 'sessions') }), /sessions/);
  assert.deepEqual(kind.inspect({ file: dir }), { installationId: null });
  assert.equal(
    scanCline(new DatabaseSync(':memory:'), { id: 's', file: path.join(dir, 'gone') }, range).status,
    'missing',
  );
});

function goose(file, rows, { columns = true } = {}) {
  const db = new DatabaseSync(file);
  db.exec(`CREATE TABLE sessions (id TEXT PRIMARY KEY, name TEXT, description TEXT, working_dir TEXT NOT NULL,
    created_at TIMESTAMP, updated_at TIMESTAMP, recipe_json TEXT, model_config_json TEXT, provider_name TEXT,
    ${columns ? 'accumulated_total_tokens INTEGER, accumulated_input_tokens INTEGER, accumulated_output_tokens INTEGER' : 'total_tokens INTEGER'})`);
  if (!columns) return db.close();
  const insert = db.prepare(
    'INSERT INTO sessions (id,name,description,working_dir,created_at,updated_at,recipe_json,model_config_json,provider_name,accumulated_total_tokens,accumulated_input_tokens,accumulated_output_tokens) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
  );
  for (const r of rows) insert.run(...r);
  db.close();
}
const iso = (ms) => new Date(ms).toISOString().replace('T', ' ').slice(0, 19);

test('T13.2 Goose: one session total per session dated by its last update, read-only, no names or recipes', (t) => {
  const dir = temp(t),
    file = path.join(dir, 'sessions.db');
  goose(file, [
    [
      'g1',
      'PRIVATE_NAME',
      'PRIVATE_DESC',
      '/work/a',
      iso(NOW - 7200000),
      iso(NOW - 600000),
      'PRIVATE_RECIPE',
      JSON.stringify({ model_name: 'gpt-5', api_key: 'PRIVATE_KEY' }),
      'openai',
      1300,
      1000,
      300,
    ],
    ['g2', 'n', 'd', '/work/b', iso(NOW - 3000), iso(NOW - 2000), null, 'not json', 'anthropic', null, null, null],
    ['g3', 'n', 'd', '/work/c', iso(NOW - 5 * 86400000), iso(NOW - 5 * 86400000), null, null, null, 10, 5, 5],
    ['g4', 'n', 'd', '/work/d', iso(NOW - 3000), iso(NOW - 2000), null, null, null, 10, 5, null],
  ]);
  const before = digest(file);
  const r = toolKind('goose').scan(null, { id: 'src', file }, range);
  assert.equal(digest(file), before);
  assert.equal(r.rows.length, 1, 'no-usage sessions are skipped, out-of-range sessions too');
  const [row] = r.rows;
  assert.deepEqual(
    [row.input, row.output, row.total, row.read, row.model, row.provider, row.project],
    [1000, 300, 1300, null, 'gpt-5', 'openai', '/work/a'],
  );
  assert.equal(row.at, NOW - 600000);
  assert.equal(row.recordUnit, 'session-total');
  assert.equal(r.status, 'stale');
  assert.match(r.message, /1 个会话的用量格式不兼容.*会话级汇总/);
  assert.doesNotMatch(JSON.stringify(r.rows), /PRIVATE/);
  const report = aggregateTools(r.rows, range, {}, {});
  assert.equal(report.summary.total, 1300);
  assert.equal(report.summary.successRate, null, 'session totals have no request status');
  goose(path.join(dir, 'old.db'), [], { columns: false });
  assert.equal(readSessionTotals('goose', { id: 's', file: path.join(dir, 'old.db') }, range).status, 'schema');
  assert.equal(readSessionTotals('goose', { id: 's', file: path.join(dir, 'gone.db') }, range).status, 'missing');
});

test('T13.2 Crush: top-level sessions only (sub-agents roll into their parent), model from the last reply', (t) => {
  const dir = temp(t),
    file = path.join(dir, 'crush.db');
  const db = new DatabaseSync(file);
  db.exec(`CREATE TABLE sessions (id TEXT PRIMARY KEY, parent_session_id TEXT, title TEXT, message_count INTEGER,
      prompt_tokens INTEGER, completion_tokens INTEGER, cost REAL, updated_at INTEGER, created_at INTEGER);
    CREATE TABLE messages (id TEXT PRIMARY KEY, session_id TEXT, role TEXT, parts TEXT, model TEXT, provider TEXT,
      created_at INTEGER, updated_at INTEGER);`);
  const s = Math.floor((NOW - 60000) / 1000);
  db.prepare('INSERT INTO sessions VALUES (?,?,?,?,?,?,?,?,?)').run(
    'c1',
    null,
    'PRIVATE_TITLE',
    4,
    800,
    200,
    0.02,
    s,
    s - 100,
  );
  db.prepare('INSERT INTO sessions VALUES (?,?,?,?,?,?,?,?,?)').run('c2', 'c1', 'sub', 2, 100, 50, 0.01, s, s - 50);
  const m = db.prepare('INSERT INTO messages VALUES (?,?,?,?,?,?,?,?)');
  m.run('m1', 'c1', 'assistant', '[{"text":"PRIVATE_REPLY"}]', 'old-model', 'openai', s - 90, s - 90);
  m.run('m2', 'c1', 'assistant', '[]', 'glm-4.6', 'zai', s - 10, s - 10);
  db.close();
  const r = toolKind('crush').scan(null, { id: 'src', file }, range);
  assert.equal(r.status, 'ready');
  assert.deepEqual(
    r.rows.map((x) => [x.sessionId, x.input, x.output, x.total, x.model, x.provider, x.at]),
    [['c1', 800, 200, 1000, 'glm-4.6', 'zai', s * 1000]],
  );
  assert.doesNotMatch(JSON.stringify(r), /PRIVATE/);
  assert.match(r.messageDetail, /跨天的会话整段算在最后那天/);
});

test('T13.2 Kilo Code: kilo.db is read with the OpenCode structure and named Kilo Code', (t) => {
  const dir = temp(t),
    file = createOpenCode(path.join(dir, 'kilo.db'), Date.now());
  const r = toolKind('kilo').scan(null, { id: 'src', file }, { start: Date.now() - 3600000, end: Date.now() });
  assert.equal(r.status, 'ready');
  assert.ok(r.rows.length > 0);
  assert.ok(r.rows.every((x) => x.tool === 'kilo' && x.provenance.startsWith('kilo-sqlite/')));
  assert.match(r.message, /^Kilo Code /);
  assert.match(toolKind('kilo').scan(null, { id: 's', file: path.join(dir, 'x.db') }, range).message, /kilo\.db/);
});

test('T13.2: timestamps, per-platform defaults and discovery of the new tools', (t) => {
  assert.equal(parseTime('2026-11-05 09:00:00'), Date.UTC(2026, 10, 5, 9));
  assert.equal(parseTime('2026-11-05T09:00:00+08:00'), Date.UTC(2026, 10, 5, 1));
  assert.equal(parseTime(1_800_000_000), 1_800_000_000_000);
  assert.equal(parseTime(1_800_000_000_000), 1_800_000_000_000);
  assert.equal(parseTime('soon'), null);
  assert.equal(parseTime(0), null);
  const picker = toolKind('goose').picker;
  assert.equal(pickerPath(picker, 'defaultFilePath', 'darwin'), '.local/share/goose/sessions/sessions.db');
  assert.equal(pickerPath(picker, 'defaultFilePath', 'win32'), 'AppData/Roaming/Block/goose/data/sessions/sessions.db');
  assert.equal(pickerPath(toolKind('crush').picker, 'defaultFilePath'), null, 'Crush has one database per project');
  const home = temp(t);
  fs.mkdirSync(path.join(home, '.cline', 'data', 'sessions'), { recursive: true });
  fs.mkdirSync(path.join(home, '.local', 'share', 'kilo'), { recursive: true });
  fs.writeFileSync(path.join(home, '.local', 'share', 'kilo', 'kilo.db'), '');
  if (process.platform !== 'win32') {
    fs.mkdirSync(path.join(home, '.local', 'share', 'goose', 'sessions'), { recursive: true });
    fs.writeFileSync(path.join(home, '.local', 'share', 'goose', 'sessions', 'sessions.db'), '');
  }
  const found = discoverTools(home, []).map((f) => f.kind);
  assert.deepEqual(found, process.platform === 'win32' ? ['cline', 'kilo'] : ['cline', 'kilo', 'goose']);
});
