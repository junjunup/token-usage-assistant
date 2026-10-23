// Release steps 4–5 in one go (T8.10). Read-only toward GitHub: downloads the tag's release assets from the source
// repository with `gh`, checks them, and copies them into place. Never pushes, publishes, overwrites or deletes.
//   node scripts/archive-release.cjs v1.9.0-beta.3
// - every installer's SHA256 must appear in the CI integrity reports, and all report versions must equal the tag's;
// - if the public installer repository already has the release, its asset digests and SHA256SUMS.txt must match too;
// - writes ~/Documents/TokenUsageAssistant-releases/release-v<version>/ (must not exist yet) and
//   docs/verification-<version>/ (existing files must be identical), then prints the remaining steps.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const SOURCE = 'junjunup/token-usage-assistant';
const PUBLIC = 'junjunup/TokenUsageAssistant';
const REPORTS = [
  'mac-app-integrity.json',
  'package-integrity.json',
  'smoke-result-windows.json',
  'upgrade-native-report.json',
];
const installers = (v) => [
  `TokenUsageAssistant-Setup-${v}.exe`,
  `TokenUsageAssistant-Portable-${v}.exe`,
  `TokenUsageAssistant-Mac-arm64-${v}.dmg`,
  `TokenUsageAssistant-Mac-arm64-${v}.zip`,
];
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

/**
 * Check a downloaded release folder. Returns a list of problems (empty = fine) and the installer hashes.
 * @param {string} dir
 * @param {string} version
 */
function checkRelease(dir, version) {
  const problems = [];
  const read = (f) => {
    try {
      return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    } catch {
      problems.push('missing or unreadable ' + f);
      return null;
    }
  };
  const [mac, pkg, smoke, upgrade] = REPORTS.map(read);
  if (mac && (mac.ok !== true || mac.version !== version)) problems.push('mac-app-integrity not ok for ' + version);
  if (pkg && (pkg.ok !== true || pkg.version !== version)) problems.push('package-integrity not ok for ' + version);
  if (smoke && (smoke.ok !== true || smoke.version !== version))
    problems.push('smoke-result-windows not ok for ' + version);
  if (upgrade && (upgrade.status !== 'passed' || upgrade.toVersion !== version))
    problems.push('upgrade-native-report not passed for ' + version);
  const reportText = REPORTS.map((f) =>
    fs.existsSync(path.join(dir, f)) ? fs.readFileSync(path.join(dir, f), 'utf8') : '',
  ).join('\n');
  const hashes = {};
  for (const f of installers(version)) {
    const file = path.join(dir, f);
    if (!fs.existsSync(file)) {
      problems.push('missing installer ' + f);
      continue;
    }
    hashes[f] = sha256(file);
    if (!reportText.includes(hashes[f])) problems.push('installer hash not in the CI reports: ' + f);
  }
  return { problems, hashes };
}

function gh(args) {
  return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function main() {
  const tag = process.argv[2] || '';
  if (!/^v\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/.test(tag))
    throw new Error('usage: node scripts/archive-release.cjs v<version>');
  const version = tag.slice(1);
  const root = path.resolve(__dirname, '..');
  const target = path.join(os.homedir(), 'Documents', 'TokenUsageAssistant-releases', 'release-v' + version);
  if (fs.existsSync(target)) throw new Error(target + ' already exists; old release artifacts are never overwritten');
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'tua-archive-'));
  gh([
    'release',
    'download',
    tag,
    '-R',
    SOURCE,
    '-D',
    staging,
    ...installers(version).flatMap((f) => ['-p', f]),
    ...REPORTS.flatMap((f) => ['-p', f]),
  ]);
  const { problems, hashes } = checkRelease(staging, version);
  // The public installer repository, if this version is already published there.
  let published = false;
  try {
    const view = JSON.parse(gh(['release', 'view', tag, '-R', PUBLIC, '--json', 'assets']));
    published = true;
    for (const [f, h] of Object.entries(hashes)) {
      const asset = view.assets.find((a) => a.name === f);
      if (!asset || asset.digest !== 'sha256:' + h) problems.push('public asset differs: ' + f);
    }
    const sums = path.join(staging, 'SHA256SUMS.txt');
    gh(['release', 'download', tag, '-R', PUBLIC, '-p', 'SHA256SUMS.txt', '-D', staging]);
    const listed = Object.fromEntries(
      fs
        .readFileSync(sums, 'utf8')
        .trim()
        .split('\n')
        .map((l) => l.trim().split(/\s+/).reverse()),
    );
    for (const [f, h] of Object.entries(hashes)) if (listed[f] !== h) problems.push('SHA256SUMS.txt differs: ' + f);
    fs.rmSync(sums);
  } catch (e) {
    if (published) problems.push('public release check failed: ' + (e.message || e).toString().split('\n')[0]);
  }
  if (problems.length) {
    console.error('Not archived:\n- ' + problems.join('\n- '));
    console.error('Downloaded files left in ' + staging);
    process.exit(1);
  }
  const verification = path.join(root, 'docs', 'verification-' + version);
  fs.mkdirSync(verification, { recursive: true });
  for (const f of REPORTS) {
    const to = path.join(verification, f);
    if (fs.existsSync(to) && sha256(to) !== sha256(path.join(staging, f)))
      throw new Error(to + ' exists with different content; not overwritten');
    fs.copyFileSync(path.join(staging, f), to);
  }
  fs.mkdirSync(target, { recursive: true });
  for (const f of fs.readdirSync(staging)) fs.copyFileSync(path.join(staging, f), path.join(target, f));
  fs.rmSync(staging, { recursive: true, force: true });
  console.log(`Archived ${tag}:`);
  for (const [f, h] of Object.entries(hashes)) console.log(`  ${f}  ${h}`);
  console.log(`  -> ${target}\n  -> docs/verification-${version}/ (commit it)`);
  console.log(published ? '  public release: assets and SHA256SUMS.txt match' : '  public release: not published yet');
  console.log('\nRemaining (docs/RELEASING.md): commit the reports; then, each step only after the user confirms —');
  console.log('  publish the source draft (user) -> Publish dry run -> Publish;');
  console.log('  record the push CI, tag CI, Release, Publish runs and hashes in the execution record.');
}

if (require.main === module) {
  try {
    main();
  } catch (e) {
    console.error(String(e.message || e));
    process.exit(1);
  }
}
module.exports = { checkRelease, installers, REPORTS };
