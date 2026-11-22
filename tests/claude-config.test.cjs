// T13.1 (D20 ②): the status-line helper in Claude Code's own settings — only statusLine changes, a backup comes first,
// restore puts the previous one back, an unreadable file is never written, and the previous command keeps running.
// T18.3: the macOS helper is plain sh + curl; the previous command travels inside our statusLine command, so it keeps
// running when the assistant (and its data folder) is gone, and the entry from before T18.3 is recognised and replaced.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { ClaudeConfig, settingsFile, macCommand, embeddedPrevious } = require('../desktop/claude-config.cjs');
const { shellQuote } = require('../desktop/platform.cjs');

const unix = { skip: process.platform === 'win32' && 'the macOS helper is a POSIX sh script' };
const temp = (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tua-claude-config-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
};
function setup(t, platform = 'darwin') {
  const dir = temp(t),
    helperDir = path.join(dir, 'collector'),
    helper = path.join(helperDir, platform === 'win32' ? 'StatusLine.ps1' : 'StatusLine.sh');
  const make = () =>
    new ClaudeConfig({
      file: path.join(dir, '.claude', 'settings.json'),
      helperDir,
      helper,
      command:
        platform === 'win32'
          ? `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${helper}"`
          : '/bin/sh ' + shellQuote(helper),
      platform,
      now: () => 1000,
    });
  return { dir, helperDir, helper, make, file: path.join(dir, '.claude', 'settings.json') };
}
const read = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const write = (f, value) => {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, typeof value === 'string' ? value : JSON.stringify(value));
};

test('T13.1: the settings file follows CLAUDE_CONFIG_DIR, else ~/.claude', () => {
  assert.equal(settingsFile({}, '/home/u'), path.join('/home/u', '.claude', 'settings.json'));
  assert.equal(settingsFile({ CLAUDE_CONFIG_DIR: '/cfg' }, '/home/u'), path.join('/cfg', 'settings.json'));
});

test('T13.1: no settings yet: connecting creates only statusLine; restore removes it again', (t) => {
  const { make, file, helperDir, helper } = setup(t);
  const config = make();
  assert.equal(config.status().status, 'none');
  assert.equal(config.install().status, 'installed');
  assert.deepEqual(Object.keys(read(file)), ['statusLine']);
  assert.deepEqual(read(file).statusLine, { type: 'command', command: macCommand(helper, null) });
  assert.deepEqual(read(path.join(helperDir, 'statusline-chain.json')), {
    schemaVersion: 1,
    installed: true,
    command: null,
  });
  assert.equal(config.restore().status, 'none');
  assert.deepEqual(read(file), {});
  assert.equal(fs.existsSync(path.join(helperDir, 'statusline-chain.json')), false);
});

test('T13.1: other fields stay, the original is backed up, the previous statusLine chains and comes back', (t) => {
  const { make, file, helperDir } = setup(t);
  const original =
    '{\n  "model": "opus",\n  "env": { "A": "1" },\n  "statusLine": { "type": "command", "command": "ccusage statusline", "padding": 0 }\n}\n';
  write(file, original);
  const config = make();
  const status = config.install();
  assert.deepEqual(status, { status: 'installed', file, chained: true });
  const written = read(file);
  assert.equal(written.model, 'opus');
  assert.deepEqual(written.env, { A: '1' });
  assert.equal(written.statusLine.padding, 0);
  assert.match(written.statusLine.command, /StatusLine\.sh/);
  // T18.3: the previous command is carried in our own command as well as in the chain file.
  assert.equal(embeddedPrevious(written.statusLine.command), 'ccusage statusline');
  assert.equal(read(path.join(helperDir, 'statusline-chain.json')).command, 'ccusage statusline');
  assert.equal(fs.readFileSync(path.join(helperDir, 'claude-settings-backup-1000.json'), 'utf8'), original);
  // A field the user adds later survives restore; only statusLine goes back.
  fs.writeFileSync(file, JSON.stringify({ ...read(file), theme: 'dark' }));
  config.restore();
  assert.deepEqual(read(file), {
    model: 'opus',
    env: { A: '1' },
    statusLine: { type: 'command', command: 'ccusage statusline', padding: 0 },
    theme: 'dark',
  });
});

test('T18.3: the entry from before (StatusLine.cjs run as Node) is ours and becomes the sh command, previous kept', (t) => {
  const { make, file, helperDir, helper } = setup(t);
  const old = `/usr/bin/env ELECTRON_RUN_AS_NODE=1 '/Apps/Old.app/Contents/MacOS/x' '${path.join(helperDir, 'StatusLine.cjs')}'`;
  write(file, { model: 'opus', statusLine: { type: 'command', command: old, padding: 1 } });
  write(path.join(helperDir, 'claude-config.json'), {
    schemaVersion: 1,
    file,
    backup: null,
    previous: { type: 'command', command: 'ccusage statusline' },
    installedAt: 1,
  });
  const config = make();
  assert.equal(config.status().status, 'installed');
  assert.equal(config.refresh().status, 'installed');
  assert.deepEqual(read(file), {
    model: 'opus',
    statusLine: { type: 'command', command: macCommand(helper, 'ccusage statusline'), padding: 1 },
  });
  // A second start finds nothing to change.
  const before = fs.readFileSync(file, 'utf8');
  config.refresh();
  assert.equal(fs.readFileSync(file, 'utf8'), before);
  // A statusLine someone else wrote is never ours: left alone by refresh and restore.
  const theirs = { statusLine: { type: 'command', command: 'other-tool' } };
  fs.writeFileSync(file, JSON.stringify(theirs));
  assert.equal(config.status().status, 'changed');
  config.refresh();
  config.restore();
  assert.deepEqual(read(file), theirs);
  assert.equal(config.status().status, 'none', 'their statusLine on macOS can be chained by a new connect');
});

test('T18.3: without our saved state (a new data folder) refresh and restore find the previous command in the entry', (t) => {
  const { make, file, helper } = setup(t);
  const previous = `printf '%s' "it's mine"`;
  write(file, { statusLine: { type: 'command', command: macCommand(helper, previous) } });
  const config = make();
  assert.equal(config.status().status, 'installed');
  config.refresh();
  assert.equal(read(file).statusLine.command, macCommand(helper, previous), 'the carried command is kept');
  config.restore();
  assert.deepEqual(read(file), { statusLine: { type: 'command', command: previous } });
  // Without a previous command there is nothing to put back: statusLine goes.
  write(file, { statusLine: { type: 'command', command: macCommand(helper, null) } });
  config.restore();
  assert.deepEqual(read(file), {});
  assert.equal(embeddedPrevious('ccusage statusline'), null);
  assert.equal(embeddedPrevious("/bin/sh -c 'echo unclosed"), null);
});

test('T13.1: an unreadable file is never written; on Windows an existing statusLine blocks connecting', (t) => {
  for (const text of ['{ not json', '[1]', '{"statusLine": "x"}']) {
    const { make, file } = setup(t);
    write(file, text);
    const config = make();
    assert.equal(config.status().status, 'unreadable');
    assert.throws(() => config.install(), { code: 'unreadable' });
    assert.equal(fs.readFileSync(file, 'utf8'), text);
  }
  const { make, file, helper } = setup(t, 'win32');
  const text = '{"statusLine":{"type":"command","command":"mine.ps1"}}';
  write(file, text);
  assert.equal(make().status().status, 'blocked');
  assert.throws(() => make().install(), { code: 'blocked' });
  assert.equal(fs.readFileSync(file, 'utf8'), text);
  // Windows keeps its PowerShell command (no previous command to carry).
  fs.rmSync(file);
  make().install();
  assert.equal(read(file).statusLine.command, `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${helper}"`);
});

// The sh helper against a stand-in collector: token from collector.header, the reply is the line as plain text.
async function collector(t, reply) {
  const token = 'a'.repeat(64),
    seen = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (d) => (body += d));
    req.on('end', () => {
      seen.push({ url: req.url, token: req.headers['x-tua-token'], type: req.headers['content-type'], body });
      if (req.headers['x-tua-token'] !== token) return res.writeHead(403).end();
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(reply());
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => server.close());
  return { port: server.address().port, token, seen, server };
}
function helperDir(t, port, token) {
  const dir = temp(t);
  fs.copyFileSync(path.join(__dirname, '..', 'desktop', 'claude-statusline.sh'), path.join(dir, 'StatusLine.sh'));
  fs.writeFileSync(path.join(dir, 'collector.json'), JSON.stringify({ schemaVersion: 1, token, port }));
  fs.writeFileSync(path.join(dir, 'collector.header'), 'x-tua-token: ' + token + '\n');
  return dir;
}
function runHelper(dir, args = [], input = '{"session_id":"s1","rate_limits":{}}') {
  return new Promise((resolve) => {
    const child = spawn('/bin/sh', [path.join(dir, 'StatusLine.sh'), ...args], { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '',
      err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('close', (code) => resolve({ out, err, code }));
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}

test('T13.1 / T18.3: what the status line shows with and without a previous command', unix, async (t) => {
  let line = '';
  const { port, token, server } = await collector(t, () => line);
  const dir = helperDir(t, port, token);
  const out = async (...args) => (await runHelper(dir, ...args)).out;
  assert.equal(await out(), 'Token usage: local collector');
  line = 'Claude 5h 60%';
  assert.equal(await out(), 'Claude 5h 60%');
  assert.equal(await out(['--installed', 'printf mine']), 'mine\nClaude 5h 60%');
  line = '';
  assert.equal(await out(['--installed', 'printf mine']), 'mine');
  assert.equal(await out(['--installed', '']), 'Token usage: local collector', 'as before T18.3: the plain marker');
  // A reply with control characters never breaks the line apart.
  line = 'a\u0007b\nc';
  assert.equal(await out(), 'abc');
  server.close();
  assert.equal(await out(), 'Token usage: collector offline');
  assert.equal(await out(['--installed', '']), '', 'connected and offline adds nothing');
  assert.equal(await out(['--installed', 'printf mine']), 'mine');
});

test(
  'T18.3: the helper passes the input on unchanged with the token from its file, and runs the previous command with it',
  unix,
  async (t) => {
    const { port, token, seen } = await collector(t, () => 'Claude 5h 60%');
    const dir = helperDir(t, port, token);
    const input = '{"session_id":"s1","rate_limits":{}}';
    const r = await runHelper(dir, ['--installed', 'printf "mine:"; head -c 12'], input);
    assert.deepEqual(r, { out: 'mine:{"session_id\nClaude 5h 60%', err: '', code: 0 });
    assert.deepEqual(seen, [{ url: '/statusline', token, type: 'application/json', body: input }]);
    // A wrong token (stale header file) reads as offline; a missing or broken config as well. Never an error.
    fs.writeFileSync(path.join(dir, 'collector.header'), 'x-tua-token: ' + 'b'.repeat(64) + '\n');
    assert.deepEqual(await runHelper(dir), { out: 'Token usage: collector offline', err: '', code: 0 });
    fs.writeFileSync(path.join(dir, 'collector.json'), '{"port": 80}');
    assert.equal((await runHelper(dir)).out, 'Token usage: collector offline');
    fs.rmSync(path.join(dir, 'collector.json'));
    assert.deepEqual(await runHelper(dir), { out: 'Token usage: collector offline', err: '', code: 0 });
  },
);

test(
  'T18.3: with the helper gone (assistant removed), the entry runs the previous command alone, or nothing',
  unix,
  async (t) => {
    const dir = temp(t),
      gone = path.join(dir, "Application Support/it's gone/StatusLine.sh");
    const run = (command) =>
      new Promise((resolve) => {
        const child = spawn('/bin/sh', ['-c', command], { stdio: ['pipe', 'pipe', 'pipe'] });
        let out = '',
          err = '';
        child.stdout.on('data', (d) => (out += d));
        child.stderr.on('data', (d) => (err += d));
        child.on('close', (code) => resolve({ out, err, code }));
        child.stdin.end('{"x":1}');
      });
    assert.deepEqual(await run(macCommand(gone, `printf '%s|' "it's"; cat`)), {
      out: `it's|{"x":1}`,
      err: '',
      code: 0,
    });
    assert.deepEqual(await run(macCommand(gone, null)), { out: '', err: '', code: 0 });
  },
);
