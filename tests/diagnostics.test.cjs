const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path');
const { Logger, sanitizeLine } = require('../desktop/logger.cjs');
const { buildDiagnostics } = require('../desktop/diagnostics.cjs');

const secret = 'sk-diagnostics-' + 'a'.repeat(40),
  label = 'My personal work account',
  home = os.homedir();

test('diagnostics keep only whitelisted fields: no labels, keys, org ids, paths or error text', () => {
  const report = buildDiagnostics({
    app: { version: '1.8.0-beta.6', packaged: true, electron: '44.4.4', chrome: '1', node: '24' },
    system: { platform: 'darwin', arch: 'arm64', release: '15.6' },
    settings: { theme: 'dark', refreshSeconds: 60, threshold: 20, notifications: true, apiKey: secret, label },
    credentialIssue: '',
    accounts: [
      {
        provider: 'glm',
        region: 'cn',
        active: true,
        label,
        orgId: 'org-private',
        credential: { apiKey: secret },
        monitor: {
          status: 'partial',
          updatedAt: { credits: 1000, balance: 3000 },
          errors: [{ endpoint: 'credits', status: 503, code: 'http', message: `failed for ${label} ${secret}` }],
        },
      },
      { provider: 'deepseek', region: 'global', active: false, monitor: undefined },
    ],
    sources: [
      {
        id: 'x',
        kind: 'zcode',
        label,
        file: path.join(home, 'Library', 'zcode.db'),
        enabled: true,
        status: 'ready',
        lastSuccessAt: 2000,
        scannedRows: 42,
        message: `path ${home}`,
      },
      { kind: 'codex', enabled: false, status: 'disabled', lastSuccessAt: null },
    ],
    logLines: [JSON.stringify({ t: '1970-01-01T00:00:00.000Z', level: 'warn', module: 'providers', code: 'http' })],
    now: () => 0,
  });
  const text = JSON.stringify(report);
  for (const forbidden of [secret, label, 'org-private', home, '/Library/', 'failed for'])
    assert.equal(text.includes(forbidden), false, forbidden);
  assert.deepEqual(report.settings, {
    theme: 'dark',
    refreshSeconds: 60,
    threshold: 20,
    notifications: true,
    floating: null,
    pinned: null,
    launchAtLogin: null,
    widgetExpanded: null,
  });
  assert.deepEqual(report.accounts, [
    {
      provider: 'glm',
      region: 'cn',
      active: true,
      status: 'partial',
      lastSuccessAt: new Date(3000).toISOString(),
      lastError: { code: 'http', status: 503 },
    },
    { provider: 'deepseek', region: 'global', active: false, status: 'unknown', lastSuccessAt: null, lastError: null },
  ]);
  assert.deepEqual(report.toolSources, [
    { kind: 'zcode', enabled: true, status: 'ready', lastSuccessAt: new Date(2000).toISOString(), scannedRows: 42 },
    { kind: 'codex', enabled: false, status: 'disabled', lastSuccessAt: null, scannedRows: null },
  ]);
  assert.equal(report.credentialIssue, false);
  assert.equal(report.log.lines, 1);
});

test('log tail returns the newest sanitized lines across rotated files and drops malformed ones', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tua-diagnostics-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const dir = path.join(root, 'logs');
  let clock = 0;
  const logger = new Logger().configure({ dir, maxBytes: 400, now: () => clock++ });
  for (let i = 0; i < 12; i++) {
    logger.info('main', 'step', { count: i });
    logger.flushSync();
  }
  // A tampered line with a private field and a path, plus a non-JSON line, in the current file.
  fs.appendFileSync(
    path.join(dir, 'app.log'),
    JSON.stringify({ t: new Date(99).toISOString(), level: 'warn', module: home, code: 'x', message: secret }) +
      '\nnot json\n',
  );
  assert.ok(fs.existsSync(path.join(dir, 'app.log.1')), 'rotation happened');
  const tail = logger.tail(5);
  assert.ok(tail.length <= 5 && tail.length >= 3);
  const text = tail.join('\n');
  for (const forbidden of [secret, home, 'not json', 'message']) assert.equal(text.includes(forbidden), false);
  const parsed = tail.map((line) => JSON.parse(line));
  // A home path is replaced either way: '[path]' (POSIX) or 'other' (backslashes fail the identifier check).
  assert.ok(['[path]', 'other'].includes(parsed.at(-1).module));
  assert.equal(parsed.at(-2).count, 11, 'newest real entry kept, in order');
  assert.equal(sanitizeLine('{"level":"debug","t":"1970-01-01T00:00:00.000Z"}'), null);
  assert.deepEqual(new Logger().tail(), [], 'unconfigured logger returns nothing');
});

test('saving diagnostics writes exactly the previewed text, main window only', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'desktop', 'main.cjs'), 'utf8');
  const save = main.slice(main.indexOf("handle('assistant:diagnostics-save'"));
  assert.match(main, /handle\('assistant:diagnostics-preview', \(event\) => \{\n {4}mainOnly\(event\);/);
  assert.match(save, /^handle\('assistant:diagnostics-save', async \(event\) => \{\n {4}mainOnly\(event\);/);
  assert.match(save.slice(0, 1200), /fs\.writeFileSync\(choice\.filePath, text \+ '\\n'/);
});
