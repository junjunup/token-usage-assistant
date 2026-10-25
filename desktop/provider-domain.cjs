// @ts-check
const { count, finite, text, timestamp } = require('./domain.cjs');
// T5.5: JSDoc types only. Upstream JSON is `any` (validated at runtime here); derived numbers are `number|null`.
/**
 * Quota window input: every value comes straight from upstream JSON and is validated by quota().
 * @typedef {object} QuotaInput
 * @property {string} id
 * @property {string} label
 * @property {string} [group]
 * @property {string} [unit]
 * @property {any} [used]
 * @property {any} [cap]
 * @property {any} [remainingPercent]
 * @property {any} [resetAt]
 * @property {any} [startAt]
 * @property {boolean} [unlimited]
 * @property {boolean} [applicable]
 * @property {boolean} [exhausted]
 * @property {number} [boost]
 */
/** @type {(value: any) => number|null} */
const percent = (value) => {
  const n = count(value);
  return n !== null && n <= 100 ? n : null;
};
/** @type {(value: any) => boolean} */
const object = (value) => value && typeof value === 'object' && !Array.isArray(value);
/** @param {QuotaInput} input */
function quota({
  id,
  label,
  group = '',
  unit = '额度单位',
  used,
  cap,
  remainingPercent,
  resetAt,
  startAt,
  unlimited = false,
  applicable = true,
  exhausted = false,
  boost = 1,
}) {
  used = count(used);
  cap = count(cap);
  const ratio = percent(remainingPercent) ?? (cap > 0 && used !== null ? Math.max(0, 100 - (used / cap) * 100) : null);
  return {
    id,
    label,
    group: text(group),
    unit,
    used,
    cap,
    remainingPercent: !applicable || unlimited ? null : ratio === null ? null : ratio * boost,
    usedPercent: !applicable || unlimited || ratio === null ? null : 100 - ratio,
    boost,
    resetAt: timestamp(resetAt),
    startAt: timestamp(startAt),
    resetState: timestamp(resetAt) ? 'scheduled' : 'unknown',
    unlimited,
    applicable,
    exceeded: applicable && !unlimited && (exhausted || ratio === 0 || (cap > 0 && used !== null && used >= cap)),
  };
}
/** @param {any} raw upstream quota JSON */
function normalizeGlm(raw) {
  const body = object(raw?.data) ? raw.data : raw;
  if (!object(body) || !Array.isArray(body.limits) || !body.limits.length || body.limits.length > 100)
    throw new Error('schema');
  const tokenCount = body.limits.filter((/** @type {any} */ l) => l?.type === 'TOKENS_LIMIT').length;
  const seen = new Map();
  const windows = body.limits.map((/** @type {any} */ l, /** @type {number} */ i) => {
    if (!object(l) || typeof l.type !== 'string') throw new Error('schema');
    const unit = finite(l.unit),
      n = count(l.number),
      tool = l.type === 'TIME_LIMIT';
    const label =
      unit === 3
        ? // @ts-expect-error -- a null `n` compares false and falls back to the default; intended.
          (n > 0 ? n : 5) + ' 小时窗口'
        : unit === 6
          ? // @ts-expect-error -- a null `n` compares false (no count prefix); intended.
            (n > 1 ? n + ' ' : '') + '周窗口'
          : unit === 5
            ? // @ts-expect-error -- a null `n` compares false (no count prefix); intended.
              (n > 1 ? n + ' ' : '') + '月窗口'
            : tool
              ? '工具月额度'
              : tokenCount === 1 && l.type === 'TOKENS_LIMIT' && unit === null
                ? '5 小时窗口'
                : '额度窗口 ' + (i + 1);
    // Never infer a plan version, token count or money from TOKENS_LIMIT.
    const pool = ['glm', text(l.type, 40), unit ?? 'unknown', n ?? ''].join(':');
    const occurrence = seen.get(pool) || 0;
    seen.set(pool, occurrence + 1);
    return quota({
      id: pool + ':' + occurrence,
      label,
      group: tool ? 'MCP / 工具' : '套餐共享额度',
      unit: tool ? '次' : '额度单位',
      used: l.currentValue,
      cap: l.usage,
      remainingPercent: percent(l.percentage) === null ? null : 100 - /** @type {number} */ (percent(l.percentage)),
      resetAt: l.nextResetTime,
    });
  });
  if (!windows.some((/** @type {any} */ w) => w.remainingPercent !== null || w.used !== null || w.cap !== null))
    throw new Error('schema');
  return {
    windows,
    planName: text(body.planName || body.level) || null,
    note: '额度单位以平台返回为准；套餐共享窗口与 MCP 工具额度分别统计。',
  };
}
/**
 * @param {any} reported
 * @param {any} cap
 * @param {number|null} remainingPct
 * @returns {{ used: number|null, cap: number|null }}
 */
function miniCounts(reported, cap, remainingPct) {
  // `c > 0` below also rules out null, so c is a number from there on.
  const c = /** @type {number} */ (count(cap)),
    r = count(reported),
    p = percent(remainingPct);
  if (!(c > 0) || r === null || r > c) return { used: null, cap: null };
  let remaining = r;
  if (p !== null) {
    const a = Math.abs((r / c) * 100 - p),
      b = Math.abs(((c - r) / c) * 100 - p);
    if (Math.min(a, b) > 1) return { used: null, cap: null };
    if (b < a) remaining = c - r;
  }
  return { used: c - remaining, cap: c };
}
/**
 * @param {any} end
 * @param {any} remains
 * @param {number} now
 */
function miniReset(end, remains, now) {
  if (timestamp(end)) return timestamp(end);
  const duration = count(remains);
  return duration === null ? null : now + duration;
}
/**
 * @param {any} raw upstream remains JSON
 * @param {number} [now]
 */
function normalizeMiniMax(raw, now = Date.now()) {
  if (!object(raw) || !Array.isArray(raw.model_remains) || !raw.model_remains.length || raw.model_remains.length > 100)
    throw new Error('schema');
  /** @type {any[]} */
  const windows = [];
  const names = new Set();
  for (const [i, model] of raw.model_remains.entries()) {
    if (!object(model) || !text(model.model_name)) throw new Error('schema');
    if (names.has(model.model_name)) throw new Error('schema');
    names.add(model.model_name);
    const unavailable =
      model.current_interval_status === 3 &&
      model.current_weekly_status === 3 &&
      model.current_interval_total_count === 0 &&
      model.current_weekly_total_count === 0;
    const group = model.model_name === 'general' ? '通用共享额度' : text(model.model_name);
    for (const period of ['interval', 'weekly']) {
      const prefix = 'current_' + period + '_';
      if (period === 'weekly' && !Object.keys(model).some((k) => k.startsWith(prefix))) continue;
      const p = percent(model[prefix + 'remaining_percent']),
        counts = miniCounts(model[prefix + 'usage_count'], model[prefix + 'total_count'], p);
      const start = period === 'interval' ? model.start_time : model.weekly_start_time;
      const end = period === 'interval' ? model.end_time : model.weekly_end_time;
      const span =
        timestamp(end) && timestamp(start)
          ? /** @type {number} */ (timestamp(end)) - /** @type {number} */ (timestamp(start))
          : null;
      const hours = /** @type {number} */ (span) > 0 ? /** @type {number} */ (span) / 3600000 : null;
      const label =
        period === 'weekly'
          ? '每周窗口'
          : hours && Number.isInteger(hours)
            ? hours % 24 === 0
              ? hours / 24 + ' 天窗口'
              : hours + ' 小时窗口'
            : '当前窗口';
      const factor = period === 'weekly' ? count(model.weekly_boost_permille) : null;
      windows.push(
        quota({
          id: ['minimax', text(model.model_name), period].join(':'),
          label,
          group,
          unit: '次',
          ...counts,
          remainingPercent: p,
          resetAt: miniReset(end, period === 'interval' ? model.remains_time : model.weekly_remains_time, now),
          startAt: start,
          applicable: !unavailable,
          unlimited: !unavailable && model[prefix + 'status'] === 3,
          exhausted: model[prefix + 'status'] === 2,
          boost: factor === null ? 1 : factor / 1000,
        }),
      );
    }
  }
  if (!windows.some((w) => !w.applicable || w.unlimited || w.exceeded || w.remainingPercent !== null || w.cap !== null))
    throw new Error('schema');
  return { windows, planName: null, note: '各模型与通用额度池分别展示，不能相加；含加赠的百分比可能超过 100%。' };
}
/** @param {any} raw upstream GetAFPUsage JSON */
function normalizeVolcengine(raw) {
  const data = raw?.Result;
  if (!object(data)) throw new Error('schema');
  const windows = [
    ['AFPFiveHour', '5 小时窗口'],
    ['AFPDaily', '近一天窗口'],
    ['AFPWeekly', '近一周窗口'],
    ['AFPMonthly', '近一月窗口'],
  ]
    .filter(([field]) => Object.hasOwn(data, field))
    .map(([field, label]) => {
      const v = data[field];
      if (!object(v)) throw new Error('schema');
      return quota({
        id: field,
        label,
        group: '个人 Agent Plan',
        unit: 'AFP',
        used: v.Used,
        cap: v.Quota,
        resetAt: v.ResetTime,
        startAt: v.SubscribeTime,
      });
    });
  if (!windows.length || !windows.some((w) => w.used !== null || w.cap !== null)) throw new Error('schema');
  return {
    windows,
    planName: text(data.PlanType) || null,
    note: 'AFP 为平台积分，各时间窗口约束同一套餐，不能相加或换算为精确 Token。',
  };
}
/** @param {any} raw upstream Go usage JSON */
function normalizeOpenCodeGo(raw) {
  if (!object(raw?.usage)) throw new Error('schema');
  const windows = [
    ['rolling', '5 小时窗口'],
    ['weekly', '本周额度'],
    ['monthly', '本账期额度'],
  ].map(([key, label]) => {
    const value = raw.usage[key];
    if (
      !object(value) ||
      !['ok', 'rate-limited'].includes(value.status) ||
      typeof value.percent !== 'number' ||
      !Number.isFinite(value.percent) ||
      value.percent < 0 ||
      value.percent > 100
    )
      throw new Error('schema');
    if (value.status === 'rate-limited' && value.percent !== 100) throw new Error('schema');
    const reset = value.resetsAt;
    if (
      reset != null &&
      (typeof reset !== 'string' || !/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(reset) || !timestamp(reset))
    )
      throw new Error('schema');
    const window = quota({
      id: 'opencode-go:' + key,
      label,
      group: 'Go 共享额度',
      remainingPercent: 100 - value.percent,
      resetAt: reset,
      exhausted: value.status === 'rate-limited',
    });
    // A rounded zero does not establish whether the rolling window has started.
    if (key === 'rolling' && value.percent === 0) window.resetState = 'unconfirmed';
    return window;
  });
  return {
    windows,
    planName: 'OpenCode Go',
    note: '三个周期共同约束 Go 共享额度，不能相加',
    noteDetail:
      '按官方百分比显示，不换算为金额或 Token。若已在官方平台开启 Use balance，Go 用尽后仍可能使用 Zen 余额；本接口不返回余额及开关状态。',
  };
}
module.exports = { quota, normalizeGlm, normalizeMiniMax, normalizeVolcengine, normalizeOpenCodeGo, miniCounts };
