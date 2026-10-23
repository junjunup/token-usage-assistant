const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path');
const {
  UpdateChecker,
  compareVersions,
  newestRelease,
  RELEASES_URL,
  PAGE_PREFIX,
} = require('../desktop/update-check.cjs');
const { DEFAULT_SETTINGS, patchSettings } = require('../desktop/domain.cjs');

test('versions compare by semver, beta numbers numerically, finals after their betas', () => {
  assert.ok(compareVersions('1.8.0-beta.8', '1.8.0-beta.7') > 0);
  assert.ok(compareVersions('1.8.0-beta.10', '1.8.0-beta.9') > 0);
  assert.ok(compareVersions('1.8.0', '1.8.0-beta.9') > 0);
  assert.ok(compareVersions('1.9.0-beta.1', '1.8.0') > 0);
  assert.ok(compareVersions('1.8.0-rc.1', '1.8.0-beta.9') > 0);
  assert.equal(compareVersions('v1.8.0-beta.7', '1.8.0-beta.7'), 0);
  assert.ok(Number.isNaN(compareVersions('1.8', '1.8.0')));
  assert.ok(Number.isNaN(compareVersions('1.8.0-beta', '1.8.0')));
});

test('the newest non-draft release wins and its page is built from the constant repository', () => {
  const latest = newestRelease([
    { tag_name: 'v1.8.0-beta.7', html_url: 'https://evil.example/x' },
    { tag_name: 'v1.8.0-beta.9', draft: true },
    { tag_name: 'v1.8.0-beta.10' },
    { tag_name: 'nightly' },
    null,
  ]);
  assert.deepEqual(latest, { version: '1.8.0-beta.10', url: PAGE_PREFIX + 'v1.8.0-beta.10' });
  assert.equal(PAGE_PREFIX, 'https://github.com/junjunup/TokenUsageAssistant/releases/tag/');
  assert.equal(newestRelease({ message: 'rate limited' }), null);
  assert.equal(newestRelease([]), null);
});

const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) });

test('the request carries no identity: fixed URL, Accept and User-Agent only, no redirects', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const calls = [];
  const checker = new UpdateChecker({
    currentVersion: '1.8.0-beta.7',
    fetch: async (url, init) => {
      calls.push([url, init]);
      return reply(200, [{ tag_name: 'v1.8.0-beta.8' }]);
    },
  });
  t.after(() => checker.stop());
  checker.running = true;
  const state = await checker.check();
  assert.equal(calls.length, 1);
  const [url, init] = calls[0];
  assert.equal(url, RELEASES_URL);
  assert.equal(url, 'https://api.github.com/repos/junjunup/TokenUsageAssistant/releases?per_page=30');
  assert.equal(init.method, 'GET');
  assert.equal(init.redirect, 'error');
  assert.deepEqual(Object.keys(init.headers).sort(), ['Accept', 'User-Agent']);
  assert.equal(init.headers['User-Agent'], 'TokenUsageAssistant/1.8.0-beta.7');
  assert.equal(state.status, 'available');
  assert.deepEqual(state.latest, { version: '1.8.0-beta.8', url: PAGE_PREFIX + 'v1.8.0-beta.8' });
});

test('checks at start and every 24 h; failures are silent and retried next cycle; stop ends it', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const answers = [
    () => reply(403, { message: 'rate limited' }),
    () => {
      throw new Error('offline');
    },
    () => ({ ok: true, status: 200, text: async () => 'not json' }),
    () => reply(200, [{ tag_name: 'v1.8.0-beta.7' }, { tag_name: 'v1.8.0-beta.6' }]),
  ];
  let calls = 0;
  const changes = [];
  const checker = new UpdateChecker({
    currentVersion: '1.8.0-beta.7',
    fetch: async () => answers[calls++](),
    onChange: (s) => changes.push(s.status),
  });
  const flush = async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  };
  checker.start();
  await flush();
  assert.equal(calls, 1);
  assert.equal(checker.state.status, 'idle', '403 changes nothing');
  for (const expected of [2, 3, 4]) {
    t.mock.timers.tick(24 * 60 * 60 * 1000);
    await flush();
    assert.equal(calls, expected);
  }
  assert.equal(checker.state.status, 'current', 'same version is not an update');
  assert.equal(checker.state.latest, null);
  checker.stop();
  t.mock.timers.tick(48 * 60 * 60 * 1000);
  await flush();
  assert.equal(calls, 4, 'no request after stop');
  assert.deepEqual(changes, ['current', 'idle']);
});

test('the update check is a default-on, user-switchable setting and is wired main-window-only', () => {
  assert.equal(DEFAULT_SETTINGS.updateCheck, true);
  assert.equal(patchSettings(DEFAULT_SETTINGS, { updateCheck: false }).updateCheck, false);
  assert.throws(() => patchSettings(DEFAULT_SETTINGS, { updateCheck: 'yes' }));
  const main = fs.readFileSync(path.join(__dirname, '..', 'desktop', 'main.cjs'), 'utf8');
  assert.match(main, /handle\('assistant:open-update', \(event\) => \{\n {4}mainOnly\(event\);/);
  assert.match(main, /url\?\.startsWith\(PAGE_PREFIX\)\) return shell\.openExternal\(url\)/);
  assert.match(main, /if \(settings\.updateCheck && !smoke\) updates\.start\(\);/);
});

// T8.6: a local development build (x.y.z-beta.N-dev.<commit>) compares as the version it was built from.
test('T8.6: development builds compare as their base version and are told about newer releases', async () => {
  const { parseVersion } = require('../desktop/update-check.cjs');
  assert.deepEqual(parseVersion('1.9.0-beta.2-dev.0b82765'), parseVersion('1.9.0-beta.2'));
  assert.ok(compareVersions('1.9.0-beta.3', '1.9.0-beta.2-dev.0b82765') > 0);
  assert.equal(compareVersions('1.9.0-beta.2', '1.9.0-beta.2-dev.0b82765'), 0);
  assert.ok(compareVersions('1.9.0-beta.1', '1.9.0-beta.2-dev.0b82765') < 0);
  assert.equal(parseVersion('1.9.0-beta.2-dev.XYZ'), null);
  assert.equal(parseVersion('1.9.0-beta.2-dev.'), null);
  const checker = new UpdateChecker({
    currentVersion: '1.9.0-beta.2-dev.0b82765',
    fetch: async () => reply(200, [{ tag_name: 'v1.9.0-beta.3' }, { tag_name: 'v1.9.0-beta.2' }]),
  });
  checker.running = true; // check() without start(): no timer is scheduled
  const state = await checker.check();
  checker.stop();
  assert.equal(state.status, 'available');
  assert.equal(state.latest.version, '1.9.0-beta.3');
});
