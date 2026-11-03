// T13.1 (D20 ②): the status-line helper in Claude Code's own settings — only statusLine changes, a backup comes first,
// restore puts the previous one back, an unreadable file is never written, and the previous command keeps running.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { ClaudeConfig, settingsFile } = require('../desktop/claude-config.cjs');
const { composeOutput, readChain } = require('../desktop/claude-statusline.cjs');

const temp = (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tua-claude-config-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
};
function setup(t, platform = 'darwin') {
  const dir = temp(t),
    helperDir = path.join(dir, 'collector'),
    helper = path.join(helperDir, 'StatusLine.cjs');
  const make = (runtime = '/Apps/Old.app/node') =>
    new ClaudeConfig({
      file: path.join(dir, '.claude', 'settings.json'),
      helperDir,
      helper,
      command: `/usr/bin/env ELECTRON_RUN_AS_NODE=1 '${runtime}' '${helper}'`,
      platform,
      now: () => 1000,
    });
  return { dir, helperDir, make, file: path.join(dir, '.claude', 'settings.json') };
}
const read = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));

test('T13.1: the settings file follows CLAUDE_CONFIG_DIR, else ~/.claude', () => {
  assert.equal(settingsFile({}, '/home/u'), path.join('/home/u', '.claude', 'settings.json'));
  assert.equal(settingsFile({ CLAUDE_CONFIG_DIR: '/cfg' }, '/home/u'), path.join('/cfg', 'settings.json'));
});

test('T13.1: no settings yet: connecting creates only statusLine; restore removes it again', (t) => {
  const { make, file, helperDir } = setup(t);
  const config = make();
  assert.equal(config.status().status, 'none');
  assert.equal(config.install().status, 'installed');
  assert.deepEqual(Object.keys(read(file)), ['statusLine']);
  assert.equal(read(file).statusLine.type, 'command');
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
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const original =
    '{\n  "model": "opus",\n  "env": { "A": "1" },\n  "statusLine": { "type": "command", "command": "ccusage statusline", "padding": 0 }\n}\n';
  fs.writeFileSync(file, original);
  const config = make();
  const status = config.install();
  assert.deepEqual(status, { status: 'installed', file, chained: true });
  const written = read(file);
  assert.equal(written.model, 'opus');
  assert.deepEqual(written.env, { A: '1' });
  assert.equal(written.statusLine.padding, 0);
  assert.match(written.statusLine.command, /StatusLine\.cjs/);
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

test('T13.1: a moved app updates only our command; a statusLine changed by someone else is left alone', (t) => {
  const { make, file } = setup(t);
  make('/Apps/Old.app/node').install();
  const moved = make('/Apps/New.app/node');
  assert.equal(moved.refresh().status, 'installed');
  assert.match(read(file).statusLine.command, /New\.app/);
  const theirs = { statusLine: { type: 'command', command: 'other-tool' } };
  fs.writeFileSync(file, JSON.stringify(theirs));
  assert.equal(moved.status().status, 'changed');
  moved.refresh();
  moved.restore();
  assert.deepEqual(read(file), theirs);
  assert.equal(moved.status().status, 'none', 'their statusLine on macOS can be chained by a new connect');
});

test('T13.1: an unreadable file is never written; on Windows an existing statusLine blocks connecting', (t) => {
  for (const text of ['{ not json', '[1]', '{"statusLine": "x"}']) {
    const { make, file } = setup(t);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
    const config = make();
    assert.equal(config.status().status, 'unreadable');
    assert.throws(() => config.install(), { code: 'unreadable' });
    assert.equal(fs.readFileSync(file, 'utf8'), text);
  }
  const { make, file } = setup(t, 'win32');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const text = '{"statusLine":{"type":"command","command":"mine.ps1"}}';
  fs.writeFileSync(file, text);
  assert.equal(make().status().status, 'blocked');
  assert.throws(() => make().install(), { code: 'blocked' });
  assert.equal(fs.readFileSync(file, 'utf8'), text);
});

test('T13.1: what the status line shows with and without a previous command', () => {
  const plain = { installed: false, command: null },
    installed = { installed: true, command: null },
    chain = { installed: true, command: 'x' };
  assert.equal(composeOutput({ ok: true, line: '', chain: plain, chained: '' }), 'Token usage: local collector');
  assert.equal(composeOutput({ ok: false, line: '', chain: plain, chained: '' }), 'Token usage: collector offline');
  assert.equal(composeOutput({ ok: false, line: '', chain: installed, chained: '' }), '', 'offline adds nothing');
  assert.equal(composeOutput({ ok: true, line: 'Claude 5h 60%', chain, chained: 'mine' }), 'mine\nClaude 5h 60%');
  assert.equal(composeOutput({ ok: true, line: '', chain, chained: 'mine' }), 'mine');
  assert.equal(composeOutput({ ok: false, line: '', chain, chained: 'mine' }), 'mine');
  assert.deepEqual(readChain(os.tmpdir() + '/missing-dir'), plain);
});

test(
  'T13.1: the helper runs the previous command with the same input and adds the quota line',
  { skip: process.platform === 'win32' },
  async (t) => {
    const dir = temp(t);
    for (const f of ['claude-statusline.cjs', 'metadata-json.cjs'])
      fs.copyFileSync(path.join(__dirname, '..', 'desktop', f), path.join(dir, f));
    fs.writeFileSync(
      path.join(dir, 'statusline-chain.json'),
      JSON.stringify({ installed: true, command: 'printf "mine:"; head -c 12' }),
    );
    const token = 'a'.repeat(64);
    const server = http.createServer((req, res) => {
      req.resume();
      req.on('end', () => res.end(JSON.stringify({ line: 'Claude 5h 60%' })));
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    t.after(() => server.close());
    const runHelper = (port) => {
      fs.writeFileSync(path.join(dir, 'collector.json'), JSON.stringify({ port, token }));
      return new Promise((resolve) => {
        const child = spawn(process.execPath, [path.join(dir, 'claude-statusline.cjs')], {
          stdio: ['pipe', 'pipe', 'ignore'],
        });
        let out = '';
        child.stdout.on('data', (d) => (out += d));
        child.on('close', () => resolve(out));
        child.stdin.end('{"session_id":"s1","rate_limits":{}}');
      });
    };
    const { port } = server.address();
    assert.equal(await runHelper(port), 'mine:{"session_id\nClaude 5h 60%');
    server.close();
    // Assistant not running: the previous command's output alone.
    assert.equal(await runHelper(port), 'mine:{"session_id');
  },
);
