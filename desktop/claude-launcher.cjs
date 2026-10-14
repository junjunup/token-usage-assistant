// macOS launcher. Keeps the user's working directory and original Claude settings untouched.
const path = require('node:path'),
  { spawnSync, spawn } = require('node:child_process');
function run(args = process.argv.slice(2)) {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const check = spawnSync('claude', ['--version'], {
    env,
    encoding: 'utf8',
    timeout: 5000,
    maxBuffer: 16384,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const match = check.status === 0 && check.stdout?.match(/\b(2\.1\.(\d+))\b/);
  if (!match || Number(match[2]) < 251) {
    process.stderr.write('需要 Claude Code 2.1.251 或更高的 2.1.x 版本。请在官方客户端检查安装与登录。\n');
    process.exitCode = 1;
    return;
  }
  const child = spawn('claude', ['--settings', path.join(__dirname, 'claude-settings.json'), ...args], {
    env,
    stdio: 'inherit',
  });
  child.on('error', () => {
    process.stderr.write('Claude Code 无法启动，请检查本机安装。\n');
    process.exitCode = 1;
  });
  child.on('exit', (code, signal) => {
    process.exitCode = code ?? (signal ? 1 : 0);
  });
}
if (require.main === module) run();
module.exports = { run };
