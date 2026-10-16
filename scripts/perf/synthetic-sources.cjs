// T4.0: build large synthetic tool sources (Zcode SQLite + a Codex home of rollout files) for performance
// measurements, plus a tool-sources.json pointing at them. Everything is synthetic and stays in <root>.
// Usage: node scripts/perf/synthetic-sources.cjs <root> [--zcode-rows=200000] [--codex-files=300] [--codex-events=300]
const crypto = require('node:crypto'),
  fs = require('node:fs'),
  path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const root = path.resolve(process.argv[2] || '');
if (!process.argv[2]) throw new Error('root directory required');
const arg = (name, fallback) =>
  Number(process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)) || fallback;
const zcodeRows = arg('zcode-rows', 200000),
  codexFiles = arg('codex-files', 300),
  codexEvents = arg('codex-events', 300);
const now = Date.now(),
  week = 7 * 86400000,
  models = ['deepseek-chat', 'glm-4.6', 'kimi-k2', 'qwen3-coder', 'minimax-m2'];
fs.mkdirSync(root, { recursive: true });

const zcodeFile = path.join(root, 'zcode', 'zcode.db');
fs.mkdirSync(path.dirname(zcodeFile), { recursive: true });
fs.rmSync(zcodeFile, { force: true });
const db = new DatabaseSync(zcodeFile);
db.exec(
  'CREATE TABLE model_usage(id TEXT PRIMARY KEY,session_id TEXT,started_at INTEGER,model_id TEXT,status TEXT,input_tokens INTEGER,output_tokens INTEGER,provider_id TEXT,cache_creation_input_tokens INTEGER,cache_read_input_tokens INTEGER,computed_total_tokens INTEGER,raw_usage_json TEXT); CREATE TABLE session(id TEXT PRIMARY KEY,directory TEXT,title TEXT);',
);
const session = db.prepare('INSERT INTO session VALUES(?,?,?)'),
  insert = db.prepare('INSERT INTO model_usage VALUES(?,?,?,?,?,?,?,?,?,?,?,?)');
db.exec('BEGIN');
for (let s = 0; s < 500; s++) session.run('session-' + s, `/synthetic/project-${s % 40}`, 'synthetic');
for (let i = 0; i < zcodeRows; i++) {
  const input = 1000 + (i % 5000),
    output = 100 + (i % 900);
  insert.run(
    'z-' + i,
    'session-' + (i % 500),
    now - Math.floor((i / zcodeRows) * week) - 1000,
    models[i % models.length],
    i % 50 ? 'completed' : 'failed',
    input,
    output,
    'synthetic',
    i % 7,
    input >> 1,
    input + output,
    '{}',
  );
}
db.exec('COMMIT');
db.close();

const codexHome = path.join(root, 'codex-home'),
  filler = 'x'.repeat(1000);
fs.rmSync(codexHome, { recursive: true, force: true });
for (let f = 0; f < codexFiles; f++) {
  const born = now - Math.floor((f / codexFiles) * week) - 60000,
    day = new Date(born),
    dir = path.join(
      codexHome,
      'sessions',
      String(day.getFullYear()),
      String(day.getMonth() + 1).padStart(2, '0'),
      String(day.getDate()).padStart(2, '0'),
    );
  fs.mkdirSync(dir, { recursive: true });
  const lines = [
    {
      timestamp: new Date(born).toISOString(),
      type: 'session_meta',
      payload: { id: `codex-${f}`, cwd: `/synthetic/p${f % 40}`, cli_version: '0.155.0' },
    },
    {
      timestamp: new Date(born).toISOString(),
      type: 'turn_context',
      payload: { model: 'gpt-5-codex', cwd: `/synthetic/p${f % 40}` },
    },
  ];
  let total = 0;
  for (let e = 0; e < codexEvents; e++) {
    const at = new Date(born + e * 1000).toISOString(),
      last = {
        input_tokens: 2000,
        cached_input_tokens: 1500,
        cache_write_input_tokens: 0,
        output_tokens: 300,
        reasoning_output_tokens: 100,
        total_tokens: 2300,
      };
    total += 2300;
    lines.push({ timestamp: at, type: 'response_item', payload: { type: 'message', content: filler } });
    lines.push({
      timestamp: at,
      type: 'event_msg',
      payload: {
        type: 'token_count',
        info: {
          total_token_usage: {
            ...last,
            input_tokens: total - 300 * (e + 1),
            output_tokens: 300 * (e + 1),
            total_tokens: total,
          },
          last_token_usage: last,
        },
      },
    });
  }
  fs.writeFileSync(
    path.join(dir, `rollout-synthetic-${f}.jsonl`),
    lines.map((l) => JSON.stringify(l)).join('\n') + '\n',
  );
}

const config = {
  schemaVersion: 1,
  sources: [
    { id: crypto.randomUUID(), kind: 'zcode', label: 'Zcode', file: zcodeFile, enabled: true, createdAt: now },
    { id: crypto.randomUUID(), kind: 'codex', label: 'Codex', file: codexHome, enabled: true, createdAt: now },
  ],
};
fs.writeFileSync(path.join(root, 'tool-sources.json'), JSON.stringify(config, null, 2));
const size = (p) =>
  fs.statSync(p).isDirectory() ? fs.readdirSync(p).reduce((n, c) => n + size(path.join(p, c)), 0) : fs.statSync(p).size;
console.log(
  JSON.stringify({ zcodeRows, zcodeBytes: size(zcodeFile), codexFiles, codexEvents, codexBytes: size(codexHome) }),
);
