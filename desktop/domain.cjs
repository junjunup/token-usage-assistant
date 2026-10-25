// @ts-check
// T5.5: JSDoc types only. Upstream JSON and app state are deliberately `any` (validated at runtime here);
// derived numbers that may be missing are `number|null`, never coerced to 0.
/** @typedef {number|null} MaybeNumber */
/**
 * @typedef {object} QuotaWindow
 * @property {MaybeNumber} used
 * @property {MaybeNumber} cap
 * @property {MaybeNumber} usedPercent
 * @property {MaybeNumber} remainingPercent
 * @property {MaybeNumber} resetAt
 * @property {string} resetState
 * @property {boolean} unlimited
 * @property {boolean} exceeded
 */
/** @typedef {{ theme: string, refreshSeconds: number, threshold: number, notifications: boolean, floating: boolean, pinned: boolean, launchAtLogin: boolean, widgetExpanded: boolean, updateCheck: boolean, menubarForm: string, menubarUsage: boolean, menubarAlertColor: boolean, panelProtect: boolean }} Settings */
const ENDPOINTS = Object.freeze({
  identity: '/alpha/whoami',
  credits: '/alpha/billing/credits',
  subscription: '/alpha/billing/subscriptions',
  summary: '/alpha/usage/summary',
});
const DEFAULT_SETTINGS = Object.freeze({
  theme: 'light',
  refreshSeconds: 60,
  threshold: 20,
  notifications: true,
  floating: false,
  pinned: true,
  launchAtLogin: false,
  widgetExpanded: false,
  // T5.2: ask the public installer repository for newer versions (one GitHub request at start and every 24 h).
  updateCheck: true,
  // T7.7 (macOS menu bar): icon form ① ring / ② ring + value / ③ two lines; show usage (off = static logo);
  // alert colours; screen-capture protection for the popover panel.
  menubarForm: 'value',
  menubarUsage: true,
  menubarAlertColor: true,
  panelProtect: true,
});
/** @type {(v: any) => MaybeNumber} */
const finite = (v) =>
  (typeof v === 'number' || (typeof v === 'string' && v.trim() !== '')) && Number.isFinite(Number(v))
    ? Number(v)
    : null;
/** @type {(v: any) => MaybeNumber} */
const count = (v) => {
  const n = finite(v);
  return n !== null && n >= 0 ? n : null;
};
/** @type {(v: any, max?: number) => string} */
// eslint-disable-next-line no-control-regex -- intentionally rejects/strips control characters (input validation and privacy).
const text = (v, max = 160) => (typeof v === 'string' ? v.replace(/[\x00-\x1f]/g, '').slice(0, max) : '');
/**
 * @param {any} v
 * @returns {MaybeNumber}
 */
function timestamp(v) {
  if (v === null || v === undefined || v === '' || v === 0) return null;
  const n = finite(v);
  const ms = n === null ? Date.parse(v) : n < 100_000_000_000 ? n * 1000 : n;
  return Number.isFinite(ms) && ms > 0 && ms < 8.64e15 ? ms : null;
}
/** @param {any} v */
function unwrap(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v) || v.success === false) throw new Error('接口未返回可识别的数据');
  return Object.hasOwn(v, 'data') ? v.data : v;
}
/**
 * @param {any} v
 * @param {any} limited
 * @returns {QuotaWindow}
 */
function normalizeWindow(v, limited) {
  if (!v || typeof v !== 'object')
    return {
      used: null,
      cap: null,
      remainingPercent: null,
      usedPercent: null,
      resetAt: null,
      resetState: limited === false ? 'unlimited' : 'unknown',
      unlimited: limited === false,
      exceeded: false,
    };
  const used = count(v.used),
    cap = count(v.cap),
    available = used !== null && cap !== null && cap > 0;
  const usedPercent = available ? Math.min(100, Math.max(0, (used / cap) * 100)) : null;
  return {
    used,
    cap,
    usedPercent,
    remainingPercent: available ? 100 - /** @type {number} */ (usedPercent) : null,
    resetAt: timestamp(v.resetAt),
    resetState: timestamp(v.resetAt) ? 'scheduled' : v.resetAt === 0 || v.resetAt === '0' ? 'idle' : 'unknown',
    unlimited: limited === false && !available,
    exceeded: v.exceeded === true || (available && /** @type {number} */ (used) >= /** @type {number} */ (cap)),
  };
}
/** @param {any} raw */
function normalizeIdentity(raw) {
  const v = unwrap(raw);
  if (!v?.user?.id) throw new Error('账户身份字段缺失');
  return {
    accountId: text(v.user.id),
    label: text(v.org?.name || v.org?.login || v.user.userName || v.user.name || '个人账户'),
    orgId: text(v.org?.id, 128),
    scope: v.org?.id ? 'organization' : 'personal',
    login: text(v.org?.login || v.user.userName, 80),
  };
}
/** @param {any} raw */
function normalizeCredits(raw) {
  const v = unwrap(raw);
  if (!v || (!v.windowLimits && !v.credits)) throw new Error('额度字段缺失');
  const c = v.credits || {},
    w = v.windowLimits || {};
  const monthly = finite(c.monthlyCredits),
    purchased = finite(c.purchasedCredits),
    free = finite(c.freeCredits);
  return {
    five: normalizeWindow(w.fiveHour, w.limited),
    week: normalizeWindow(w.weekly, w.limited),
    monthly,
    purchased,
    free,
    total: [monthly, purchased, free].every((n) => n !== null)
      ? /** @type {number} */ (monthly) + /** @type {number} */ (purchased) + /** @type {number} */ (free)
      : null,
  };
}
/** @param {any} raw */
function normalizeSubscription(raw) {
  let v = unwrap(raw);
  if (v === null) return { active: false, status: 'none', planId: null, start: null, end: null };
  if (Array.isArray(v)) v = v.find((/** @type {any} */ s) => ['active', 'trialing'].includes(s.status)) || v[0];
  if (!v || (!v.planId && !v.status && !v.currentPeriodStart)) throw new Error('套餐字段缺失');
  return {
    active: ['active', 'trialing'].includes(v.status),
    status: text(v.status),
    planId: text(v.planId) || null,
    start: timestamp(v.currentPeriodStart),
    end: timestamp(v.currentPeriodEnd),
  };
}
/**
 * @param {any} raw
 * @param {MaybeNumber} [periodStart]
 * @param {MaybeNumber} [periodEnd]
 */
function normalizeSummary(raw, periodStart = null, periodEnd = null) {
  const v = unwrap(raw);
  if (
    !v ||
    !['totalTokens', 'totalTokensIn', 'totalTokensOut', 'totalCount', 'totalCost'].some((k) => count(v[k]) !== null)
  )
    throw new Error('汇总字段缺失');
  const input = count(v.totalTokensIn),
    output = count(v.totalTokensOut);
  const requests = count(v.totalCount),
    cost = count(v.totalCost),
    completed = count(v.completedCount),
    failed = count(v.failedCount);
  const total = count(v.totalTokens) ?? (input !== null && output !== null ? input + output : null);
  // Derive the rate from counts: the undocumented successRate field has ambiguous units.
  // `requests > 0` is false for null, so a missing count never becomes a rate or an average.
  const successRate =
    completed !== null && /** @type {number} */ (requests) > 0 && completed <= /** @type {number} */ (requests)
      ? (completed / /** @type {number} */ (requests)) * 100
      : null;
  return {
    input,
    output,
    total,
    requests,
    cost,
    completed,
    failed,
    successRate,
    averageCost:
      cost !== null && /** @type {number} */ (requests) > 0
        ? cost / /** @type {number} */ (requests)
        : count(v.averageCost),
    averageTokens:
      total !== null && /** @type {number} */ (requests) > 0 ? total / /** @type {number} */ (requests) : null,
    funding: {
      monthly: count(v.totalMonthlyCredits),
      purchased: count(v.totalPurchasedCredits),
      free: count(v.totalFreeCredits),
      total: count(v.totalCredits),
    },
    periodBasis: text(v.periodBasis),
    periodStart,
    periodEnd,
    scope: periodStart ? 'billing' : 'history',
  };
}
// A monthly pool can only be derived from matching, freshly synchronized billing data.
/** @param {any} data app monitor state */
function monthlyQuota(data) {
  const c = data?.parts?.credits,
    s = data?.parts?.summary,
    sub = data?.parts?.subscription,
    remaining = finite(c?.monthly);
  const samePeriod = !!sub?.start && s?.scope === 'billing' && s.periodStart === sub.start;
  const sameSample = !!data?.updatedAt?.credits && data.updatedAt.credits === data.updatedAt.summary;
  const spent = samePeriod && sameSample ? count(s?.funding?.monthly) : null;
  const pool = remaining !== null && spent !== null && remaining + spent > 0 ? remaining + spent : null;
  return {
    remaining,
    spent,
    pool,
    // @ts-expect-error -- `remaining` is never null when `pool` is not (pool is derived from it).
    remainingPercent: pool === null ? null : Math.min(100, Math.max(0, (remaining / pool) * 100)),
    resetAt: sub?.end || null,
    applicable: sub?.active === true,
    derived: pool !== null,
  };
}
/** @param {any} state app state */
function quotaStatus(state) {
  const d = state.data,
    c = d.parts.credits;
  if (!state.hasCredential) return ['未连接账户', 'neutral'];
  if (d.status === 'auth-error') return ['需要重新连接', 'amber'];
  if (d.status === 'offline') return ['连接已中断', 'amber'];
  if (d.status === 'partial') return ['部分数据未更新', 'amber'];
  if (d.status === 'stale') return ['等待同步', 'neutral'];
  if (state.capabilities?.balance && !state.capabilities?.quota) {
    const balance = d.parts.balance;
    if (!balance) return ['余额数据暂缺', 'neutral'];
    if (!balance.balances.length) return ['余额条目暂未返回', 'neutral'];
    return balance.isAvailable ? ['有可用余额', 'green'] : ['当前余额不可用于调用', 'amber'];
  }
  if (!c) return ['额度数据暂缺', 'neutral'];
  if (Array.isArray(c.windows)) {
    const windows = c.windows.filter((/** @type {any} */ w) => w.applicable !== false);
    if (!windows.length) return ['当前套餐无可用额度池', 'neutral'];
    if (windows.some((/** @type {any} */ w) => w.exceeded)) return ['部分额度已达上限', 'red'];
    if (
      windows.some(
        (/** @type {any} */ w) =>
          typeof w.remainingPercent === 'number' && w.remainingPercent < state.settings.threshold,
      )
    )
      return ['额度偏低', 'amber'];
    if (windows.every((/** @type {any} */ w) => w.unlimited || typeof w.remainingPercent === 'number'))
      return ['额度充足', 'green'];
    return ['部分额度暂不可获取', 'neutral'];
  }
  if (c.monthly !== null && c.monthly <= 0) {
    if (c.purchased > 0) return ['月额度已用尽 · 有购买余额', 'amber'];
    if (c.free > 0) return ['月额度已用尽 · 有免费余额', 'amber'];
    if (c.purchased === 0 && c.free === 0) return ['可用余额已用尽', 'red'];
    return ['月额度已用尽', 'red'];
  }
  if (c.five?.exceeded || c.week?.exceeded)
    return [c.purchased > 0 ? '窗口已达上限 · 有购买余额' : '已达窗口上限', c.purchased > 0 ? 'amber' : 'red'];
  const month = monthlyQuota(d);
  if (
    [c.five?.remainingPercent, c.week?.remainingPercent, month.remainingPercent].some(
      (v) => typeof v === 'number' && v < state.settings.threshold,
    )
  )
    return ['额度偏低', 'amber'];
  if (typeof c.monthly !== 'number') return ['月额度待同步', 'neutral'];
  if ([c.five, c.week].every((w) => w && (typeof w.remainingPercent === 'number' || w.unlimited)))
    return ['额度充足', 'green'];
  return ['额度数据暂缺', 'neutral'];
}
/**
 * Remaining percentage for text: below 0.5% but above zero is "<1%", never a rounded "0%" (T7.4, T9.3 L3).
 * @param {number|null|undefined} p
 */
function percentText(p) {
  return typeof p !== 'number' || !Number.isFinite(p) ? '—' : p > 0 && p < 0.5 ? '<1%' : Math.round(p) + '%';
}
/**
 * @param {any} window
 * @param {number} [now]
 */
function resetDescription(window, now = Date.now()) {
  if (window?.unlimited) return '当前不设窗口限制';
  if (window?.resetState === 'unconfirmed') return '已用不足 1% · 窗口起点待确认';
  const at = window?.resetAt;
  // T9.3 (L2): resetAt=0 is "未启用" on every surface, also when usage is already reported; only a missing field
  // reads as missing data.
  if (window?.resetState === 'idle')
    return window?.used === 0 ? '未启用 · 首次使用后开始计时' : '未启用 · 计时起点待平台返回';
  if (!at) return '重置时间暂未返回';
  const seconds = Math.ceil((at - now) / 1000);
  if (seconds <= 0) return '本窗口已到期 · 等待用量同步';
  const days = Math.floor(seconds / 86400),
    hours = Math.floor((seconds % 86400) / 3600);
  return days
    ? `${days} 天 ${hours} 小时后重置`
    : [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
        .map((v) => String(v).padStart(2, '0'))
        .join(':') + ' 后重置';
}
/**
 * @param {any} value Retry-After header value
 * @param {number} [now]
 */
function retryAfter(value, now = Date.now()) {
  if (!value) return 0;
  const n = finite(value);
  return n !== null ? Math.max(0, n * 1000) : Math.max(0, (timestamp(value) || now) - now);
}
/**
 * @param {Array<{ status?: number, retryAfterMs?: number }>} errors
 * @param {number} failures
 * @param {number} intervalSeconds
 * @returns {number|null}
 */
function nextDelay(errors, failures, intervalSeconds) {
  if (errors.some((e) => e.status === 401 || e.status === 403)) return null;
  if (!errors.length) return intervalSeconds * 1000;
  return Math.max(
    intervalSeconds * 1000,
    Math.min(300000, 30000 * 2 ** Math.min(failures - 1, 4)),
    ...errors.map((e) => e.retryAfterMs || 0),
  );
}
/**
 * @param {Settings} current
 * @param {any} patch
 * @returns {Settings}
 */
function patchSettings(current, patch) {
  const result = /** @type {Record<string, any>} */ ({ ...current });
  if (!patch || typeof patch !== 'object') throw new Error('设置格式不正确');
  for (const [key, value] of Object.entries(patch)) {
    if (!Object.hasOwn(DEFAULT_SETTINGS, key)) throw new Error('不支持的设置');
    if (key === 'theme' && ['light', 'dark'].includes(value)) result[key] = value;
    else if (key === 'refreshSeconds' && [30, 60, 120, 300].includes(value)) result[key] = value;
    else if (key === 'threshold' && [10, 20, 30].includes(value)) result[key] = value;
    else if (key === 'menubarForm' && ['ring', 'value', 'two'].includes(value)) result[key] = value;
    else if (
      typeof (/** @type {Record<string, any>} */ (DEFAULT_SETTINGS)[key]) === 'boolean' &&
      typeof value === 'boolean'
    )
      result[key] = value;
    else throw new Error('设置值不正确');
  }
  return /** @type {Settings} */ (result);
}
class AlertTracker {
  /** @param {Record<string, number>} [saved] */
  constructor(saved = {}) {
    /** @type {Record<string, number>} */
    this.levels = { ...saved };
  }
  /**
   * @param {any} credits
   * @param {Settings} settings
   * @param {any} [monthly] monthlyQuota() result
   */
  check(credits, settings, monthly = null) {
    /** @type {any[]} */
    const alerts = [];
    if (Array.isArray(credits?.windows)) {
      for (const w of credits.windows) {
        if (w.applicable === false || w.unlimited) {
          delete this.levels[w.id];
          continue;
        }
        if (typeof w.remainingPercent !== 'number' && !w.exceeded) continue;
        const level = w.exceeded ? 2 : w.remainingPercent < settings.threshold ? 1 : 0;
        if (settings.notifications && level > (this.levels[w.id] ?? 0))
          alerts.push({
            key: w.id,
            label: [w.group, w.label].filter(Boolean).join(' · '),
            level,
            remaining: w.remainingPercent,
            resetAt: w.resetAt,
          });
        this.levels[w.id] = level;
      }
      return alerts;
    }
    for (const key of ['five', 'week']) {
      const w = credits?.[key];
      if (!w || w.remainingPercent === null) continue;
      const level = w.exceeded ? 2 : w.remainingPercent < settings.threshold ? 1 : 0;
      if (settings.notifications && level > (this.levels[key] ?? 0))
        alerts.push({ key, level, remaining: w.remainingPercent, resetAt: w.resetAt });
      this.levels[key] = level;
    }
    if (monthly?.applicable && monthly.remaining !== null) {
      const level =
        monthly.remaining <= 0
          ? 2
          : monthly.remainingPercent !== null && monthly.remainingPercent < settings.threshold
            ? 1
            : 0;
      if (settings.notifications && level > (this.levels.monthly ?? 0))
        alerts.push({
          key: 'monthly',
          level,
          remaining: monthly.remainingPercent,
          resetAt: monthly.resetAt,
          hasPurchased: credits?.purchased > 0,
          hasFree: credits?.free > 0,
        });
      this.levels.monthly = level;
    }
    return alerts;
  }
}
module.exports = {
  ENDPOINTS,
  DEFAULT_SETTINGS,
  finite,
  count,
  text,
  timestamp,
  normalizeWindow,
  normalizeIdentity,
  normalizeCredits,
  normalizeSubscription,
  normalizeSummary,
  monthlyQuota,
  quotaStatus,
  resetDescription,
  percentText,
  retryAfter,
  nextDelay,
  patchSettings,
  AlertTracker,
};
