// @ts-check
// T20.3 (D27 ③): which platform the app in front belongs to, so the menu bar can follow it (macOS only).
// Only the front app's bundle id and, for terminals and editors, the executable names of the processes running under
// it are used: no window titles, no command lines (they can hold prompts), nothing stored or logged.
// The parsing and mapping are pure; ForegroundFollower takes its process listing as a function so tests need no OS.

/** @typedef {{ provider: string, source: string }} Focus source: what the user sees, a Chinese key for t() */

// Apps that are one platform's own client.
const APPS = Object.freeze(
  /** @type {Record<string, Focus>} */ ({
    'com.anthropic.claudefordesktop': { provider: 'claude', source: 'Claude 桌面版' },
    // The Codex desktop app (named "ChatGPT" in /Applications on some installs) uses this id.
    'com.openai.codex': { provider: 'codex', source: 'Codex 应用' },
    'ai.commandcode.desktop': { provider: 'commandcode', source: 'Command Code 应用' },
  }),
);

// Terminals and editors: any coding tool can run inside, so look at the processes under them.
const HOSTS = new Set([
  'com.apple.Terminal',
  'com.googlecode.iterm2',
  'com.mitchellh.ghostty',
  'dev.warp.Warp-Stable',
  'net.kovidgoyal.kitty',
  'org.alacritty',
  'com.github.wez.wezterm',
  'co.zeit.hyper',
  'com.microsoft.VSCode',
  'com.microsoft.VSCodeInsiders',
  'com.vscodium',
  'com.todesktop.230313mzl4w4u92', // Cursor
  'com.exafunction.windsurf',
  'dev.zed.Zed',
  'dev.zcode.app',
  'com.google.android.studio',
]);
const HOST_PREFIXES = ['com.jetbrains.'];

// Command-line tools recognisable by their executable name alone. Node-based tools (Command Code, Kimi Code, Gemini,
// Qwen) run as "node" and would need the command line, which is not read.
const CLIS = Object.freeze(/** @type {Record<string, string>} */ ({ claude: 'claude', codex: 'codex' }));

/**
 * The bundle id and pid from Electron's NSWorkspaceDidActivateApplicationNotification user info, whose
 * NSWorkspaceApplicationKey is the NSRunningApplication's description: "<NSRunningApplication: 0x… (com.x.y - 123) …>".
 * @param {any} info
 * @returns {{ bundleId: string, pid: number } | null}
 */
function parseActivation(info) {
  const text = typeof info?.NSWorkspaceApplicationKey === 'string' ? info.NSWorkspaceApplicationKey : '';
  const m = /\(([A-Za-z0-9][A-Za-z0-9.\-_]{0,199}) - (\d{1,9})\)/.exec(text);
  return m ? { bundleId: m[1], pid: Number(m[2]) } : null;
}

/**
 * `lsappinfo info -only bundleid -only pid <asn>` output: "CFBundleIdentifier"="com.x.y" and "pid"=123.
 * @param {string} text
 * @returns {{ bundleId: string, pid: number } | null}
 */
function parseLsappinfo(text) {
  const id = /"CFBundleIdentifier"="([A-Za-z0-9][A-Za-z0-9.\-_]{0,199})"/.exec(String(text || ''));
  const pid = /"pid"=(\d{1,9})/.exec(String(text || ''));
  return id && pid ? { bundleId: id[1], pid: Number(pid[1]) } : null;
}

/** @param {string} bundleId */
const isHost = (bundleId) => HOSTS.has(bundleId) || HOST_PREFIXES.some((p) => bundleId.startsWith(p));

/**
 * The known command-line tools running anywhere under `root`, from `ps -axo pid=,ppid=,comm=` output.
 * @param {string} psText
 * @param {number} root
 * @returns {string[]} platform ids, sorted, without repeats
 */
function cliProviders(psText, root) {
  /** @type {Map<number, number[]>} */
  const children = new Map();
  /** @type {Map<number, string>} */
  const names = new Map();
  for (const line of String(psText || '').split('\n')) {
    const m = /^\s*(\d+)\s+(\d+)\s+(.+?)\s*$/.exec(line);
    if (!m) continue;
    const pid = Number(m[1]),
      ppid = Number(m[2]);
    names.set(pid, m[3].slice(m[3].lastIndexOf('/') + 1));
    if (!children.has(ppid)) children.set(ppid, []);
    children.get(ppid)?.push(pid);
  }
  /** @type {Set<string>} */
  const found = new Set();
  const seen = new Set([root]);
  const queue = [...(children.get(root) || [])];
  while (queue.length) {
    const pid = /** @type {number} */ (queue.shift());
    if (seen.has(pid)) continue;
    seen.add(pid);
    const provider = CLIS[names.get(pid) || ''];
    if (provider) found.add(provider);
    queue.push(...(children.get(pid) || []));
  }
  return [...found].sort();
}

/**
 * What an activated app says about the platform in use: a Focus, or null to keep the previous one (unrelated apps,
 * the assistant itself, a terminal with no known tool or with more than one).
 * @param {{ bundleId: string, pid: number }} app
 * @param {() => Promise<string>} listProcesses resolves to `ps -axo pid=,ppid=,comm=` output
 * @returns {Promise<Focus|null>}
 */
async function focusFor(app, listProcesses) {
  const own = APPS[app.bundleId];
  if (own) return own;
  if (!isHost(app.bundleId)) return null;
  const text = await listProcesses().catch(() => null);
  if (text === null) return null;
  const found = cliProviders(text, app.pid);
  if (found.length !== 1) return null;
  const cli = Object.keys(CLIS).find((k) => CLIS[k] === found[0]);
  return { provider: found[0], source: '终端或编辑器里的 ' + cli };
}

/** Keeps the latest focus; a slower answer for an earlier activation never replaces a newer one. */
class ForegroundFollower {
  /** @param {{ listProcesses: () => Promise<string>, onChange: (focus: Focus|null) => void }} options */
  constructor({ listProcesses, onChange }) {
    this.listProcesses = listProcesses;
    this.onChange = onChange;
    /** @type {Focus|null} */
    this.focus = null;
    this.seq = 0;
  }
  /** @param {{ bundleId: string, pid: number } | null} app */
  async activated(app) {
    if (!app) return;
    const seq = ++this.seq;
    const next = await focusFor(app, this.listProcesses);
    if (seq !== this.seq || !next) return;
    if (next.provider === this.focus?.provider && next.source === this.focus?.source) return;
    this.focus = next;
    this.onChange(next);
  }
  reset() {
    this.seq++;
    if (this.focus === null) return;
    this.focus = null;
    this.onChange(null);
  }
}

module.exports = { APPS, CLIS, parseActivation, parseLsappinfo, isHost, cliProviders, focusFor, ForegroundFollower };
