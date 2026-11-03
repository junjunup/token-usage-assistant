// Fail-open, metadata-only status-line observer for macOS. No transcript files are read.
const fs = require('node:fs'),
  path = require('node:path'),
  http = require('node:http');
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
function run() {
  let done = false,
    chunks = [],
    size = 0,
    request;
  const finish = (ok, line = '') => {
    if (done) return;
    done = true;
    clearTimeout(deadline);
    request?.destroy();
    // T12.7: the assistant's quota line when it sends one (the setting is on), otherwise the plain marker.
    process.stdout.write(ok && line ? line : ok ? 'Token usage: local collector' : 'Token usage: collector offline');
    process.exit(0);
  };
  const deadline = setTimeout(() => finish(false), 1800);
  process.stdin.on('error', () => finish(false));
  process.stdin.on('data', (chunk) => {
    size += chunk.length;
    if (size > 1000000) return finish(false);
    chunks.push(chunk);
  });
  process.stdin.on('end', () => {
    try {
      const body = JSON.stringify(quotaMetadata(Buffer.concat(chunks).toString('utf8')));
      chunks = [];
      const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'collector.json'), 'utf8'));
      if (!Number.isInteger(cfg.port) || cfg.port < 1024 || cfg.port > 65535 || !/^[a-f0-9]{64}$/.test(cfg.token))
        return finish(false);
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
          res.on('end', () => finish(res.statusCode === 200, statusText(reply)));
        },
      );
      request.on('error', () => finish(false));
      request.setTimeout(1000, () => finish(false));
      request.end(body);
    } catch {
      finish(false);
    }
  });
}
if (require.main === module) run();
module.exports = { quotaMetadata, statusText };
