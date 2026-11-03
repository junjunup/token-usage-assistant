// T12.8: the update description electron-builder writes for the Setup build (latest.yml, or beta.yml / alpha.yml
// for a pre-release) must name exactly this version's Setup EXE with its real size and SHA-512, and the .blockmap
// must be next to it: electron-updater downloads that file and rejects it when the SHA-512 differs.
//   node scripts/verify-update-info.cjs --out <dir>
// Runs without installed dependencies (the Publish workflow has only a source checkout), so the fixed format is
// read with regular expressions instead of a YAML parser.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const CHANNELS = ['latest', 'beta', 'alpha'];

/** The channel electron-builder names the file after: latest for a release, else the pre-release word. */
function channelOf(version) {
  const m = /^\d+\.\d+\.\d+(?:-([a-z]+)\.\d+)?$/.exec(version);
  if (!m) throw new Error('not a release version: ' + version);
  return m[1] || 'latest';
}

/** @returns {{ file: string, version: string, path: string, sha512: string, size: number }} */
function checkUpdateInfo(dir, version) {
  const present = CHANNELS.map((c) => c + '.yml').filter((f) => fs.existsSync(path.join(dir, f)));
  const expected = channelOf(version) + '.yml';
  if (present.length !== 1 || present[0] !== expected)
    throw new Error(`expected only ${expected}, found: ${present.join(', ') || 'none'}`);
  const text = fs.readFileSync(path.join(dir, expected), 'utf8');
  const field = (name) => new RegExp('^' + name + ":\\s*'?([^'\\n]+)'?\\s*$", 'm').exec(text)?.[1].trim();
  const urls = [...text.matchAll(/^\s+-\s+url:\s*(\S+)\s*$/gm)].map((m) => m[1]);
  const setup = `TokenUsageAssistant-Setup-${version}.exe`;
  const info = { file: expected, version: field('version'), path: field('path'), sha512: field('sha512') };
  if (info.version !== version) throw new Error(`${expected} names version ${info.version}, expected ${version}`);
  if (info.path !== setup || urls.length !== 1 || urls[0] !== setup)
    throw new Error(`${expected} must name only ${setup}`);
  const bytes = fs.readFileSync(path.join(dir, setup));
  const sha512 = crypto.createHash('sha512').update(bytes).digest('base64');
  if (info.sha512 !== sha512) throw new Error(`${expected} SHA-512 differs from ${setup}`);
  const size = Number(/^\s+size:\s*(\d+)\s*$/m.exec(text)?.[1]);
  if (size !== bytes.length) throw new Error(`${expected} size ${size} differs from ${setup} (${bytes.length})`);
  if (!fs.existsSync(path.join(dir, setup + '.blockmap'))) throw new Error('missing ' + setup + '.blockmap');
  return { ...info, size };
}

if (require.main === module) {
  const i = process.argv.indexOf('--out');
  const dir = i > 0 ? process.argv[i + 1] : null;
  if (!dir) throw new Error('usage: verify-update-info.cjs --out <dir>');
  const { version } = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  console.log(JSON.stringify(checkUpdateInfo(dir, version)));
}

module.exports = { checkUpdateInfo, channelOf };
