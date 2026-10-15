// Local diagnostic log: <userData>/logs/app.log as JSON Lines, rotated at 1 MB, 3 files kept.
// Privacy: only whitelisted extra fields are written; never error messages, stacks, URLs, headers,
// bodies, stderr, full paths, account labels or keys. Strings are redacted as a last line of defence.
// Logging never throws and never affects the caller. Until configure() runs (tests, worker threads)
// every call is a no-op.
const fs = require('node:fs'),
  path = require('node:path');

const EXTRA_FIELDS = ['stage', 'status', 'errno', 'provider', 'kind', 'durationMs', 'exitCode', 'count', 'version'];
const IDENTIFIER = /^[A-Za-z0-9_.:/-]{1,64}$/;
const REDACTIONS = [/sk-[A-Za-z0-9_-]{4,}/g, /Bearer\s+\S+/gi, /\b[0-9a-fA-F]{32,}\b/g, /[A-Za-z0-9+/_-]{32,}={0,2}/g];
const looksLikePath = (value) =>
  value.startsWith('/') || value.startsWith('~') || /^[A-Za-z]:[\\/]/.test(value) || value.includes('\\');

function redact(value) {
  let text = String(value).slice(0, 200);
  if (looksLikePath(text)) return '[path]';
  for (const pattern of REDACTIONS) text = text.replace(pattern, '[redacted]');
  return text;
}
const identifier = (value) => (typeof value === 'string' && IDENTIFIER.test(value) ? redact(value) : 'other');

function entry(level, module, code, extra, now) {
  const line = { t: new Date(now()).toISOString(), level, module: identifier(module), code: identifier(code) };
  if (extra && typeof extra === 'object')
    for (const key of EXTRA_FIELDS) {
      const value = extra[key];
      if (typeof value === 'number' && Number.isFinite(value)) line[key] = value;
      else if (typeof value === 'boolean') line[key] = value;
      else if (typeof value === 'string' && value) line[key] = redact(value);
    }
  return JSON.stringify(line);
}

class Logger {
  constructor() {
    this.dir = null;
    this.buffer = [];
    this.timer = null;
    this.writing = false;
  }
  configure({ dir, maxBytes = 1024 * 1024, keep = 3, delayMs = 500, now = Date.now, fileSystem = fs } = {}) {
    try {
      this.fs = fileSystem;
      this.maxBytes = maxBytes;
      this.keep = keep;
      this.delayMs = delayMs;
      this.now = now;
      this.fs.mkdirSync(dir, { recursive: true });
      this.dir = dir;
    } catch {
      this.dir = null; // Logging is optional; the app keeps working without it.
    }
    return this;
  }
  get file() {
    return path.join(this.dir, 'app.log');
  }
  error(module, code, extra) {
    this.write('error', module, code, extra);
  }
  warn(module, code, extra) {
    this.write('warn', module, code, extra);
  }
  info(module, code, extra) {
    this.write('info', module, code, extra);
  }
  write(level, module, code, extra) {
    try {
      if (!this.dir) return;
      this.buffer.push(entry(level, module, code, extra, this.now));
      this.schedule();
    } catch {
      // Never let logging affect the caller.
    }
  }
  schedule() {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush();
    }, this.delayMs);
    this.timer.unref?.();
  }
  rotate(incoming) {
    let size;
    try {
      size = this.fs.statSync(this.file).size;
    } catch {
      return; // No current file yet: nothing to rotate.
    }
    if (size === 0 || size + incoming <= this.maxBytes) return;
    for (let i = this.keep - 1; i >= 1; i--) {
      const from = i === 1 ? this.file : this.file + '.' + (i - 1);
      try {
        this.fs.renameSync(from, this.file + '.' + i);
      } catch {
        // A missing older file is normal.
      }
    }
  }
  take() {
    if (!this.dir || !this.buffer.length) return null;
    return this.buffer.splice(0).join('\n') + '\n';
  }
  async flush() {
    if (this.writing) return;
    const data = this.take();
    if (!data) return;
    this.writing = true;
    try {
      this.rotate(Buffer.byteLength(data));
      await this.fs.promises.appendFile(this.file, data, { encoding: 'utf8', mode: 0o600 });
    } catch {
      // Dropped; logging failures are ignored by design.
    } finally {
      this.writing = false;
      if (this.buffer.length) this.schedule();
    }
  }
  flushSync() {
    try {
      clearTimeout(this.timer);
      this.timer = null;
      const data = this.take();
      if (!data) return;
      this.rotate(Buffer.byteLength(data));
      this.fs.appendFileSync(this.file, data, { encoding: 'utf8', mode: 0o600 });
    } catch {
      // Ignored by design.
    }
  }
}

const log = new Logger();
module.exports = { log, Logger, EXTRA_FIELDS };
