// @ts-check
// Command-line quota snapshot (T13.5, D20 ③): every account's quota windows and balances as JSON and as plain text,
// for scripts and other tools. Pure: no Electron, no I/O (status-export.cjs writes the files).
// - Order and alert tones are the menu-bar icon's own rule (rankAccounts), so the first account is the tightest.
// - Values as the platforms report them: missing is null (never 0), money is the full decimal string with its
//   currency, accounts and currencies are never added together, a failed refresh keeps the last values marked stale.
// - No credentials, identities, emails or organisation ids: only what the overview already shows.
const { rankAccounts } = require('./menubar-status.cjs');

const STALE = ['stale', 'offline', 'auth-error', 'partial'];
const iso = (/** @type {any} */ v) =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? new Date(v).toISOString() : null;

/**
 * @typedef {import('./menubar-status.cjs').AccountSummary} AccountSummary
 * @typedef {{ id: string, label: string, remainingPercent: number|null, state: 'active'|'idle'|'unlimited',
 *   exceeded: boolean, resetAt: string|null, alert: string }} SnapshotWindow
 * @typedef {{ currency: string, amount: string|null, available: boolean|null }} SnapshotBalance
 * @typedef {{ id: string, label: string, provider: string, status: string, stale: boolean, updatedAt: string|null,
 *   tightest: string|null, windows: SnapshotWindow[], balances: SnapshotBalance[], text: string }} SnapshotAccount
 * @typedef {{ schema: string, schemaVersion: number, generatedAt: string, accounts: SnapshotAccount[] }} Snapshot
 */

/**
 * @param {AccountSummary[]} summaries
 * @param {{ threshold?: number }} settings
 * @param {number} now
 * @returns {Snapshot}
 */
function statusSnapshot(summaries, settings, now) {
  const threshold = typeof settings?.threshold === 'number' ? settings.threshold : 20;
  const accounts = rankAccounts(summaries, threshold).map(({ a, slots, focus }) => {
    const stamps = Object.values(a.updatedAt || {}).filter((v) => typeof v === 'number' && v > 0);
    /** @type {SnapshotBalance[]} */
    const balances = [];
    const b = a.parts?.balance;
    if (a.capabilities?.balance && !a.capabilities?.quota)
      for (const row of Array.isArray(b?.balances) ? b.balances : [])
        balances.push({
          currency: String(row.currency),
          amount: typeof row.total === 'string' ? row.total : null,
          available: typeof b.isAvailable === 'boolean' ? b.isAvailable : null,
        });
    const monthly = a.parts?.credits?.monthly;
    if (typeof monthly === 'number' && Number.isFinite(monthly))
      balances.push({ currency: 'USD', amount: String(monthly), available: monthly > 0 });
    const windows = slots
      .filter((s) => s.kind === 'window')
      .map((s) => ({
        id: s.id,
        label: s.label,
        remainingPercent: s.percent,
        state: /** @type {'active'|'idle'|'unlimited'} */ (
          s.window?.unlimited ? 'unlimited' : s.text === '未启用' ? 'idle' : 'active'
        ),
        exceeded: !!s.window?.exceeded,
        resetAt: iso(s.resetAt),
        alert: s.tone,
      }));
    const stale = STALE.includes(String(a.status || ''));
    return {
      id: a.id,
      label: a.label,
      provider: a.provider,
      status: String(a.status || ''),
      stale,
      updatedAt: iso(stamps.length ? Math.max(...stamps) : null),
      tightest: focus ? focus.id : null,
      windows,
      balances,
      // The account's line in the text form: every value it has, as the panel shows it.
      text:
        a.label +
        '：' +
        (slots.length ? slots.map((s) => s.label + ' ' + s.text).join('，') : '暂无数据') +
        (stale ? '（上次的值）' : ''),
    };
  });
  return { schema: 'token-usage-assistant.status', schemaVersion: 1, generatedAt: iso(now) || '', accounts };
}

/**
 * The text form: when it was made, then one line per account, tightest first.
 * @param {Snapshot} snapshot
 */
function statusText(snapshot) {
  const lines = ['Token 用量助手 · 生成于 ' + snapshot.generatedAt + '（UTC）'];
  if (!snapshot.accounts.length) lines.push('未连接账户');
  for (const a of snapshot.accounts) lines.push(a.text);
  return lines.join('\n') + '\n';
}

module.exports = { statusSnapshot, statusText };
