// @ts-check
const { count, finite, text, timestamp } = require('./domain.cjs');
const { numberAmount } = require('./balance-domain.cjs');
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
// T12.2 (D19 ②): Kimi Code subscription — GET /coding/v1/usages. No official documentation: the shape below comes
// from third-party tools that read it (CodexBar, CodeBurn). Two shapes are known: ratio pools under `usages`
// (limit_5h / limit_7d / limit_month_total, used_ratio 0–1 and reset_time) and the older counts (`usage` = the weekly
// quota, `limits[]` with a window duration and time unit). Numbers arrive as JSON numbers or numeric strings. At
// least one window must decode, otherwise the format is incompatible (nothing is guessed). Percentages only: what
// the counts count is not documented.
const KIMI_UNITS = /** @type {Record<string, number>} */ ({
  TIME_UNIT_MINUTE: 1,
  TIME_UNIT_HOUR: 60,
  TIME_UNIT_DAY: 1440,
});
// Names from the official V1 membership catalog (as CodexBar maps them); unknown levels are not shown.
const KIMI_LEVELS = /** @type {Record<string, string>} */ ({
  LEVEL_FREE: 'Adagio',
  LEVEL_TRIAL: 'Andante',
  LEVEL_BASIC: 'Moderato',
  LEVEL_INTERMEDIATE: 'Allegretto',
  LEVEL_ADVANCED: 'Allegro',
});
/** @type {(value: any) => number|null} a JSON number or a plain decimal string; anything else is a schema error */
const kimiNumber = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value.trim())) return Number(value);
  throw new Error('schema');
};
/** @type {(row: any) => number|null} reset as an ISO 8601 instant or epoch seconds, under any of four names */
const kimiReset = (row) => {
  const value = row.reset_time ?? row.resetTime ?? row.reset_at ?? row.resetAt;
  if (value === null || value === undefined || value === '') return null;
  const raw = String(value).trim();
  const ms = /^\d+(\.\d+)?$/.test(raw)
    ? Number(raw) * 1000
    : /^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:?\d\d)$/.test(raw)
      ? Date.parse(raw)
      : NaN;
  if (!Number.isFinite(ms) || ms <= 0) throw new Error('schema');
  return ms;
};
/** @type {(value: number) => number} drops binary noise such as 44.99999999999999 */
const kimiPercent = (value) => Math.round(value * 1e6) / 1e6;
/** @type {(minutes: number) => string} */
const kimiWindowLabel = (minutes) =>
  minutes === 300
    ? '5 小时窗口'
    : minutes === 10080
      ? '每周额度'
      : minutes % 1440 === 0
        ? minutes / 1440 + ' 天窗口'
        : minutes % 60 === 0
          ? minutes / 60 + ' 小时窗口'
          : minutes + ' 分钟窗口';
/** @param {any} raw upstream JSON */
function normalizeKimiCode(raw) {
  if (!object(raw)) throw new Error('schema');
  if (raw.usages != null && !object(raw.usages)) throw new Error('schema');
  if (raw.limits != null && !Array.isArray(raw.limits)) throw new Error('schema');
  /** @type {Map<string, any>} */
  const windows = new Map();
  const pools = /** @type {[string, string, string][]} */ ([
    ['limit_5h', '5 小时窗口', 'Kimi Code'],
    ['limit_7d', '每周额度', 'Kimi Code'],
    ['limit_month_total', '每月总额度', '会员总额度（与其他 Kimi 功能共用）'],
  ]);
  for (const [key, label, group] of pools) {
    const pool = raw.usages?.[key];
    if (pool === null || pool === undefined) continue;
    if (!object(pool)) throw new Error('schema');
    const ratio = kimiNumber(pool.used_ratio);
    if (ratio === null || ratio < 0) throw new Error('schema');
    windows.set(
      key,
      quota({
        id: 'kimi-code:' + key,
        label,
        group,
        remainingPercent: kimiPercent(100 - Math.min(1, ratio) * 100),
        resetAt: kimiReset(pool),
      }),
    );
  }
  // Older counts: only for the windows the ratio pools do not give.
  /** @type {(key: string, label: string, detail: any) => void} */
  const legacy = (key, label, detail) => {
    if (windows.has(key)) return;
    if (!object(detail)) throw new Error('schema');
    const limit = kimiNumber(detail.limit),
      remaining = kimiNumber(detail.remaining),
      used = kimiNumber(detail.used) ?? (limit !== null && remaining !== null ? limit - remaining : null);
    if (limit === null || limit <= 0 || used === null) throw new Error('schema');
    const left = kimiPercent(Math.max(0, Math.min(100, ((limit - used) / limit) * 100)));
    windows.set(
      key,
      quota({ id: 'kimi-code:' + key, label, group: 'Kimi Code', remainingPercent: left, resetAt: kimiReset(detail) }),
    );
  };
  for (const item of raw.limits || []) {
    if (!object(item) || !object(item.window)) throw new Error('schema');
    const duration = kimiNumber(item.window.duration),
      unit = KIMI_UNITS[item.window.timeUnit];
    if (duration === null || duration <= 0 || !unit) throw new Error('schema');
    const minutes = duration * unit;
    legacy(
      minutes === 300 ? 'limit_5h' : minutes === 10080 ? 'limit_7d' : 'm' + minutes,
      kimiWindowLabel(minutes),
      item.detail,
    );
  }
  if (raw.usage !== null && raw.usage !== undefined) legacy('limit_7d', '每周额度', raw.usage);
  if (!windows.size) throw new Error('schema');
  const order = ['limit_5h', 'limit_7d', 'limit_month_total'];
  const level = typeof raw.user?.membership?.level === 'string' ? KIMI_LEVELS[raw.user.membership.level] : undefined;
  const v1 = raw.version === undefined || raw.version === null || raw.version === 'GOODS_VERSION_V1';
  return {
    windows: [...windows.entries()]
      .sort(([a], [b]) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99))
      .map(([, w]) => w),
    planName: level && v1 ? 'Kimi Code · ' + level : 'Kimi Code',
    note: '非官方接口：Kimi 没有公开这个用量接口的文档，格式变化时会显示「格式不兼容」',
    noteDetail:
      '字段来自多个第三方工具的整理，只按平台给出的百分比显示，不换算为次数或 Token。「每月总额度」与 Kimi 的其他功能（对话、Agent 等）共用，和 5 小时、每周窗口同时约束，不能相加。',
  };
}
const ZENMUX_TIERS = Object.freeze({ free: 'Free', pro: 'Pro', max: 'Max', ultra: 'Ultra' });
const ZENMUX_STATUS = Object.freeze({
  monitored: '平台检测到用量异常，正在观察（服务仍可用）',
  abusive: '平台判定用量异常，已限制服务',
  suspended: '账户已暂停',
  banned: '账户已封禁',
});
/**
 * T13.3 (D20): ZenMux GET /api/v1/management/subscription/detail (official Management API, a Management API Key).
 * The rolling 5-hour and 7-day windows give `usage_percentage` as a 0–1 fraction and `resets_at` (ISO, null before
 * the window starts). The monthly quota has no real-time usage, so it is not shown as a window. At least one window.
 * @param {any} raw
 */
function normalizeZenMux(raw) {
  const d = raw?.data;
  if (!object(raw) || raw.success === false || !object(d)) throw new Error('schema');
  const windows = /** @type {[string, string][]} */ ([
    ['quota_5_hour', '5 小时窗口'],
    ['quota_7_day', '7 天窗口'],
  ]).flatMap(([key, label]) => {
    const w = d[key];
    if (w === null || w === undefined) return [];
    if (!object(w) || typeof w.usage_percentage !== 'number' || !Number.isFinite(w.usage_percentage))
      throw new Error('schema');
    if (w.usage_percentage < 0) throw new Error('schema');
    const resetsAt = isoInstant(w.resets_at ?? null);
    return [
      quota({
        id: 'zenmux:' + key,
        label,
        group: 'ZenMux 订阅',
        remainingPercent: Math.round((100 - Math.min(1, w.usage_percentage) * 100) * 100) / 100,
        resetAt: resetsAt,
      }),
    ];
  });
  if (!windows.length) throw new Error('schema');
  const tier = typeof d.plan?.tier === 'string' ? ZENMUX_TIERS[/** @type {'pro'} */ (d.plan.tier)] : undefined;
  const status =
    typeof d.account_status === 'string' ? ZENMUX_STATUS[/** @type {'banned'} */ (d.account_status)] : undefined;
  return {
    windows,
    planName: tier ? 'ZenMux · ' + tier : 'ZenMux',
    note: status || '5 小时与 7 天窗口同时约束，任一用尽都会限速',
    noteDetail:
      '额度按 Flow 计，这里只显示平台给出的使用比例和重置时间。每月额度没有实时用量，不作为窗口显示。查询使用 Management API Key，只调用只读查询接口。',
  };
}
// T10.2 (D16 ③): OpenRouter GET /api/v1/key — limits and reported spend of THIS key (credits = USD), not an account
// balance or a bill. Only whitelisted numbers are kept: the key label, user / organization / workspace ids and other
// identity fields are never stored. The key's own limit also appears in `budgets` as scope key_limit; it is shown
// once, as the key limit, taking its server-given resets_at (no countdown is computed here).
const OPENROUTER_INTERVAL = Object.freeze({ daily: '每日', weekly: '每周', monthly: '每月' });
const OPENROUTER_SCOPE = Object.freeze({
  api_key: '这把 Key 的预算',
  member: '成员预算',
  workspace: '工作区预算',
  workspace_default_member: '工作区成员默认预算',
  workspace_default_key: '工作区 Key 默认预算',
});
/** @type {(value: any) => number|null} */
const usdNumber = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('schema');
  return value;
};
/** @type {(value: any) => string|null} ISO 8601 instant, or null */
const isoInstant = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(value) || !timestamp(value))
    throw new Error('schema');
  return value;
};
/**
 * @param {{ id: string, label: string, group: string, limit: number, remaining: number, interval: any, resetsAt: any }} w
 */
function usdWindow({ id, label, group, limit, remaining, interval, resetsAt }) {
  if (limit < 0) throw new Error('schema');
  const window = quota({
    id,
    label,
    group,
    unit: 'USD',
    // Remaining can be negative (over the limit); the share is clamped, the amounts stay as returned.
    remainingPercent: limit > 0 ? Math.max(0, Math.min(100, (remaining / limit) * 100)) : 0,
    resetAt: resetsAt,
    exhausted: remaining <= 0,
  });
  window.used = limit - remaining;
  window.cap = limit;
  // The server's own remaining amount, shown instead of a value derived by float subtraction.
  /** @type {any} */ (window).remainingAmount = remaining;
  // T10.2: a limit that never resets says so instead of "reset time not returned".
  if (interval === null) window.resetState = 'never';
  return window;
}
/** @param {any} raw upstream /api/v1/key JSON */
function normalizeOpenRouter(raw) {
  const d = raw?.data;
  if (!object(d) || !('limit' in d) || !('limit_remaining' in d)) throw new Error('schema');
  const limit = usdNumber(d.limit),
    remaining = usdNumber(d.limit_remaining),
    reset = d.limit_reset ?? null;
  if ((limit === null) !== (remaining === null)) throw new Error('schema');
  if (reset !== null && !(typeof reset === 'string' && reset in OPENROUTER_INTERVAL)) throw new Error('schema');
  const budgets = d.budgets === undefined ? null : d.budgets;
  if (budgets !== null && (!Array.isArray(budgets) || budgets.length > 50)) throw new Error('schema');
  /** @type {Array<{ scope: string, interval: string|null, limit: number, remaining: number, resetsAt: string|null }>} */
  const rows = (budgets || []).map((/** @type {any} */ b) => {
    if (!object(b) || typeof b.scope !== 'string') throw new Error('schema');
    const interval = b.reset_interval ?? null;
    if (interval !== null && !(typeof interval === 'string' && interval in OPENROUTER_INTERVAL))
      throw new Error('schema');
    const limitUsd = usdNumber(b.limit_usd),
      spend = usdNumber(b.spend_usd),
      left = usdNumber(b.remaining_usd);
    if (limitUsd === null || spend === null || left === null) throw new Error('schema');
    return { scope: b.scope, interval, limit: limitUsd, remaining: left, resetsAt: isoInstant(b.resets_at) };
  });
  const own = rows.find((b) => b.scope === 'key_limit');
  const windows = [
    limit === null || remaining === null
      ? Object.assign(
          quota({ id: 'openrouter:key', label: '花费上限', group: '这把 Key · USD', unit: 'USD', unlimited: true }),
          { resetState: 'never' },
        )
      : usdWindow({
          id: 'openrouter:key',
          label: '花费上限' + (reset ? ' · ' + OPENROUTER_INTERVAL[/** @type {'daily'} */ (reset)] : ''),
          group: '这把 Key · USD',
          limit,
          remaining,
          interval: reset,
          resetsAt: own && own.interval === reset ? own.resetsAt : null,
        }),
    ...rows
      .filter((b) => b.scope !== 'key_limit')
      .map((b, i) =>
        usdWindow({
          id: 'openrouter:budget:' + i,
          label:
            (OPENROUTER_SCOPE[/** @type {'member'} */ (b.scope)] || '预算') +
            (b.interval ? ' · ' + OPENROUTER_INTERVAL[/** @type {'daily'} */ (b.interval)] : ''),
          group: '预算 · USD',
          limit: b.limit,
          remaining: b.remaining,
          interval: b.interval,
          resetsAt: b.resetsAt,
        }),
      ),
  ];
  /** @type {(v: any) => string|null} */
  const usd = (v) => {
    try {
      return numberAmount(v);
    } catch {
      throw new Error('schema');
    }
  };
  return {
    windows,
    budgets: budgets === null ? null : windows.length - 1,
    // Reported spend of this key in USD (UTC day / week from Monday / month; total since the key was created).
    spend: {
      daily: usd(d.usage_daily),
      weekly: usd(d.usage_weekly),
      monthly: usd(d.usage_monthly),
      total: usd(d.usage),
      byok: usd(d.byok_usage),
    },
    planName: 'OpenRouter · 这把 Key',
    note: '上限和花费都只针对这把 Key',
    noteDetail:
      'OpenRouter 返回的是这把 Key 的花费上限与已报告花费（USD），不是账户余额，也不是账单；同一账户的其他 Key 不在内，各连接不相加。花费不含自带 Key（BYOK）的用量。',
  };
}
module.exports = {
  quota,
  normalizeZenMux,
  normalizeGlm,
  normalizeMiniMax,
  normalizeVolcengine,
  normalizeOpenCodeGo,
  normalizeOpenRouter,
  normalizeKimiCode,
  miniCounts,
};
