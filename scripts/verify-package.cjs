// Verify a Windows package build against the source tree and write package-integrity.json.
// Usage: node scripts/verify-package.cjs [--out <dir>] [--report <file>] [--payloads [--7z <path>]]
// Defaults: --out release-v<version>, --report docs/verification-<version>/package-integrity.json
// --payloads extracts the app.asar embedded in the Setup and Portable EXEs with 7-Zip (default: 7z on PATH;
// nested *.7z archives are unpacked too) and requires exactly one, byte-identical to the verified win-unpacked app.asar.
const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto'),
  assert = require('node:assert/strict'),
  os = require('node:os'),
  { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const source = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = source.version;
const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > 0 && process.argv[i + 1] ? path.resolve(process.argv[i + 1]) : fallback;
};
const out = arg('--out', path.join(root, 'release-v' + version));
const reportFile = arg('--report', path.join(root, 'docs', 'verification-' + version, 'package-integrity.json'));

// @electron/asar is a transitive dependency of electron-builder; resolve it from the pnpm store.
const store = path.join(root, 'node_modules', '.pnpm');
const asarDir = fs.readdirSync(store).find((d) => d.startsWith('@electron+asar@'));
assert.ok(asarDir, '@electron/asar not found in node_modules/.pnpm');
const asar = require(path.join(store, asarDir, 'node_modules', '@electron', 'asar'));

const archive = path.join(out, 'win-unpacked', 'resources', 'app.asar');
const digest = (b) => crypto.createHash('sha256').update(b).digest('hex');
const names = asar
  .listPackage(archive)
  .map((p) => p.replace(/^[/\\]+/, ''))
  .filter((p) => !asar.statFile(archive, p).files);
const checks = [];
for (const p of names) {
  const name = p.replaceAll('\\', '/');
  assert.ok(
    name === 'package.json' || name.startsWith('desktop/') || name.startsWith('dist/client/'),
    'unexpected packaged file: ' + name,
  );
  if (name !== 'package.json') {
    const sha256 = digest(asar.extractFile(archive, p));
    assert.equal(sha256, digest(fs.readFileSync(path.join(root, name))), 'packaged file differs: ' + name);
    checks.push({ file: name, sha256 });
  }
}
const packaged = JSON.parse(asar.extractFile(archive, 'package.json'));
for (const key of ['name', 'version', 'main', 'description']) assert.equal(packaged[key], source[key]);
assert.ok(!packaged.devDependencies);
// Development-only directories that electron-builder.yml excludes (the T7.x POCs) must NOT be packaged.
const excludedDirs = fs
  .readFileSync(path.join(root, 'electron-builder.yml'), 'utf8')
  .split('\n')
  .map((line) => /^\s*-\s*'!desktop\/([^/*']+)\/\*\*'/.exec(line)?.[1])
  .filter(Boolean);
for (const dir of excludedDirs)
  assert.ok(
    !checks.some((x) => x.file.startsWith('desktop/' + dir + '/')),
    'development-only directory packaged: ' + dir,
  );
// Every other desktop module must be packaged, including desktop/smoke/ (the native smoke runs inside the package).
for (const name of fs
  .readdirSync(path.join(root, 'desktop'), { recursive: true })
  .map((x) => x.replaceAll('\\', '/'))
  .filter((x) => x.endsWith('.cjs') && !x.endsWith('.test.cjs'))
  .filter((x) => !excludedDirs.some((dir) => x.startsWith(dir + '/'))))
  assert.ok(
    checks.some((x) => x.file === 'desktop/' + name),
    'missing desktop module ' + name,
  );
// T8.7: license files next to the app (resources/) are byte-identical to the repository's; Electron's own two
// license files sit in the install root (added by electron-builder on Windows).
const licenses = ['LICENSE.txt', 'THIRD_PARTY_NOTICES.md', 'THIRD_PARTY_LICENSES.txt'].map((file) => {
  const source = file === 'LICENSE.txt' ? 'LICENSE' : file;
  const bytes = fs.readFileSync(path.join(out, 'win-unpacked', 'resources', file));
  assert.equal(digest(bytes), digest(fs.readFileSync(path.join(root, source))), 'license file differs: ' + file);
  return { file: 'resources/' + file, sha256: digest(bytes) };
});
for (const file of ['LICENSE.electron.txt', 'LICENSES.chromium.html'])
  assert.ok(fs.statSync(path.join(out, 'win-unpacked', file)).size > 0, 'missing Electron license file: ' + file);
const files = ['TokenUsageAssistant-Portable-' + version + '.exe', 'TokenUsageAssistant-Setup-' + version + '.exe'].map(
  (file) => {
    const bytes = fs.readFileSync(path.join(out, file));
    return { file, bytes: bytes.length, sha256: digest(bytes) };
  },
);
const asarSha256 = digest(fs.readFileSync(archive));
let payloads = null;
if (process.argv.includes('--payloads')) {
  const i = process.argv.indexOf('--7z');
  const sevenZip = i > 0 && process.argv[i + 1] ? process.argv[i + 1] : '7z';
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'tua-payloads-'));
  const extract = (archive, target) => {
    const run = spawnSync(sevenZip, ['x', archive, '-o' + target, '-y'], { stdio: 'ignore' });
    assert.equal(run.status, 0, '7-Zip failed on ' + path.basename(archive));
  };
  const find = (dir, test) =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const full = path.join(dir, e.name);
      return e.isDirectory() ? find(full, test) : test(e.name) ? [full] : [];
    });
  // NSIS installers (Setup and portable) keep the app inside an embedded *.7z archive.
  payloads = ['Setup', 'Portable'].map((kind) => {
    const exe = path.join(out, 'TokenUsageAssistant-' + kind + '-' + version + '.exe');
    const target = path.join(scratch, kind);
    extract(exe, target);
    let found = find(target, (name) => name === 'app.asar');
    if (!found.length) {
      find(target, (name) => name.endsWith('.7z')).forEach((inner, i) =>
        extract(inner, path.join(target, 'inner-' + i)),
      );
      found = find(target, (name) => name === 'app.asar');
    }
    assert.equal(found.length, 1, `expected exactly one app.asar in ${kind}, found ${found.length}`);
    const sha256 = digest(fs.readFileSync(found[0]));
    assert.equal(sha256, asarSha256, 'embedded payload differs from win-unpacked app.asar: ' + kind);
    return { kind, entry: path.relative(target, found[0]).replaceAll('\\', '/'), asarSha256: sha256 };
  });
  fs.rmSync(scratch, { recursive: true, force: true });
}
const report = {
  ok: true,
  version: packaged.version,
  sourceVersion: version,
  at: new Date().toISOString(),
  asarSha256,
  payloads,
  licenses,
  verifiedFiles: checks.length,
  desktopFiles: checks.filter((p) => p.file.startsWith('desktop/')).length,
  files,
  checks,
};
fs.mkdirSync(path.dirname(reportFile), { recursive: true });
fs.writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ...report, checks: undefined }));
