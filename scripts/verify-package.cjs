// Verify a Windows package build against the source tree and write package-integrity.json.
// Usage: node scripts/verify-package.cjs [--out <dir>] [--report <file>]
// Defaults: --out release-v<version>, --report docs/verification-<version>/package-integrity.json
const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto'),
  assert = require('node:assert/strict');

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
for (const name of fs.readdirSync(path.join(root, 'desktop')).filter((x) => x.endsWith('.cjs')))
  assert.ok(
    checks.some((x) => x.file === 'desktop/' + name),
    'missing desktop module ' + name,
  );
const files = ['TokenUsageAssistant-Portable-' + version + '.exe', 'TokenUsageAssistant-Setup-' + version + '.exe'].map(
  (file) => {
    const bytes = fs.readFileSync(path.join(out, file));
    return { file, bytes: bytes.length, sha256: digest(bytes) };
  },
);
const report = {
  ok: true,
  version: packaged.version,
  sourceVersion: version,
  at: new Date().toISOString(),
  asarSha256: digest(fs.readFileSync(archive)),
  verifiedFiles: checks.length,
  desktopFiles: checks.filter((p) => p.file.startsWith('desktop/')).length,
  files,
  checks,
};
fs.mkdirSync(path.dirname(reportFile), { recursive: true });
fs.writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ...report, checks: undefined }));
