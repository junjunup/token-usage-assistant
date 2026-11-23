const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  { spawn } = require('node:child_process');
const {
  macDataName,
  macSmokeName,
  pathKey,
  sameFile,
  executableShape,
  executableFile,
  codexCandidates,
  toolEnvironment,
  loginOptions,
  readLogin,
  windowChrome,
  launcherName,
  shellQuote,
} = require('../desktop/platform.cjs');
const { ClaudeCollector } = require('../desktop/claude-collector.cjs');
const { quotaMetadata } = require('../desktop/claude-statusline.cjs');
function setup(t) {
  const root = path.resolve(__dirname, '../work/platform-tests');
  fs.mkdirSync(root, { recursive: true });
  const dir = fs.mkdtempSync(path.join(root, 'case-'));
  t.after(() => {
    assert.ok(dir.startsWith(root + path.sep));
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });
  return dir;
}
// T18.3: the macOS status-line helper is a plain sh script (system curl); nothing runs the app as Node.
const unix = { skip: process.platform === 'win32' && 'the macOS helper is a POSIX sh script' };
function component(file, input) {
  return new Promise((resolve, reject) => {
    const child = spawn('/bin/sh', [file], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    let out = '',
      err = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(Error('component timed out'));
    }, 3500);
    child.on('error', reject);
    child.stdout.on('data', (v) => (out += v));
    child.stderr.on('data', (v) => (err += v));
    child.on('exit', (code) => {
      clearTimeout(timer);
      resolve({ code, out, err });
    });
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}
test('Mac path identity preserves case; Windows fingerprint casing remains unchanged', () => {
  assert.notEqual(pathKey('/Users/A/Project', 'darwin'), pathKey('/Users/A/project', 'darwin'));
  assert.equal(pathKey('C:/Test', 'win32'), 'c:/test');
});
test('physical aliases deduplicate across platforms without conflating distinct files', (t) => {
  const dir = setup(t),
    a = path.join(dir, 'a'),
    alias = path.join(dir, 'alias'),
    b = path.join(dir, 'b');
  fs.writeFileSync(a, 'a');
  fs.writeFileSync(b, 'b');
  fs.linkSync(a, alias);
  assert.equal(sameFile(a, alias, 'darwin'), true);
  assert.equal(sameFile(a, b, 'darwin'), false);
  assert.equal(sameFile(a, b + 'missing', 'darwin'), false);
});
test('Codex Mac executable accepts extensionless files while Windows retains EXE validation', (t) => {
  const dir = setup(t),
    file = path.join(dir, 'codex');
  fs.writeFileSync(file, 'synthetic', { mode: 0o700 });
  assert.equal(executableShape(file, 'darwin'), true);
  assert.equal(executableShape(file, 'win32'), false);
  assert.equal(executableFile(file, 'darwin'), fs.realpathSync(file));
  assert.equal(executableFile(dir, 'darwin'), null);
  assert.equal(executableShape('relative', 'darwin'), false);
});
test('Mac discovery uses known app/CLI paths and ignores relative PATH entries', () => {
  const paths = codexCandidates({ platform: 'darwin', home: '/Users/test', env: { PATH: 'relative:/custom/bin::.' } });
  assert.ok(paths.includes('/Applications/Codex.app/Contents/Resources/codex'));
  assert.ok(paths.includes('/Users/test/Applications/Codex.app/Contents/Resources/codex'));
  assert.ok(paths.includes('/opt/homebrew/bin/codex'));
  assert.ok(paths.includes('/custom/bin/codex'));
  assert.ok(paths.every((p) => p.startsWith('/') && !p.includes('.exe')));
});
test('GUI child environment provides standard Mac CLI paths without shell evaluation or cwd PATH', () => {
  const env = toolEnvironment({ PATH: '.:/safe/bin', OTHER: 'preserved' }, 'darwin');
  assert.equal(env.OTHER, 'preserved');
  assert.ok(env.PATH.includes('/opt/homebrew/bin'));
  assert.equal(env.PATH.split(':').includes('.'), false);
  assert.deepEqual(toolEnvironment({ PATH: 'win' }, 'win32'), { PATH: 'win' });
});
test('Mac login registration does not pass Windows-only paths/args or removed hidden fields', () => {
  assert.deepEqual(loginOptions(true, { platform: 'darwin', executable: 'ignored' }), {
    openAtLogin: true,
    type: 'mainAppService',
  });
  assert.deepEqual(loginOptions(false, { platform: 'win32', portable: 'portable.exe', executable: 'x.exe' }), {
    openAtLogin: false,
    path: 'portable.exe',
    args: ['--hidden'],
  });
});
test('login approval, login launch and unsupported status remain distinct', () => {
  const state = readLogin(
    { getLoginItemSettings: () => ({ status: 'requires-approval', openAtLogin: false, wasOpenedAtLogin: true }) },
    'darwin',
  );
  assert.equal(state.status, 'requires-approval');
  assert.equal(state.wasOpenedAtLogin, true);
  assert.equal(
    readLogin(
      {
        getLoginItemSettings: () => {
          throw Error('private');
        },
      },
      'darwin',
    ).status,
    'unknown',
  );
});
test('Mac main gets native traffic lights while widget and Windows retain frameless bounds', () => {
  assert.equal(windowChrome('main', 'darwin').titleBarStyle, 'hidden');
  assert.equal(windowChrome('main', 'win32').frame, false);
  assert.equal(windowChrome('widget', 'darwin').frame, false);
});
test('Mac Claude launchers quote paths, need no app runtime and preserve external settings', (t) => {
  const dir = setup(t),
    c = new ClaudeCollector(path.join(dir, "space and ' apostrophe")),
    outside = path.join(dir, 'settings.json');
  fs.writeFileSync(outside, 'ORIGINAL');
  // Helpers from before T18.3 (run by the app's binary as Node) are removed when the launcher is written again.
  fs.mkdirSync(c.home, { recursive: true });
  for (const old of ['StatusLine.cjs', 'Launch-Claude.cjs', 'metadata-json.cjs'])
    fs.writeFileSync(path.join(c.home, old), '');
  c.generateLauncher('darwin');
  const settings = JSON.parse(fs.readFileSync(path.join(c.home, 'claude-settings.json'))),
    launch = fs.readFileSync(path.join(c.home, launcherName('darwin')), 'utf8');
  assert.equal(settings.statusLine.command, '/bin/sh ' + shellQuote(path.join(c.home, 'StatusLine.sh')));
  assert.equal(c.helper, path.join(c.home, 'StatusLine.sh'));
  for (const text of [settings.statusLine.command, launch]) {
    assert.doesNotMatch(text, /ELECTRON_RUN_AS_NODE|powershell|\.exe/);
    assert.doesNotMatch(text, /[a-f0-9]{64}/, 'the token stays out of commands and the process list');
  }
  assert.match(launch, /^#!\/bin\/sh\n/);
  assert.match(launch, /exec claude --settings "\$settings" "\$@"/);
  assert.equal(settings.env.OTEL_LOG_USER_PROMPTS, '0');
  assert.equal(settings.env.OTEL_TRACES_EXPORTER, 'none');
  assert.equal(fs.readFileSync(outside, 'utf8'), 'ORIGINAL');
  for (const old of ['StatusLine.cjs', 'Launch-Claude.cjs', 'metadata-json.cjs'])
    assert.equal(fs.existsSync(path.join(c.home, old)), false, old);
  // curl reads the token from this file, readable by the user only.
  const header = path.join(c.home, 'collector.header');
  assert.equal(fs.readFileSync(header, 'utf8'), 'x-tua-token: ' + c.config.token + '\n');
  if (process.platform !== 'win32') assert.equal(fs.statSync(header).mode & 0o777, 0o600);
  assert.equal(shellQuote("a'b"), "'a'\\''b'");
});
test('T18.5: the Mac launcher wants Claude Code 2.1.251 or later and passes the arguments on', unix, async (t) => {
  const dir = setup(t),
    c = new ClaudeCollector(path.join(dir, 'home dir')),
    bin = path.join(dir, 'bin');
  c.generateLauncher('darwin');
  fs.mkdirSync(bin);
  // A stand-in claude: prints its version, or each argument on its own line.
  fs.writeFileSync(
    path.join(bin, 'claude'),
    '#!/bin/sh\nif [ "$1" = --version ]; then echo "$FAKE_VERSION (Claude Code)"; exit 0; fi\nfor a; do echo "[$a]"; done\n',
    { mode: 0o755 },
  );
  const run = (version) =>
    new Promise((resolve) => {
      const child = spawn('/bin/sh', [path.join(c.home, launcherName('darwin')), '--resume', 'a b'], {
        env: { ...process.env, FAKE_VERSION: version, PATH: bin + path.delimiter + process.env.PATH },
      });
      let out = '',
        err = '';
      child.stdout.on('data', (d) => (out += d));
      child.stderr.on('data', (d) => (err += d));
      child.on('close', (code) => resolve({ out, err, code }));
    });
  for (const version of ['2.1.251', '2.1.310', '2.2.0', '3.0.1', '12.1.300']) {
    const ok = await run(version);
    assert.equal(ok.code, 0, version);
    assert.equal(ok.out, `[--settings]\n[${path.join(c.home, 'claude-settings.json')}]\n[--resume]\n[a b]\n`);
    assert.equal(ok.err, '');
  }
  for (const version of ['2.1.250', '2.0.999', '1.9.0', 'unknown']) {
    const refused = await run(version);
    assert.equal(refused.code, 1, version);
    assert.equal(refused.out, '');
    assert.match(refused.err, /2\.1\.251/);
  }
});
test('T18.3: an old helper command starting the app is recognised, so main exits instead of opening the app', () => {
  const { legacyHelperArg } = require('../desktop/platform.cjs');
  const home = '/Users/u/Library/Application Support/TokenUsageAssistant/claude-collector';
  assert.equal(legacyHelperArg(['/A/Token', home + '/StatusLine.cjs']), home + '/StatusLine.cjs');
  assert.equal(legacyHelperArg(['/A/Token', home + '/Launch-Claude.cjs', '--resume']), home + '/Launch-Claude.cjs');
  assert.equal(legacyHelperArg(['C:\\A\\Token.exe', 'C:\\x\\StatusLine.cjs']), 'C:\\x\\StatusLine.cjs');
  for (const argv of [['/A/Token'], ['/A/Token', '--hidden'], ['electron', '.', '--smoke-test'], ['/x/StatusLine.cjs']])
    assert.equal(legacyHelperArg(argv), null);
  const main = fs.readFileSync(path.join(__dirname, '..', 'desktop', 'main.cjs'), 'utf8');
  assert.ok(main.indexOf('legacyHelperArg(process.argv)') < main.indexOf('requestSingleInstanceLock'));
});
test('Mac status-line projection exports only whitelisted metadata', () => {
  const data = quotaMetadata(
    JSON.stringify({
      version: '2.1.251',
      session_id: 's',
      workspace: { current_dir: '/tmp/project', private: 'PRIVATE' },
      rate_limits: { five_hour: { used_percentage: 10, resets_at: 123, secret: 'PRIVATE' } },
      transcript_path: '/PRIVATE',
      apiKey: 'PRIVATE',
      prompt: 'PRIVATE',
    }),
  );
  assert.deepEqual(JSON.parse(JSON.stringify(data)), {
    version: '2.1.251',
    sessionId: 's',
    project: '/tmp/project',
    windows: { five_hour: { used_percentage: 10, resets_at: 123 } },
  });
});
test(
  'actual portable status-line component sends authenticated metadata to loopback without content',
  unix,
  async (t) => {
    const dir = setup(t),
      c = new ClaudeCollector(dir);
    await c.start();
    t.after(() => c.close());
    c.generateLauncher('darwin');
    const input = {
      version: '2.1.251',
      session_id: 's',
      workspace: { current_dir: '/tmp/project' },
      rate_limits: { five_hour: { used_percentage: 10, resets_at: Date.now() / 1000 + 600 } },
      prompt: 'PRIVATE_BODY',
      transcript_path: '/PRIVATE_DO_NOT_READ',
      apiKey: 'PRIVATE_KEY',
    };
    const r = await component(path.join(dir, 'StatusLine.sh'), JSON.stringify(input));
    assert.equal(r.code, 0);
    assert.match(r.out, /local collector/);
    assert.equal(r.err, '');
    const quota = fs.readFileSync(path.join(dir, 'quota.json'), 'utf8');
    assert.equal(JSON.parse(quota).windows.five_hour.used_percentage, 10);
    assert.doesNotMatch(quota, /PRIVATE|apiKey|prompt|transcript/);
  },
);
test(
  'portable status-line remains fail-open for malformed input, offline collector and oversized stdin',
  unix,
  async (t) => {
    const dir = setup(t),
      c = new ClaudeCollector(dir);
    c.generateLauncher('darwin');
    for (const text of ['{bad', JSON.stringify({ version: '2.1.251', session_id: 's' }), 'x'.repeat(1000001)]) {
      const r = await component(path.join(dir, 'StatusLine.sh'), text);
      assert.equal(r.code, 0);
      assert.match(r.out, /offline/);
      assert.equal(r.err, '');
    }
    assert.equal(fs.existsSync(path.join(dir, 'quota.json')), false);
  },
);

test('Mac packaged app keeps TokenUsageAssistant; development runs use a separate name and folder', () => {
  assert.equal(macDataName(true), 'TokenUsageAssistant');
  assert.equal(macDataName(false), 'TokenUsageAssistant-Dev');
  assert.notEqual(macDataName(true), macDataName(false));
  // main.cjs derives the userData folder and (outside --smoke-test) app.setName from this single value.
  const main = fs.readFileSync(path.join(__dirname, '..', 'desktop', 'main.cjs'), 'utf8');
  assert.match(main, /const macName = macDataName\(app\.isPackaged\);/);
  assert.match(main, /app\.setName\(smoke \? macSmokeName : macName\);/);
  assert.match(main, /app\.setPath\('userData', path\.join\(app\.getPath\('appData'\), macName\)\);/);
});

test('Mac smoke runs use their own app name, so they never touch the real Keychain Safe Storage items', () => {
  assert.equal(macSmokeName, 'TokenUsageAssistant-Smoke');
  assert.notEqual(macSmokeName, macDataName(true));
  assert.notEqual(macSmokeName, macDataName(false));
  const main = fs.readFileSync(path.join(__dirname, '..', 'desktop', 'main.cjs'), 'utf8');
  // The smoke flag is read before the Mac name is set, and the smoke report fails on any other name.
  assert.ok(main.indexOf("const smoke = process.argv.includes('--smoke-test')") < main.indexOf('app.setName('));
  // The smoke report check lives in desktop/smoke/index.cjs since T5.4.
  const smokeModule = fs.readFileSync(path.join(__dirname, '..', 'desktop', 'smoke', 'index.cjs'), 'utf8');
  assert.match(smokeModule, /\(!isMac \|\| app\.getName\(\) === macSmokeName\)/);
});

test('Mac smoke runs use the mock keychain, never a real Keychain item (2026-10-25)', () => {
  const main = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '..', 'desktop', 'main.cjs'),
    'utf8',
  );
  const mac = main.slice(main.indexOf('if (isMac) {'), main.indexOf('if (smoke || islandPoc || menubarPoc)'));
  assert.match(
    mac,
    /app\.setName\(smoke \? macSmokeName : macName\);\s*if \(smoke\) app\.commandLine\.appendSwitch\('use-mock-keychain'\);/,
  );
});
test(
  'T18.5: the Windows launcher wants Claude Code 2.1.251 or later',
  { skip: process.platform !== 'win32' && 'PowerShell launcher, Windows only' },
  async (t) => {
    const dir = setup(t),
      c = new ClaudeCollector(path.join(dir, 'home')),
      bin = path.join(dir, 'bin');
    c.generateLauncher('win32');
    fs.mkdirSync(bin);
    // A stand-in claude: its version, or a marker that it was started with the assistant's settings.
    fs.writeFileSync(
      path.join(bin, 'claude.cmd'),
      '@echo off\r\nif "%~1"=="--version" goto version\r\necho started %1\r\nexit /b 0\r\n:version\r\necho %FAKE_VERSION% Claude Code\r\n',
    );
    const run = (version) =>
      new Promise((resolve) => {
        const child = spawn(
          'powershell.exe',
          ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(c.home, launcherName('win32'))],
          {
            env: { ...process.env, FAKE_VERSION: version, PATH: bin + path.delimiter + process.env.PATH },
            windowsHide: true,
          },
        );
        let out = '';
        child.stdout.on('data', (d) => (out += d));
        child.stderr.resume();
        child.on('close', (code) => resolve({ out, code }));
      });
    for (const version of ['2.1.251', '2.2.0', '3.0.1']) {
      const r = await run(version);
      assert.equal(r.code, 0, version);
      assert.match(r.out, /started --settings/, version);
    }
    for (const version of ['2.1.250', '1.9.0', 'unknown']) {
      const r = await run(version);
      assert.notEqual(r.code, 0, version);
      assert.doesNotMatch(r.out, /started/, version);
    }
  },
);
