// Fail-open, metadata-only status-line observer for macOS. No transcript files are read. T13.1: when connected
// through Claude Code's settings it also runs the statusLine command that was there before (same input).
const fs = require('node:fs'),
  path = require('node:path'),
  http = require('node:http'),
  { spawn } = require('node:child_process');
const { projectJSON } = require('./metadata-json.cjs');
const schema = {
  version: true,
  session_id: true,
  workspace: { current_dir: true },
  rate_limits: {
    five_hour: { used_percentage: true, resets_at: true },
    seven_day: { used_percentage: true, resets_at: true },
  },
};
function quotaMetadata(text) {
  const v = projectJSON(text, schema),
    windows = {};
  for (const key of ['five_hour', 'seven_day']) if (v.rate_limits?.[key] != null) windows[key] = v.rate_limits[key];
  return { version: v.version, sessionId: v.session_id, project: v.workspace?.current_dir, windows };
}
/** The one-line text in the collector's reply, or '' (anything else is ignored). */
function statusText(reply) {
  try {
    const line = JSON.parse(reply)?.line;
    // eslint-disable-next-line no-control-regex -- control characters are matched on purpose (one-line output)
    return typeof line === 'string' && line.length <= 200 && !/[\u0000-\u001f\u007f]/.test(line) ? line : '';
  } catch {
    return '';
  }
}
/**
 * T13.1: when the helper was put into Claude Code's own settings, the statusLine command that was there before.
 * @returns {{ installed: boolean, command: string|null }}
 */
function readChain(dir = __dirname) {
  try {
    const v = JSON.parse(fs.readFileSync(path.join(dir, 'statusline-chain.json'), 'utf8'));
    return {
      installed: v?.installed === true,
      command: typeof v?.command === 'string' && v.command ? v.command : null,
    };
  } catch {
    return { installed: false, command: null };
  }
}
/**
 * What the status line shows: the previous command's output first, then the assistant's part. Without a previous
 * command the plain markers stay; when connected through settings, an offline assistant adds nothing (every session
 * would show it otherwise).
 */
function composeOutput({ ok, line, chain, chained }) {
  const ours =
    ok && line
      ? line
      : chain.command
        ? ''
        : ok
          ? 'Token usage: local collector'
          : chain.installed
            ? ''
            : 'Token usage: collector offline';
  return [chained, ours].filter(Boolean).join('\n');
}
function run() {
  const chain = readChain();
  let done = false,
    chunks = [],
    size = 0,
    request,
    child,
    quota = null,
    chained = chain.command ? null : '';
  const finish = () => {
    if (done) return;
    done = true;
    clearTimeout(deadline);
    request?.destroy();
    child?.kill();
    process.stdout.write(composeOutput({ ok: !!quota?.ok, line: quota?.line || '', chain, chained: chained || '' }));
    process.exit(0);
  };
  const settle = () => quota && chained !== null && finish();
  const quotaDone = (ok, line = '') => {
    quota ||= { ok, line };
    settle();
  };
  // A previous command (e.g. a usage tool) may be slower than the assistant's local reply.
  const deadline = setTimeout(finish, chain.command ? 4000 : 1800);
  process.stdin.on('error', () => quotaDone(false));
  process.stdin.on('data', (chunk) => {
    size += chunk.length;
    if (size > 1000000) return quotaDone(false);
    chunks.push(chunk);
  });
  process.stdin.on('end', () => {
    const input = Buffer.concat(chunks);
    chunks = [];
    if (chain.command) {
      const env = { ...process.env };
      delete env.ELECTRON_RUN_AS_NODE;
      let out = '';
      child = spawn('/bin/sh', ['-c', chain.command], { env, stdio: ['pipe', 'pipe', 'ignore'] });
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (d) => {
        if (out.length < 4000) out += d;
      });
      child.on('error', () => {
        chained = '';
        settle();
      });
      child.on('close', () => {
        chained = out.slice(0, 4000).replace(/\s+$/, '');
        settle();
      });
      child.stdin.on('error', () => {});
      child.stdin.end(input);
    }
    try {
      const body = JSON.stringify(quotaMetadata(input.toString('utf8')));
      const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'collector.json'), 'utf8'));
      if (!Number.isInteger(cfg.port) || cfg.port < 1024 || cfg.port > 65535 || !/^[a-f0-9]{64}$/.test(cfg.token))
        return quotaDone(false);
      request = http.request(
        {
          hostname: '127.0.0.1',
          port: cfg.port,
          path: '/quota',
          method: 'POST',
          headers: {
            'x-tua-token': cfg.token,
            'Content-Type': 'application/json; charset=utf-8',
            'Content-Length': Buffer.byteLength(body),
          },
        },
        (res) => {
          let reply = '';
          res.setEncoding('utf8');
          res.on('data', (d) => {
            if (reply.length < 2000) reply += d;
          });
          res.on('end', () => quotaDone(res.statusCode === 200, statusText(reply)));
        },
      );
      request.on('error', () => quotaDone(false));
      request.setTimeout(1000, () => quotaDone(false));
      request.end(body);
    } catch {
      quotaDone(false);
    }
  });
}
if (require.main === module) run();
module.exports = { quotaMetadata, statusText, readChain, composeOutput };
