// @ts-check
// Menu-bar panel view model (T7.6): what the popover panel shows for every account. Pure: no Electron, no I/O.
// Also generated into src/generated/ for the browser preview (scripts/prepare-analytics-preview.mjs).
// Decisions (IMPROVEMENT_PLAN T7.3–T7.8, 2026-10-18):
// - The three cells only show what the account's own interface returns (Token / cost / balance); local tool
//   statistics are never shown here (tool records belong to no account by default). Missing is "—" with a reason.
// - Switching accounts inside the panel is local to the panel; it opens on the account the menu-bar icon shows.
const { menubarStatus, slotsOf } = require('./menubar-status.cjs');
const { formatAmount } = require('./balance-domain.cjs');

/**
 * @typedef {import('./menubar-status.cjs').AccountSummary} AccountSummary
 * @typedef {import('./menubar-status.cjs').Tone} Tone
 * @typedef {{ value: string, unit: string, note: string, tone: Tone }} Cell
 * @typedef {{ id: string, label: string, percent: number|null, text: string, tone: Tone,
 *   window: import('./menubar-status.cjs').WindowInfo|null }} Row
 * @typedef {{ id: string, label: string, provider: string, stale: boolean, status: string,
 *   chip: { text: string, tone: Tone }, rows: Row[], more: number,
 *   balances: { currency: string, text: string }[], available: boolean|null,
 *   cells: { tokens: Cell, cost: Cell, balance: Cell }, updatedAt: number|null }} PanelAccount
 * @typedef {{ defaultAccountId: string|null, threshold: number, accounts: PanelAccount[] }} PanelState
 */

const ROWS = 3;
const SYMBOL = /** @type {Record<string, string>} */ ({ CNY: '¥', USD: '$' });
const STALE = ['stale', 'offline', 'auth-error', 'partial'];
const LEVEL = { normal: 0, amber: 1, red: 2 };

/** @param {any} v */
const finiteNumber = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** @param {number} v */
function compact(v) {
  const abs = Math.abs(v);
  const [div, suffix] = abs >= 1e9 ? [1e9, 'B'] : abs >= 1e6 ? [1e6, 'M'] : abs >= 1e3 ? [1e3, 'K'] : [1, ''];
  const n = v / div;
  return (suffix ? n.toFixed(n >= 100 ? 0 : n >= 10 ? 1 : 2).replace(/\.?0+$/, '') : String(Math.round(n))) + suffix;
}

/**
 * The account's own usage summary (Command Code today): scope is the billing period or the whole history.
 * @param {any} summary
 * @returns {{ tokens: Cell, cost: Cell }}
 */
function summaryCells(summary) {
  const tokens = finiteNumber(summary?.total),
    cost = finiteNumber(summary?.cost);
  const scope = summary?.scope === 'billing' ? '本账期' : summary?.scope === 'history' ? '累计' : '';
  const missing = (/** @type {string} */ unit) => ({
    value: '—',
    unit,
    note: '平台未提供',
    tone: /** @type {Tone} */ ('normal'),
  });
  return {
    tokens:
      tokens === null
        ? missing('Token')
        : { value: compact(tokens), unit: scope + ' Token', note: '账户接口', tone: 'normal' },
    cost:
      cost === null
        ? missing('费用')
        : { value: '$' + cost.toFixed(2), unit: scope + '费用', note: '平台返回', tone: 'normal' },
  };
}

/**
 * @param {AccountSummary} a
 * @param {number} threshold
 * @returns {PanelAccount}
 */
function panelAccount(a, threshold) {
  const parts = a.parts || {};
  const slots = slotsOf(a, threshold);
  const windows = slots.filter((s) => s.kind === 'window');
  const focus = [...slots].sort(
    (x, y) => LEVEL[y.tone] - LEVEL[x.tone] || (x.percent ?? Infinity) - (y.percent ?? Infinity) || 0,
  )[0];
  // Up to three windows in the platform's order; the most urgent one is always shown.
  let shown = windows.slice(0, ROWS);
  const urgent = [...windows].sort((x, y) => LEVEL[y.tone] - LEVEL[x.tone])[0];
  if (urgent && !shown.includes(urgent)) shown = [...shown.slice(0, ROWS - 1), urgent];
  const balanceOnly = !!a.capabilities?.balance && !a.capabilities?.quota;
  const rows = shown.map((s) => ({
    id: s.id,
    label: s.label,
    percent: s.percent,
    text: s.text,
    tone: s.tone,
    window: s.window || null,
  }));
  const balances = balanceOnly
    ? (Array.isArray(parts.balance?.balances) ? parts.balance.balances : []).map((/** @type {any} */ b) => {
        const amount = formatAmount(b.total);
        return {
          currency: String(b.currency),
          text: amount === '—' ? '—' : (SYMBOL[b.currency] || b.currency + ' ') + amount,
        };
      })
    : [];
  const summary = summaryCells(parts.summary);
  /** @type {Cell} */
  let balance = { value: '—', unit: '余额', note: '平台未提供', tone: 'normal' };
  if (balanceOnly && balances.length)
    balance = {
      value: balances[0].text,
      unit: balances.length > 1 ? '余额（另有 ' + (balances.length - 1) + ' 种币种）' : '余额',
      note: '账户接口',
      tone: parts.balance?.isAvailable === false ? 'amber' : 'normal',
    };
  const monthly = slots.find((s) => s.id === 'monthly');
  if (monthly) balance = { value: monthly.text, unit: '月度余额', note: '账户接口', tone: monthly.tone };
  const stamps = Object.values(a.updatedAt || {}).filter((v) => typeof v === 'number' && v > 0);
  return {
    id: a.id,
    label: a.label,
    provider: a.provider,
    status: String(a.status || ''),
    stale: STALE.includes(String(a.status || '')),
    chip: focus ? { text: focus.text, tone: focus.tone } : { text: '—', tone: 'normal' },
    rows,
    more: Math.max(0, windows.length - rows.length),
    balances,
    available: balanceOnly
      ? typeof parts.balance?.isAvailable === 'boolean'
        ? parts.balance.isAvailable
        : null
      : null,
    cells: { tokens: summary.tokens, cost: summary.cost, balance },
    updatedAt: stamps.length ? Math.max(...stamps) : null,
  };
}

/**
 * @param {AccountSummary[]} accounts
 * @param {{ threshold: number }} settings
 * @returns {PanelState}
 */
function panelState(accounts, settings) {
  const threshold = typeof settings?.threshold === 'number' ? settings.threshold : 20;
  const list = Array.isArray(accounts) ? accounts : [];
  return {
    defaultAccountId: menubarStatus(list, { threshold })?.accountId ?? null,
    threshold,
    accounts: list.map((a) => panelAccount(a, threshold)),
  };
}

module.exports = { panelState, panelAccount, summaryCells, compact };
