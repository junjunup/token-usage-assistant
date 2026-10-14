const fs = require('node:fs'),
  path = require('node:path');
const pathKey = (value, platform = process.platform) => (platform === 'win32' ? value.toLowerCase() : value);
function sameFile(a, b, platform = process.platform) {
  try {
    const aa = fs.realpathSync(a),
      bb = fs.realpathSync(b),
      sa = fs.statSync(aa),
      sb = fs.statSync(bb);
    return sa.ino && sb.ino ? sa.dev === sb.dev && sa.ino === sb.ino : pathKey(aa, platform) === pathKey(bb, platform);
  } catch {
    return false;
  }
}
function executableShape(value, platform = process.platform) {
  return (
    typeof value === 'string' &&
    path.isAbsolute(value) &&
    // eslint-disable-next-line no-control-regex -- intentionally rejects/strips control characters (input validation and privacy).
    !/[\x00-\x1f]/.test(value) &&
    (platform !== 'win32' || value.toLowerCase().endsWith('.exe'))
  );
}
function executableFile(value, platform = process.platform) {
  try {
    if (!executableShape(value, platform) || !fs.statSync(value).isFile()) return null;
    if (platform !== 'win32') fs.accessSync(value, fs.constants.X_OK);
    return fs.realpathSync(value);
  } catch {
    return null;
  }
}
function codexCandidates({ platform = process.platform, env = process.env, home = require('node:os').homedir() } = {}) {
  if (platform === 'darwin') {
    const p = path.posix;
    return [
      '/Applications/Codex.app/Contents/Resources/codex',
      p.join(home, 'Applications/Codex.app/Contents/Resources/codex'),
      '/opt/homebrew/bin/codex',
      '/usr/local/bin/codex',
      p.join(home, '.local/bin/codex'),
      ...(env.PATH || '')
        .split(':')
        .filter((v) => p.isAbsolute(v))
        .map((v) => p.join(v, 'codex')),
    ];
  }
  if (platform === 'win32') {
    const root = path.join(env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'), 'OpenAI', 'Codex', 'bin');
    try {
      return fs
        .readdirSync(root)
        .map((n) => path.join(root, n, 'codex.exe'))
        .filter((p) => fs.existsSync(p))
        .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    } catch {
      return [];
    }
  }
  return [];
}
function toolEnvironment(env = process.env, platform = process.platform) {
  if (platform !== 'darwin') return { ...env };
  const parts = [...(env.PATH || '').split(':'), '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin'].filter(
    (p) => path.posix.isAbsolute(p),
  );
  return { ...env, PATH: [...new Set(parts)].join(':') };
}
function loginOptions(
  enabled,
  { platform = process.platform, executable = process.execPath, portable = process.env.PORTABLE_EXECUTABLE_FILE } = {},
) {
  return platform === 'darwin'
    ? { openAtLogin: enabled, type: 'mainAppService' }
    : { openAtLogin: enabled, path: portable || executable, args: ['--hidden'] };
}
function readLogin(app, platform = process.platform) {
  try {
    const result = app.getLoginItemSettings(
      platform === 'darwin'
        ? { type: 'mainAppService' }
        : { path: process.env.PORTABLE_EXECUTABLE_FILE || process.execPath, args: ['--hidden'] },
    );
    return {
      openAtLogin: !!result.openAtLogin,
      wasOpenedAtLogin: !!result.wasOpenedAtLogin,
      status: platform === 'darwin' ? result.status || 'unknown' : result.openAtLogin ? 'enabled' : 'not-registered',
    };
  } catch {
    return { openAtLogin: false, wasOpenedAtLogin: false, status: 'unknown' };
  }
}
function windowChrome(kind, platform = process.platform) {
  return platform === 'darwin' && kind === 'main'
    ? { frame: true, titleBarStyle: 'hidden', trafficLightPosition: { x: 12, y: 24 }, fullscreenable: true }
    : { frame: false };
}
const launcherName = (platform = process.platform) =>
  platform === 'darwin' ? 'Start-Claude.command' : 'Start-Claude.ps1';
const shellQuote = (value) => "'" + String(value).replaceAll("'", "'\\''") + "'";
module.exports = {
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
};
