// Command-line quota snapshot files (T13.5, D20 ③). Only while the user has turned the setting on: the assistant
// keeps <data>/cli/status.json and status.txt current and puts a command next to them that prints one of them
// (macOS `tua-status`, Windows `tua-status.cmd`). Nothing listens on the network; the command only reads these files,
// so it works while the assistant is closed too and then shows the last values with their time. Turning the setting
// off removes the files.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { shellQuote } = require('./platform.cjs');
const { statusSnapshot, statusText } = require('./status-snapshot.cjs');

const MISSING = '还没有额度快照：请打开 Token 用量助手，并在设置里开启「命令行读取额度」。';
// Rewritten when the values change, or at least this often so generatedAt shows the assistant is running.
const REFRESH_MS = 60_000;

function writeText(file, text, mode = 0o600) {
  const temp = `${file}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  try {
    fs.writeFileSync(temp, text, { encoding: 'utf8', mode });
    fs.renameSync(temp, file);
  } catch (e) {
    fs.rmSync(temp, { force: true });
    throw e;
  }
}

/** The command files for a platform, with the snapshot folder written in (a copy or link elsewhere still works). */
function scripts(dir, platform) {
  if (platform === 'win32') {
    const quoted = "'" + dir.replace(/'/g, "''") + "'";
    return {
      'tua-status.ps1':
        '# Token 用量助手：打印全部账户的额度快照（只读助手自己写的文件，不联网）。用法：tua-status [--text]\r\n' +
        "$ErrorActionPreference = 'Stop'\r\n" +
        '[Console]::OutputEncoding = [Text.Encoding]::UTF8\r\n' +
        `$tuaFile = Join-Path ${quoted} $(if ($args -contains '--text') { 'status.txt' } else { 'status.json' })\r\n` +
        `if (-not (Test-Path -LiteralPath $tuaFile)) { [Console]::Error.WriteLine('${MISSING}'); exit 1 }\r\n` +
        '[Console]::Write([IO.File]::ReadAllText($tuaFile, [Text.Encoding]::UTF8))\r\n',
      'tua-status.cmd': '@powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tua-status.ps1" %*\r\n',
    };
  }
  return {
    'tua-status':
      '#!/bin/sh\n' +
      '# Token 用量助手：打印全部账户的额度快照（只读助手自己写的文件，不联网）。用法：tua-status [--text]\n' +
      `dir=${shellQuote(dir)}\n` +
      'file="$dir/status.json"\n' +
      '[ "$1" = "--text" ] && file="$dir/status.txt"\n' +
      `[ -f "$file" ] || { echo ${shellQuote(MISSING)} >&2; exit 1; }\n` +
      'exec cat "$file"\n',
  };
}

class StatusExport {
  /** @param {{ dir: string, platform?: string, now?: () => number }} options */
  constructor({ dir, platform = process.platform, now = Date.now }) {
    Object.assign(this, { dir, platform, now });
    this.last = null;
    this.lastAt = 0;
  }
  get command() {
    return path.join(this.dir, this.platform === 'win32' ? 'tua-status.cmd' : 'tua-status');
  }
  /** Writes the snapshot when its values changed (or once a minute); creates the command files on first use. */
  update(summaries, settings) {
    const now = this.now(),
      snapshot = statusSnapshot(summaries, settings, now),
      values = JSON.stringify(snapshot.accounts);
    if (values === this.last && now - this.lastAt < REFRESH_MS) return false;
    fs.mkdirSync(this.dir, { recursive: true, mode: 0o700 });
    for (const [name, text] of Object.entries(scripts(this.dir, this.platform))) {
      const file = path.join(this.dir, name);
      if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== text)
        writeText(file, text, name === 'tua-status' ? 0o700 : 0o600);
    }
    writeText(path.join(this.dir, 'status.json'), JSON.stringify(snapshot, null, 2) + '\n');
    writeText(path.join(this.dir, 'status.txt'), statusText(snapshot));
    this.last = values;
    this.lastAt = now;
    return true;
  }
  /** Setting off: the snapshot and the command files go away. */
  remove() {
    for (const name of ['status.json', 'status.txt', 'tua-status', 'tua-status.ps1', 'tua-status.cmd'])
      fs.rmSync(path.join(this.dir, name), { force: true });
    this.last = null;
    this.lastAt = 0;
  }
}
module.exports = { StatusExport, scripts, MISSING };
