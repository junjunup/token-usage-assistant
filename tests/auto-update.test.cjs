// T12.8: Windows automatic update — only the installed build, each step only after a click, and the update
// description the release ships must match the Setup EXE.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');
const { AutoInstaller, canInstall, errorCode, OWNER, REPO } = require('../desktop/auto-update.cjs');
const { REPOSITORY } = require('../desktop/update-check.cjs');
const { checkUpdateInfo } = require('../scripts/verify-update-info.cjs');
const { productionPackages, packageOf } = require('../scripts/production-deps.cjs');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

test('T12.8: only the installed Windows build installs updates; portable, macOS and development only tell', () => {
  assert.equal(canInstall({ platform: 'win32', isPackaged: true, env: {} }), true);
  assert.equal(canInstall({ platform: 'win32', isPackaged: true, env: { PORTABLE_EXECUTABLE_FILE: 'x.exe' } }), false);
  assert.equal(canInstall({ platform: 'darwin', isPackaged: true, env: {} }), false);
  assert.equal(canInstall({ platform: 'win32', isPackaged: false, env: {} }), false);
  // The same constant repository as the update check (D8).
  assert.equal(`${OWNER}/${REPO}`, REPOSITORY);
});

function fakeUpdater({ version = '1.9.0', available = true, fail = null, failDownload = null } = {}) {
  const u = new EventEmitter();
  Object.assign(u, {
    calls: [],
    async checkForUpdates() {
      u.calls.push('check');
      if (fail) throw Object.assign(new Error('https://example.invalid secret'), { code: fail });
      return { isUpdateAvailable: available, updateInfo: { version } };
    },
    async downloadUpdate() {
      u.calls.push('download');
      u.emit('download-progress', { percent: 41.7 });
      if (failDownload) throw Object.assign(new Error('x'), { code: failDownload });
      u.emit('download-progress', { percent: 100 });
    },
    quitAndInstall(silent, runAfter) {
      u.calls.push(['install', silent, runAfter]);
    },
  });
  return u;
}

test('T12.8: nothing downloads or installs on its own; a click downloads, a second click installs (not silently)', async () => {
  const u = fakeUpdater(),
    seen = [];
  const installer = new AutoInstaller({
    supported: true,
    createUpdater: () => u,
    onChange: (s) => seen.push(s.status + ':' + s.percent),
  });
  assert.equal(installer.install(), false, 'nothing to install before a download');
  assert.deepEqual(u.calls, []);
  const state = await installer.download();
  assert.equal(u.autoDownload, false);
  assert.equal(u.autoInstallOnAppQuit, false, 'quitting never installs a downloaded update');
  assert.equal(u.allowDowngrade, false);
  assert.deepEqual(state, { status: 'ready', version: '1.9.0', percent: 100, error: null });
  assert.deepEqual(seen, ['checking:null', 'downloading:0', 'downloading:41', 'downloading:100', 'ready:100']);
  assert.deepEqual(u.calls, ['check', 'download']);
  // A second download click while ready does nothing.
  await installer.download();
  assert.deepEqual(u.calls, ['check', 'download']);
  assert.equal(installer.install(), true);
  assert.deepEqual(u.calls.at(-1), ['install', false, true]);
});

test('T12.8: failures become fixed codes, never the error text; unsupported builds never create an updater', async () => {
  const cases = [
    [{ fail: 'ERR_UPDATER_CHANNEL_FILE_NOT_FOUND' }, 'not-found'],
    [{ available: false }, 'not-found'],
    [{ failDownload: 'ERR_CHECKSUM_MISMATCH' }, 'integrity'],
    [{ fail: 'ECONNRESET' }, 'failed'],
  ];
  for (const [options, error] of cases) {
    const installer = new AutoInstaller({ supported: true, createUpdater: () => fakeUpdater(options) });
    const state = await installer.download();
    assert.equal(state.status, 'failed');
    assert.equal(state.error, error);
    assert.doesNotMatch(JSON.stringify(state), /example|secret/);
    assert.equal(installer.install(), false);
  }
  assert.equal(errorCode({ code: 'toString' }), 'failed');
  assert.equal(errorCode(null), 'failed');
  let created = false;
  const off = new AutoInstaller({ supported: false, createUpdater: () => (created = true) });
  assert.equal((await off.download()).status, 'idle');
  assert.equal(created, false);
});

test('T12.8: the main process loads electron-updater only on the first click, never in smoke mode', () => {
  const main = read('desktop/main.cjs');
  assert.doesNotMatch(main, /require\('electron-updater'\)/);
  assert.match(main, /supported: !smoke && canInstall\(/);
  assert.match(
    read('desktop/auto-update.cjs'),
    /function defaultUpdater\(\) \{\n {2}const \{ NsisUpdater \} = require\('electron-updater'\)/,
  );
  // Only Windows gets an update description; macOS only tells (D4).
  const builder = read('electron-builder.yml');
  assert.ok(
    builder.indexOf('  publish:') > builder.indexOf('\nwin:') &&
      builder.indexOf('  publish:') < builder.indexOf('\nnsis:'),
  );
  assert.match(builder, /owner: junjunup\n {4}repo: TokenUsageAssistant/);
});

test('T12.8: the update description must name this Setup EXE with its real size and SHA-512', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tua-update-info-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const v = '1.9.0-beta.7',
    setup = `TokenUsageAssistant-Setup-${v}.exe`,
    bytes = Buffer.from('setup bytes');
  fs.writeFileSync(path.join(dir, setup), bytes);
  fs.writeFileSync(path.join(dir, setup + '.blockmap'), 'map');
  const sha512 = crypto.createHash('sha512').update(bytes).digest('base64');
  const yml = (o = {}) =>
    `version: ${o.version || v}\nfiles:\n  - url: ${o.url || setup}\n    sha512: ${o.sha || sha512}\n    size: ${o.size || bytes.length}\npath: ${o.url || setup}\nsha512: ${o.sha || sha512}\nreleaseDate: '2026-11-03T00:00:00.000Z'\n`;
  assert.throws(() => checkUpdateInfo(dir, v), /expected only latest\.yml, found: none/);
  fs.writeFileSync(path.join(dir, 'latest.yml'), yml());
  assert.deepEqual(checkUpdateInfo(dir, v), {
    file: 'latest.yml',
    version: v,
    path: setup,
    sha512,
    size: bytes.length,
  });
  for (const [o, error] of [
    [{ version: '1.9.0-beta.6' }, /names version/],
    [{ url: 'Other.exe' }, /must name only/],
    [{ sha: 'AAAA' }, /SHA-512 differs/],
    [{ size: 3 }, /size 3 differs/],
  ]) {
    fs.writeFileSync(path.join(dir, 'latest.yml'), yml(o));
    assert.throws(() => checkUpdateInfo(dir, v), error);
  }
  fs.writeFileSync(path.join(dir, 'latest.yml'), yml());
  fs.writeFileSync(path.join(dir, 'beta.yml'), yml());
  assert.throws(() => checkUpdateInfo(dir, v), /found: latest\.yml, beta\.yml/);
  fs.rmSync(path.join(dir, 'beta.yml'));
  fs.rmSync(path.join(dir, setup + '.blockmap'));
  assert.throws(() => checkUpdateInfo(dir, v), /blockmap/);
});

test('T12.8: release and publish carry the update description and .blockmap; the runtime dependencies are known', () => {
  const release = read('.github/workflows/release.yml'),
    publish = read('.github/workflows/publish.yml');
  for (const f of ['TokenUsageAssistant-Setup-*.exe.blockmap', 'release-out/latest.yml'])
    assert.ok(release.includes(f), f);
  assert.match(release, /verify-update-info\.cjs --out release-out/);
  assert.match(release, /verify-update-info\.cjs --out artifacts/);
  assert.match(publish, /-p latest\.yml/);
  assert.match(publish, /-eq 6/);
  assert.match(publish, /verify-update-info\.cjs --out public/);
  // Every packaged dependency comes from package.json "dependencies"; only electron-updater is direct.
  const runtime = productionPackages(root);
  assert.ok(runtime.has('electron-updater') && runtime.has('builder-util-runtime'));
  assert.deepEqual(Object.keys(JSON.parse(read('package.json')).dependencies), ['electron-updater']);
  for (const p of runtime.values())
    assert.match(read('THIRD_PARTY_LICENSES.txt'), new RegExp(`^${p.name} ${p.version} `, 'm'));
  assert.deepEqual(packageOf('node_modules/debug/node_modules/ms/index.js'), { name: 'ms', rest: 'index.js' });
  assert.equal(packageOf('desktop/main.cjs'), null);
});
