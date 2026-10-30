// Run the native smoke test of a packaged executable in a fresh isolated directory.
// Usage: node scripts/run-packaged-smoke.cjs --exe <path> --report <file> [--timeout <seconds>]
//   [--evidence-dir <dir>] [-- <extra args>]
// --evidence-dir keeps brand-native.json (OS-reported native window icon) and the smoke screenshots.
// Passes only when smoke-result.json has ok:true and the packaged version equals package.json.
const fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path'),
  { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const exe = path.resolve(arg('--exe') || '');
const reportFile = path.resolve(arg('--report') || 'smoke-result.json');
const timeoutMs = Number(arg('--timeout') || 180) * 1000;
if (!fs.existsSync(exe)) {
  console.error('executable not found: ' + exe);
  process.exit(1);
}

const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'tua-smoke-')));
const resultFile = path.join(dir, 'smoke-result.json');
const extra = process.argv.includes('--') ? process.argv.slice(process.argv.indexOf('--') + 1) : [];
const child = spawn(exe, [...extra, '--smoke-test', '--test-directory=' + dir], { stdio: 'ignore' });
let exited = null;
child.on('exit', (code) => (exited = code));

const started = Date.now();
let timer;
function tick() {
  const done = fs.existsSync(resultFile) && exited !== null;
  const timedOut = Date.now() - started > timeoutMs;
  if (!done && !timedOut) return;
  clearInterval(timer);
  if (!fs.existsSync(resultFile)) {
    if (exited === null) child.kill();
    console.error(`smoke failed: no smoke-result.json (exit=${exited}, timedOut=${timedOut})`);
    process.exit(1);
  }
  let result;
  try {
    result = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
  } catch {
    if (!timedOut) return void (timer = setInterval(tick, 1000)); // file still being written; retry
    console.error('smoke failed: smoke-result.json is not valid JSON');
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(reportFile), { recursive: true });
  fs.writeFileSync(reportFile, JSON.stringify(result, null, 2) + '\n');
  const evidence = arg('--evidence-dir');
  if (evidence) {
    fs.mkdirSync(evidence, { recursive: true });
    for (const name of fs.readdirSync(dir))
      if (name === 'brand-native.json' || name.endsWith('.png'))
        fs.copyFileSync(path.join(dir, name), path.join(evidence, name));
  }
  const failed = Object.entries(result)
    .filter(([, v]) => v && typeof v === 'object' && 'ok' in v && v.ok !== true)
    .map(([k]) => k);
  console.log(
    JSON.stringify({ ok: result.ok, version: result.version, exit: exited, timedOut, failedSections: failed }),
  );
  // A smoke that threw has no sections, only the harness's own message (synthetic data, no credentials).
  if (result.ok !== true && result.error) console.error(String(result.error) + ': ' + String(result.detail || ''));
  if (exited === null) child.kill();
  process.exit(result.ok === true && result.version === version ? 0 : 1);
}
timer = setInterval(tick, 1000);
