// @ts-check
// Menu-bar status (T7.4): decide which account and window the menu-bar icon shows, and what it says.
// Pure: no Electron, no I/O. Rules: docs/island-1.9.0-design/HANDOFF.md §3.2.
// - Alert levels follow the app's existing rule (domain.cjs AlertTracker / quotaStatus): exhausted or a monthly
//   balance at or below zero is red, below the reminder threshold is amber.
// - Missing data is "—", never 0; resetAt=0 is "未启用"; balances keep their own currency and are never a gauge.
// - Within an account, quota windows come first and money is the fallback (T7.9, see focusOf).
const { monthlyQuota } = require('./domain.cjs');
const { formatAmount } = require('./balance-domain.cjs');

/**
 * @typedef {'normal'|'amber'|'red'} Tone
 * @typedef {{ id: string, label: string, short: string, kind: 'window'|'balance', ratio: number|null,
 *   percent: number|null, text: string, tone: Tone, resetAt: number|null, window?: WindowInfo }} Slot
 * @typedef {{ resetAt: number|null, resetState: string, used: number|null, unlimited: boolean, exceeded: boolean }}
 *   WindowInfo the raw fields resetDescription() needs (T7.6 panel)
 * @typedef {{ id: string, label: string, provider: string, active: boolean,
 *   capabilities?: { quota?: boolean, balance?: boolean } | null,
 *   status?: string, parts?: any, updatedAt?: any }} AccountSummary
 * @typedef {{ accountId: string, accountLabel: string, windowId: string, windowLabel: string,
 *   ring: number|null, text: string, tone: Tone, lines: { label: string, text: string, tone: Tone }[],
 *   stale: boolean }} MenubarStatus
 */

const LEVEL = { normal: 0, amber: 1, red: 2 };
const STALE = ['stale', 'offline', 'auth-error', 'partial'];
const SYMBOL = /** @type {Record<string, string>} */ ({ CNY: '¥', USD: '$' });

/** @param {number|null} p @returns {string} */
const percentText = (p) => (p === null ? '—' : p > 0 && p < 0.5 ? '<1%' : Math.round(p) + '%');

/**
 * Short label for the two-line form. Platforms name their windows differently; unknown names keep two characters.
 * @param {string} label
 */
function shortLabel(label) {
  const hours = /^(\d+) 小时窗口$/.exec(label);
  if (hours) return hours[1] + 'h';
  const days = /^(\d+) 天窗口$/.exec(label);
  if (days) return days[1] + 'd';
  const known = /** @type {Record<string, string>} */ ({
    每周窗口: '周',
    每周额度: '周',
    本周额度: '周',
    周窗口: '周',
    近一周窗口: '周',
    近一天窗口: '日',
    本账期额度: '月',
    月窗口: '月',
    近一月窗口: '月',
    月度余额: '月',
    当前窗口: '窗口',
    工具月额度: '工具',
  });
  return known[label] || label.slice(0, 2);
}

/**
 * One quota window (Command Code five/week, or a provider-domain quota()).
 * @param {string} id
 * @param {string} label
 * @param {any} w
 * @param {number} threshold
 * @returns {Slot|null}
 */
function windowSlot(id, label, w, threshold) {
  if (!w || w.applicable === false) return null;
  /** @type {WindowInfo} */
  const info = {
    resetAt: typeof w.resetAt === 'number' ? w.resetAt : null,
    resetState: typeof w.resetState === 'string' ? w.resetState : 'unknown',
    used: typeof w.used === 'number' ? w.used : null,
    unlimited: !!w.unlimited,
    exceeded: !!w.exceeded,
  };
  const base = { id, label, short: shortLabel(label), kind: /** @type {'window'} */ ('window'), window: info };
  if (w.unlimited) return { ...base, ratio: null, percent: null, text: '不限', tone: 'normal', resetAt: null };
  const p = typeof w.remainingPercent === 'number' && Number.isFinite(w.remainingPercent) ? w.remainingPercent : null;
  const tone = w.exceeded ? 'red' : p !== null && p < threshold ? 'amber' : 'normal';
  // resetAt=0: the window is explicitly not running; never invent a countdown or a gauge for it.
  if (w.resetState === 'idle' && !w.exceeded)
    return { ...base, ratio: null, percent: null, text: '未启用', tone: 'normal', resetAt: null };
  return {
    ...base,
    ratio: p === null ? null : Math.max(0, Math.min(1, p / 100)),
    percent: p,
    text: percentText(p),
    tone,
    resetAt: typeof w.resetAt === 'number' && w.resetAt > 0 ? w.resetAt : null,
  };
}

/**
 * All slots of one account, in the order the platform reports them.
 * @param {AccountSummary} a
 * @param {number} threshold
 * @returns {Slot[]}
 */
function slotsOf(a, threshold) {
  const parts = a.parts || {};
  /** @type {Slot[]} */
  const slots = [];
  const balanceOnly = !!a.capabilities?.balance && !a.capabilities?.quota;
  if (balanceOnly) {
    const b = parts.balance;
    for (const row of Array.isArray(b?.balances) ? b.balances : []) {
      const amount = formatAmount(row.total);
      slots.push({
        id: 'balance:' + row.currency,
        label: row.currency + ' 余额',
        short: '余额',
        kind: 'balance',
        ratio: null,
        percent: null,
        text: amount === '—' ? '—' : (SYMBOL[row.currency] || row.currency + ' ') + amount,
        // The platform's own availability flag; balance thresholds come after the first version (③).
        tone: b.isAvailable === false ? 'amber' : 'normal',
        resetAt: null,
      });
    }
    return slots;
  }
  const c = parts.credits;
  if (!c) return slots;
  if (Array.isArray(c.windows)) {
    for (const w of c.windows) {
      const s = windowSlot(String(w.id), String(w.label || ''), w, threshold);
      if (s) slots.push(s);
    }
    return slots;
  }
  for (const [key, label] of [
    ['five', '5 小时窗口'],
    ['week', '每周窗口'],
  ]) {
    const s = windowSlot(key, label, c[key], threshold);
    if (s) slots.push(s);
  }
  // Command Code monthly credits: a USD amount; exhausted is red, a derived share below the threshold is amber.
  if (typeof c.monthly === 'number' && Number.isFinite(c.monthly)) {
    const m = monthlyQuota({ parts, updatedAt: a.updatedAt || {} });
    const p = m.remainingPercent;
    slots.push({
      id: 'monthly',
      label: '月度余额',
      short: '月',
      kind: 'balance',
      ratio: p === null ? null : Math.max(0, Math.min(1, p / 100)),
      percent: p,
      text: '$' + c.monthly.toFixed(2),
      tone: c.monthly <= 0 ? 'red' : p !== null && p < threshold ? 'amber' : 'normal',
      resetAt: m.resetAt,
    });
  }
  return slots;
}

/** Compare with unknowns (Infinity) last; equal unknowns compare equal instead of NaN. */
const cmp = (/** @type {number} */ x, /** @type {number} */ y) => (x === y ? 0 : x - y);

/** @param {Slot} a @param {Slot} b sort most urgent first */
function urgency(a, b) {
  const byReset = cmp(a.resetAt ?? Infinity, b.resetAt ?? Infinity),
    byLeft = cmp(a.percent ?? Infinity, b.percent ?? Infinity);
  // Alerting: the window that resets first (④). Otherwise: the window with the least left. Unknowns go last.
  return LEVEL[b.tone] - LEVEL[a.tone] || (LEVEL[a.tone] > 0 ? byReset || byLeft : byLeft || byReset);
}

/**
 * The slot the icon shows for one account (T7.9): quota windows first, money only as the fallback. A balance takes
 * over only when it alerts more severely than the chosen window, so an exhausted balance never reads as plenty left.
 * @param {Slot[]} slots
 * @returns {Slot|null}
 */
function focusOf(slots) {
  const sorted = [...slots].sort(urgency);
  // A usable window has a share left, or is alerting (exhausted). Idle / unlimited / missing windows do not count.
  const top = sorted.find((s) => s.kind === 'window' && (s.percent !== null || s.tone !== 'normal'));
  const balance = sorted.find((s) => s.kind === 'balance');
  if (!top) return balance || sorted[0] || null;
  return balance && LEVEL[balance.tone] > LEVEL[top.tone] ? balance : top;
}

/**
 * @param {AccountSummary[]} accounts
 * @param {{ threshold: number }} settings
 * @returns {MenubarStatus|null} null when there is nothing to show (no accounts): the icon stays the static logo.
 */
function menubarStatus(accounts, settings) {
  if (!Array.isArray(accounts) || !accounts.length) return null;
  const threshold = typeof settings?.threshold === 'number' ? settings.threshold : 20;
  const ranked = accounts.map((a, order) => {
    const slots = slotsOf(a, threshold);
    const focus = focusOf(slots);
    return { a, order, slots, focus };
  });
  const level = (/** @type {typeof ranked[number]} */ r) => (r.focus ? LEVEL[r.focus.tone] : 0);
  const windowLeft = (/** @type {typeof ranked[number]} */ r) =>
    r.slots
      .filter((s) => s.kind === 'window' && s.percent !== null)
      .reduce((m, s) => Math.min(m, s.percent ?? m), Infinity);
  const pick = [...ranked].sort(
    (x, y) =>
      // Alerts first: red over amber, then the one that resets first (④).
      level(y) - level(x) ||
      (level(x) > 0 ? cmp(x.focus?.resetAt ?? Infinity, y.focus?.resetAt ?? Infinity) : 0) ||
      // No alert: the window with the least left.
      cmp(windowLeft(x), windowLeft(y)) ||
      // Otherwise the current account, then list order.
      Number(y.a.active) - Number(x.a.active) ||
      x.order - y.order,
  )[0];
  const { a, slots, focus } = pick;
  const stale = STALE.includes(String(a.status || ''));
  if (!focus)
    return {
      accountId: a.id,
      accountLabel: a.label,
      windowId: '',
      windowLabel: '',
      ring: null,
      text: '—',
      tone: 'normal',
      lines: [{ label: '—', text: '—', tone: 'normal' }],
      stale,
    };
  // Two-line form: the platform's first two slots, with the focus slot always included.
  let shown = slots.slice(0, 2);
  if (!shown.includes(focus)) shown = [shown[0], focus];
  return {
    accountId: a.id,
    accountLabel: a.label,
    windowId: focus.id,
    windowLabel: focus.label,
    ring: focus.kind === 'window' || focus.id === 'monthly' ? focus.ratio : null,
    text: focus.text,
    tone: focus.tone,
    lines: shown.map((s) => ({ label: s.short, text: s.text, tone: s.tone })),
    stale,
  };
}

module.exports = { menubarStatus, slotsOf, shortLabel, focusOf };
