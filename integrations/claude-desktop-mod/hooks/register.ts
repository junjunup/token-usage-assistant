import type { EngineInterface, Register, SessionRateLimit } from 'claude-code';

// Token 用量助手 · Claude 额度同步. Passes the plan's live five-hour and weekly windows, exactly as the engine read them
// from Claude's own responses, to the Token Usage Assistant on this computer over the loopback address. What leaves
// the session: the Claude Code version, the session id, the session's directory and the two windows (percent used,
// reset time). Never prompts, replies, tool data or credentials. When the assistant is not running, nothing happens.

const WINDOWS = ['five_hour', 'seven_day'];
// The assistant's collector settings (port, token). macOS: ~/Library/Application Support/TokenUsageAssistant;
// Windows: %APPDATA%\commandcode-companion.
async function collector($: EngineInterface): Promise<{ port: number; token: string } | null> {
  const appData = await $.env.get('APPDATA'),
    home = await $.env.get('HOME');
  const file = appData
    ? `${appData}\\commandcode-companion\\claude-collector\\collector.json`
    : home
      ? `${home}/Library/Application Support/TokenUsageAssistant/claude-collector/collector.json`
      : null;
  if (!file) return null;
  const cfg = JSON.parse(await $.fs.read(file));
  return Number.isInteger(cfg?.port) && cfg.port >= 1024 && cfg.port <= 65535 && /^[a-f0-9]{64}$/.test(cfg?.token)
    ? { port: cfg.port, token: cfg.token }
    : null;
}

async function send($: EngineInterface, limits: SessionRateLimit[]) {
  // Only the known windows with a reset time; percent and reset time as the engine gives them.
  const windows: Record<string, { used_percentage: number; resets_at: number }> = {};
  for (const w of limits) {
    const at = w.resetsAt ? Date.parse(w.resetsAt) : NaN;
    if (WINDOWS.includes(w.kind) && Number.isFinite(w.percentUsed) && Number.isFinite(at))
      windows[w.kind] = { used_percentage: w.percentUsed, resets_at: Math.floor(at / 1000) };
  }
  if (!Object.keys(windows).length) return;
  const cfg = await collector($);
  if (!cfg) return;
  const body = JSON.stringify({
    version: (await $.session.version()).version,
    sessionId: await $.session.id(),
    project: await $.session.cwd(),
    windows,
  });
  await $.http.fetch(`http://127.0.0.1:${cfg.port}/quota`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'x-tua-token': cfg.token },
    body,
  });
}

export const register: Register = (on) => {
  // Fires when a window moves a whole point (and after each turn); the first measurement names every unit.
  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('rateLimits') && e.rateLimits.length)
      try {
        await send($, e.rateLimits);
      } catch {
        // The assistant is not running or its settings are unreadable: the session goes on untouched.
      }
    return next(e);
  });
};
