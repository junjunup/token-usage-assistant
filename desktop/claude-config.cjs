// Connect Claude in one step (T13.1, D20 ②): after the user confirms, put the assistant's status-line helper into
// Claude Code's user settings (`statusLine` in ~/.claude/settings.json, or $CLAUDE_CONFIG_DIR/settings.json), so the
// quota of every Claude Code session is collected, not only sessions opened with the launcher.
// - Only `statusLine` changes; every other field is kept as it was. A file that is not a JSON object, or whose
//   statusLine is not an object, is never written.
// - The original file is backed up first (assistant data folder) and "restore" puts the previous statusLine back.
// - An existing statusLine command keeps running: its command is saved in statusline-chain.json next to the helper,
//   which runs it with the same input and prints its output (macOS). On Windows the shell Claude Code uses for that
//   command is not known for sure, so an existing statusLine is left alone and connecting is refused there.
// - Our helper is recognised by its path (stable in the assistant's data folder), so a moved app is updated in place.
// - Per-request token usage still needs the launcher (telemetry settings are not written here: only statusLine).
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const CHAIN_FILE = 'statusline-chain.json';

/** Claude Code's user settings file. */
function settingsFile(env, home) {
  const dir = typeof env.CLAUDE_CONFIG_DIR === 'string' && env.CLAUDE_CONFIG_DIR ? env.CLAUDE_CONFIG_DIR : null;
  return path.join(dir || path.join(home, '.claude'), 'settings.json');
}

const plainObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * @returns {{ ok: true, exists: boolean, value: Record<string, any>, raw: Buffer|null, mode: number|null }
 *   | { ok: false }}
 */
function readSettings(file) {
  let raw;
  try {
    raw = fs.readFileSync(file);
  } catch (e) {
    if (/** @type {any} */ (e)?.code === 'ENOENT') return { ok: true, exists: false, value: {}, raw: null, mode: null };
    return { ok: false };
  }
  try {
    const value = JSON.parse(raw.toString('utf8').replace(/^\uFEFF/, ''));
    if (!plainObject(value) || (value.statusLine !== undefined && !plainObject(value.statusLine))) return { ok: false };
    return { ok: true, exists: true, value, raw, mode: fs.statSync(file).mode & 0o777 };
  } catch {
    return { ok: false };
  }
}

// Same steps as store.atomicWrite (temp file, fsync, rename), but formatted like Claude Code's own file and keeping
// the original permissions.
function writeSettings(file, value, mode) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  try {
    const fd = fs.openSync(temp, 'w', mode ?? 0o600);
    try {
      fs.writeFileSync(fd, JSON.stringify(value, null, 2) + '\n', 'utf8');
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(temp, file);
  } catch (e) {
    fs.rmSync(temp, { force: true });
    throw e;
  }
}

class ClaudeConfig {
  /**
   * @param {{ file: string, helperDir: string, helper: string, command: string, platform?: string,
   *   now?: () => number }} options helper: our helper's path; command: the statusLine command that runs it.
   */
  constructor({ file, helperDir, helper, command, platform = process.platform, now = Date.now }) {
    Object.assign(this, { file, helperDir, helper, command, platform, now });
  }
  get stateFile() {
    return path.join(this.helperDir, 'claude-config.json');
  }
  get chainFile() {
    return path.join(this.helperDir, CHAIN_FILE);
  }
  ours(statusLine) {
    return typeof statusLine?.command === 'string' && statusLine.command.includes(this.helper);
  }
  /** @returns {{ status: 'none'|'installed'|'changed'|'unreadable'|'blocked', file: string, chained: boolean }} */
  status() {
    const saved = readJsonFile(this.stateFile),
      read = readSettings(this.file),
      base = { file: this.file, chained: !!saved?.previous?.command };
    if (!read.ok) return { ...base, status: 'unreadable' };
    const current = read.value.statusLine;
    if (this.ours(current)) return { ...base, status: 'installed' };
    if (saved) return { ...base, status: 'changed' };
    if (current && this.platform === 'win32') return { ...base, status: 'blocked' };
    return { ...base, status: 'none' };
  }
  install() {
    const read = readSettings(this.file);
    if (!read.ok) throw Object.assign(new Error('unreadable'), { code: 'unreadable' });
    const current = read.value.statusLine;
    if (this.ours(current)) return this.refresh();
    if (current && this.platform === 'win32') throw Object.assign(new Error('blocked'), { code: 'blocked' });
    fs.mkdirSync(this.helperDir, { recursive: true, mode: 0o700 });
    let backup = null;
    if (read.raw) {
      backup = path.join(this.helperDir, `claude-settings-backup-${this.now()}.json`);
      fs.writeFileSync(backup, read.raw, { mode: 0o600 });
    }
    const previous = current ? JSON.parse(JSON.stringify(current)) : null;
    // The chain file goes first: once settings point at the helper, it must already know the previous command.
    writeJson(this.chainFile, { schemaVersion: 1, installed: true, command: previous?.command ?? null });
    writeJson(this.stateFile, { schemaVersion: 1, file: this.file, backup, previous, installedAt: this.now() });
    const statusLine = { ...(previous || {}), type: 'command', command: this.command };
    writeSettings(this.file, { ...read.value, statusLine }, read.mode);
    return this.status();
  }
  // The app moved (its path is in the command): point our entry at the current one. Never touches anything else.
  refresh() {
    const read = readSettings(this.file);
    if (!read.ok || !this.ours(read.value.statusLine) || read.value.statusLine.command === this.command)
      return this.status();
    writeSettings(
      this.file,
      { ...read.value, statusLine: { ...read.value.statusLine, command: this.command } },
      read.mode,
    );
    return this.status();
  }
  // Put the previous statusLine back (or remove ours) when ours is still there; forget our state either way.
  restore() {
    const saved = readJsonFile(this.stateFile),
      read = readSettings(this.file);
    if (read.ok && this.ours(read.value.statusLine)) {
      const next = { ...read.value };
      if (saved?.previous) next.statusLine = saved.previous;
      else delete next.statusLine;
      writeSettings(this.file, next, read.mode);
    } else if (!read.ok && saved) throw Object.assign(new Error('unreadable'), { code: 'unreadable' });
    fs.rmSync(this.chainFile, { force: true });
    fs.rmSync(this.stateFile, { force: true });
    return this.status();
  }
}

function readJsonFile(file) {
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    return plainObject(value) ? value : null;
  } catch {
    return null;
  }
}
function writeJson(file, value) {
  writeSettings(file, value, 0o600);
}

module.exports = { ClaudeConfig, settingsFile, readSettings, CHAIN_FILE };
