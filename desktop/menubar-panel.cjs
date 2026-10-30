// @ts-check
// Menu-bar panel view model (T7.6): what the popover panel shows for every account. Pure: no Electron, no I/O.
// Also generated into src/generated/ for the browser preview (scripts/prepare-analytics-preview.mjs).
// Decisions (IMPROVEMENT_PLAN T7.3–T7.8, 2026-10-18):
// - The three cells only show what the account's own interface returns (Token / cost / balance); local tool
//   statistics are never shown here (tool records belong to no account by default). Missing is "—" with a reason.
// - Switching accounts inside the panel is local to the panel; it opens on the account the menu-bar icon shows.
// T11.3 (D17): cells the platform does not provide are folded; the window the chip stands for is always listed; chip
// amounts are compact (two decimals, D17 ④); Command Code gets a one-line pace summary of the existing forecast.
const { menubarStatus, slotsOf, focusOf } = require('./menubar-status.cjs');
const { formatAmount } = require('./balance-domain.cjs');

/**
 * @typedef {import('./menubar-status.cjs').AccountSummary} AccountSummary
 * @typedef {import('./menubar-status.cjs').Tone} Tone
 * @typedef {{ value: string, unit: string, note: string, tone: Tone }} Cell
 * @typedef {{ id: string, label: string, percent: number|null, text: string, tone: Tone,
 *   window: import('./menubar-status.cjs').WindowInfo|null }} Row
 * @typedef {{ id: string, label: string, provider: string, stale: boolean, notice: string|null, status: string,
 *   chip: { text: string, tone: Tone }, rows: Row[], more: number,
 *   balances: { currency: string, text: string }[], available: boolean|null,
 *   cells: { tokens: Cell, cost: Cell, balance: Cell }, shownCells: ('tokens'|'cost'|'balance')[],
 *   pace: Pace|null, updatedAt: number|null }} PanelAccount
 * @typedef {{ tone: 'normal'|'amber'|'red', text: string, reason: string|null }} Pace text "—" with a reason when
 *   the forecast cannot say anything
 * @typedef {{ defaultAccountId: string|null, threshold: number, accounts: PanelAccount[] }} PanelState
 */

const ROWS = 3;
const SYMBOL = /** @type {Record<string, string>} */ ({ CNY: '¥', USD: '$' });
const STALE = ['stale', 'offline', 'auth-error', 'partial'];

/** @param {any} v */
const finiteNumber = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** @param {number} m minutes */
const duration = (m) => {
  const n = Math.ceil(m);
  return n >= 60 ? Math.floor(n / 60) + ' 小时 ' + (n % 60) + ' 分钟' : n + ' 分钟';
};
const WINDOW_NAME = /** @type {Record<string, string>} */ ({ five: '5 小时窗口', week: '每周窗口' });

/**
 * One line from the analytics forecast (analytics-core.cjs forecast(), the "PACE & FORECAST" section): the most
 * urgent window's outlook. No new prediction: unknown stays "—" with the forecast's own reason; the estimate always
 * says which recent span it is based on, and never invents a countdown (T11.3, D17).
 * @param {any} p forecast() result, or null when the account has none
 * @returns {Pace|null}
 */
function paceLine(p) {
  if (!p) return null;
  if (!p.available) return { tone: 'normal', text: '—', reason: String(p.reason || '账户采样不足') };
  /** @type {{ key: string, status: string, minutesToCap?: number|null }[]} */
  const windows = Array.isArray(p.windows) ? p.windows : [];
  const span = '按最近 ' + Math.round(p.minutes) + ' 分钟的速度，';
  const atLimit = windows.find((w) => w.status === 'at-limit');
  if (atLimit) return { tone: 'red', text: (WINDOW_NAME[atLimit.key] || '窗口') + '已达上限', reason: null };
  const soon = windows
    .filter((w) => w.status === 'before-reset' && typeof w.minutesToCap === 'number')
    .sort((x, y) => Number(x.minutesToCap) - Number(y.minutesToCap))[0];
  if (soon)
    return {
      tone: 'amber',
      text:
        span + (WINDOW_NAME[soon.key] || '窗口') + '约 ' + duration(Number(soon.minutesToCap)) + '后触顶（早于重置）',
      reason: null,
    };
  const known = windows.filter((w) => w.status === 'after-reset' || w.status === 'idle');
  if (!known.length) return { tone: 'normal', text: '—', reason: '窗口的连续样本不足' };
  if (known.every((w) => w.status === 'idle')) return { tone: 'normal', text: '近期未新增消耗', reason: null };
  return { tone: 'normal', text: span + '重置前不会触顶', reason: null };
}

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
  // The chip says what the menu-bar icon would say for this account (T7.11, same rule as T7.9).
  const focus = focusOf(slots);
  // Up to three windows in the platform's order; the most urgent one (the one the chip stands for when it is a
  // window, by the same rule) is always shown (T11.3: it could hide behind "还有 N 个窗口" before).
  let shown = windows.slice(0, ROWS);
  const urgent = focusOf(windows);
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
  if (monthly) balance = { value: monthly.compact, unit: '月度余额', note: '账户接口', tone: monthly.tone };
  const cells = { tokens: summary.tokens, cost: summary.cost, balance };
  const stamps = Object.values(a.updatedAt || {}).filter((v) => typeof v === 'number' && v > 0);
  const stale = STALE.includes(String(a.status || ''));
  return {
    id: a.id,
    label: a.label,
    provider: a.provider,
    status: String(a.status || ''),
    stale,
    // T7.10: an account that never synced has no earlier values to fall back on.
    notice: !stale ? null : stamps.length ? '数据未更新，显示的是上次成功的值。' : '尚未同步成功，暂无数据。',
    // Compact place (D17 ④): money at two decimals or "<0.01"; the rows and cells keep every digit.
    chip: focus ? { text: focus.compact, tone: focus.tone } : { text: '—', tone: 'normal' },
    rows,
    more: Math.max(0, windows.length - rows.length),
    balances,
    available: balanceOnly
      ? typeof parts.balance?.isAvailable === 'boolean'
        ? parts.balance.isAvailable
        : null
      : null,
    cells,
    // Cells the platform does not provide are folded, not shown as empty boxes (T11.3).
    shownCells: /** @type {('tokens'|'cost'|'balance')[]} */ (['tokens', 'cost', 'balance']).filter(
      (k) => cells[k].note !== '平台未提供',
    ),
    pace: a.provider === 'commandcode' ? paceLine(a.prediction ?? null) : null,
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

module.exports = { panelState, panelAccount, summaryCells, compact, paceLine };
