// @ts-check
// All-accounts view (T11.1, D17): every account in one list, most urgent first, for the overview grid and the
// floating widget. Pure: no Electron, no I/O. Also generated into src/generated/ for the browser preview.
// - Ranking and the value shown per account are the menu-bar icon's own rule (T7.9 / T7.11), never re-implemented
//   in the UI: quota windows first, money only as the fallback or when its alert is more severe.
// - Each account stands alone: nothing is added across accounts or currencies, and missing stays "—".
// - An account whose last refresh failed keeps its last successful values, marked stale with their time.
const { rankAccounts } = require('./menubar-status.cjs');

/**
 * @typedef {import('./menubar-status.cjs').AccountSummary} AccountSummary
 * @typedef {import('./menubar-status.cjs').Tone} Tone
 * @typedef {{ kind: 'window'|'balance', id: string, label: string, text: string, percent: number|null, tone: Tone,
 *   resetAt: number|null, window: import('./menubar-status.cjs').WindowInfo|null }} OverviewFocus
 * @typedef {{ id: string, label: string, provider: string, active: boolean, status: string, stale: boolean,
 *   synced: boolean, updatedAt: number|null, tone: Tone, focus: OverviewFocus|null }} OverviewRow
 * @typedef {{ threshold: number, attention: number, rows: OverviewRow[] }} AccountOverview
 */

const STALE = ['stale', 'offline', 'auth-error', 'partial'];

/**
 * @param {AccountSummary[]} accounts
 * @param {{ threshold: number }} settings
 * @returns {AccountOverview}
 */
function accountOverview(accounts, settings) {
  const threshold = typeof settings?.threshold === 'number' ? settings.threshold : 20;
  const rows = rankAccounts(accounts, threshold).map(({ a, focus }) => {
    const stamps = Object.values(a.updatedAt || {}).filter((v) => typeof v === 'number' && v > 0);
    return {
      id: a.id,
      label: a.label,
      provider: a.provider,
      active: !!a.active,
      status: String(a.status || ''),
      stale: STALE.includes(String(a.status || '')),
      // Never synced: there are no earlier values to fall back on.
      synced: stamps.length > 0,
      updatedAt: stamps.length ? Math.max(...stamps) : null,
      tone: focus ? focus.tone : /** @type {Tone} */ ('normal'),
      focus: focus
        ? {
            kind: focus.kind,
            id: focus.id,
            label: focus.label,
            // Compact place (D17 ④): money at two decimals; the account's details keep every digit.
            text: focus.compact,
            percent: focus.percent,
            tone: focus.tone,
            resetAt: focus.resetAt,
            window: focus.window || null,
          }
        : null,
    };
  });
  return { threshold, attention: rows.filter((r) => r.tone !== 'normal').length, rows };
}

module.exports = { accountOverview };
