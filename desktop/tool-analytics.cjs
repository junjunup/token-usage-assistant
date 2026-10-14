// Pure tool metadata analytics. Platform balances, quotas and credentials never enter this module.
const { makeBins, priceKey } = require('./analytics-core.cjs');
const { summarizeAssociations } = require('./association-rules.cjs');
const number = (v) => typeof v === 'number' && Number.isFinite(v);
const count = (v) => (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : null);
const text = (v, fallback = 'unknown', limit = 2048) =>
  // eslint-disable-next-line no-control-regex -- intentionally rejects/strips control characters (input validation and privacy).
  typeof v === 'string' && v.length ? v.replace(/[\x00-\x1f]/g, '').slice(0, limit) : fallback;
const stableId = (value, fallback = 'unknown') => {
  if (value === undefined || value === null || value === '') return fallback;
  // eslint-disable-next-line no-control-regex -- intentionally rejects/strips control characters (input validation and privacy).
  if (typeof value !== 'string' || value.length > 8192 || /[\x00-\x1f]/.test(value))
    throw Object.assign(new Error('工具用量身份字段无效。'), { code: 'INVALID_TOOL_METADATA' });
  return value;
};
const status = (v) =>
  v === 'completed'
    ? 'completed'
    : ['failed', 'error'].includes(v)
      ? 'failed'
      : ['cancelled', 'canceled'].includes(v)
        ? 'cancelled'
        : ['pending', 'running', 'streaming'].includes(v)
          ? 'pending'
          : 'unknown';
const sum = (rows, key) => rows.reduce((n, r) => n + (number(r[key]) ? r[key] : 0), 0);
const sumKnown = (rows, key) => (rows.length && rows.every((r) => number(r[key])) ? sum(rows, key) : null);
const TOKENS = [
  'input',
  'output',
  'total',
  'read',
  'write',
  'fresh',
  'reasoning',
  'cacheKnown',
  'extra',
  'invalidUsage',
];
function identity({
  sourceId,
  tool,
  requestId,
  attemptId,
  sessionId,
  at,
  updatedAt,
  revision,
  provider,
  model,
  project,
  status: state,
}) {
  const source = stableId(sourceId),
    session = stableId(sessionId),
    request = stableId(requestId),
    attempt = stableId(attemptId),
    p = text(provider),
    m = text(model);
  return {
    sourceId: source,
    tool,
    requestId: request,
    attemptId: attempt,
    id: JSON.stringify([source, attempt]),
    at,
    updatedAt: number(updatedAt) ? updatedAt : at,
    revision: count(revision),
    status: status(state),
    provider: p,
    model: m,
    modelKey: priceKey(p, m),
    project: text(project, '未关联项目'),
    session: JSON.stringify([source, session]),
    sessionId: session,
    accountId: null,
    currency: null,
  };
}
function normalizeZcodeRecord(raw, sourceId) {
  if (
    !raw ||
    !((typeof raw.id === 'string' && raw.id.length) || (Number.isSafeInteger(raw.id) && raw.id >= 0)) ||
    !number(Number(raw.started_at)) ||
    Number(raw.started_at) <= 0
  )
    throw Object.assign(new Error('Zcode 请求身份或时间无效。'), { code: 'INVALID_TOOL_METADATA' });
  const input = count(raw.input_tokens),
    output = count(raw.output_tokens),
    rawRead = count(raw.cache_read_input_tokens),
    rawWrite = count(raw.cache_creation_input_tokens),
    reportedTotal = count(raw.computed_total_tokens);
  const cacheKnown = input !== null && rawRead !== null && rawWrite !== null && rawRead + rawWrite <= input;
  const base = input !== null && output !== null ? input + output : null;
  const invalidUsage =
    (rawRead !== null && rawWrite !== null && input !== null && rawRead + rawWrite > input) ||
    (reportedTotal !== null && base !== null && reportedTotal < base);
  const total = reportedTotal !== null ? (base !== null && reportedTotal < base ? null : reportedTotal) : base;
  return {
    ...identity({
      sourceId,
      tool: 'zcode',
      requestId: String(raw.id),
      attemptId: String(raw.id),
      sessionId: raw.session_id,
      at: Number(raw.started_at),
      provider: raw.provider_id,
      model: raw.model_id,
      project: raw.directory,
      status: raw.status,
    }),
    input,
    output,
    total,
    read: cacheKnown ? rawRead : null,
    write: cacheKnown ? rawWrite : null,
    fresh: cacheKnown ? input - rawRead - rawWrite : null,
    reasoning: null,
    cacheKnown,
    extra: base !== null && total !== null ? total - base : null,
    invalidUsage,
    usageReported: [input, output, reportedTotal, rawRead, rawWrite].some((v) => v !== null),
    provenance: 'zcode-sqlite/reported-metadata',
  };
}
function unsupported() {
  return Object.assign(new Error('不支持这份 Harness 用量格式或版本。'), { code: 'UNSUPPORTED_HARNESS_FORMAT' });
}
function normalizeHarnessRecord(wire, sourceId) {
  if (
    !wire ||
    wire.schema !== 'token-usage-assistant.harness' ||
    wire.schemaVersion !== 1 ||
    wire.harnessVersion !== '0.1.7-rc.1' ||
    wire.tool !== 'deepseek-harness' ||
    !['sourceId', 'sessionId', 'requestId', 'attemptId'].every(
      // eslint-disable-next-line no-control-regex -- intentionally rejects/strips control characters (input validation and privacy).
      (k) => typeof wire[k] === 'string' && wire[k].length && wire[k].length <= 8192 && !/[\x00-\x1f]/.test(wire[k]),
    ) ||
    !number(wire.timestamp) ||
    wire.timestamp <= 0 ||
    !number(wire.updatedAt) ||
    wire.updatedAt < wire.timestamp ||
    count(wire.revision) === null ||
    !['pending', 'completed', 'failed', 'cancelled', 'unknown'].includes(wire.status) ||
    typeof wire.usageReported !== 'boolean' ||
    !wire.usage ||
    typeof wire.usage !== 'object' ||
    Array.isArray(wire.usage)
  )
    throw unsupported();
  const u = wire.usage;
  if (
    [
      'uncachedInputTokens',
      'outputTokens',
      'cacheReadTokens',
      'cacheWriteTokens',
      'reasoningTokens',
      'totalTokens',
    ].some((k) => u[k] !== null && u[k] !== undefined && count(u[k]) === null)
  )
    throw unsupported();
  if (
    !wire.usageReported &&
    [
      'uncachedInputTokens',
      'outputTokens',
      'cacheReadTokens',
      'cacheWriteTokens',
      'reasoningTokens',
      'totalTokens',
    ].some((k) => count(u[k]) !== null)
  )
    throw unsupported();
  const fresh = count(u.uncachedInputTokens),
    read = count(u.cacheReadTokens),
    write = count(u.cacheWriteTokens),
    output = count(u.outputTokens),
    reportedTotal = count(u.totalTokens),
    rawReasoning = count(u.reasoningTokens);
  const input = [fresh, read, write].every((v) => v !== null) ? fresh + read + write : null,
    base = input !== null && output !== null ? input + output : null;
  const invalidUsage =
    (reportedTotal !== null && base !== null && reportedTotal < base) ||
    (rawReasoning !== null && output !== null && rawReasoning > output);
  const total = reportedTotal !== null ? (base !== null && reportedTotal < base ? null : reportedTotal) : base;
  return {
    ...identity({
      sourceId: sourceId || wire.sourceId,
      tool: 'deepseek-harness',
      requestId: wire.requestId,
      attemptId: wire.attemptId,
      sessionId: wire.sessionId,
      at: wire.timestamp,
      updatedAt: wire.updatedAt,
      revision: wire.revision,
      provider: wire.provider,
      model: wire.model,
      project: wire.project,
      status: wire.status,
    }),
    input,
    output,
    total,
    read,
    write,
    fresh,
    reasoning: output !== null && rawReasoning !== null && rawReasoning <= output ? rawReasoning : null,
    cacheKnown: input !== null,
    extra: base !== null && total !== null ? total - base : null,
    invalidUsage,
    usageReported: wire.usageReported,
    provenance: 'harness-plugin/provider-reported',
  };
}
function normalizedPrices(prices) {
  const result = {};
  for (const [key, p] of Object.entries(prices || {})) {
    if (!p || !['input', 'output', 'read', 'write'].every((k) => number(p[k]) && p[k] >= 0 && p[k] <= 1000000))
      continue;
    const currency = p.currency === undefined ? 'USD' : p.currency;
    if (typeof currency !== 'string' || !['USD', 'CNY'].includes(currency)) continue;
    result[key] = { input: p.input, output: p.output, read: p.read, write: p.write, currency };
  }
  return result;
}
function normalizeSubscriptionRecord(wire, sourceId) {
  if (
    !wire ||
    !['codex', 'claude-code'].includes(wire.tool) ||
    !number(wire.timestamp) ||
    wire.timestamp <= 0 ||
    !wire.attemptId ||
    !wire.sessionId
  )
    throw new Error('subscription usage schema');
  const u = wire.usage || {},
    input = count(u.input),
    output = count(u.output),
    read = count(u.read),
    write = count(u.write),
    reasoning = count(u.reasoning),
    reported = count(u.total),
    base = input !== null && output !== null ? input + output : null;
  const cacheKnown = input !== null && read !== null && write !== null && read + write <= input;
  const invalidUsage =
    (read !== null && write !== null && input !== null && read + write > input) ||
    (reasoning !== null && output !== null && reasoning > output) ||
    (reported !== null && base !== null && reported < base);
  const total = reported !== null ? (base !== null && reported < base ? null : reported) : base;
  return {
    ...identity({
      sourceId,
      tool: wire.tool,
      requestId: wire.requestId || wire.attemptId,
      attemptId: wire.attemptId,
      sessionId: wire.sessionId,
      at: wire.timestamp,
      updatedAt: wire.updatedAt || wire.timestamp,
      revision: wire.revision || 0,
      provider: wire.tool === 'codex' ? 'openai' : 'anthropic',
      model: wire.model,
      project: wire.project,
      status: wire.status,
    }),
    input,
    output,
    total,
    read,
    write,
    fresh: cacheKnown ? input - read - write : null,
    reasoning: reasoning !== null && output !== null && reasoning <= output ? reasoning : null,
    cacheKnown,
    extra: base !== null && total !== null ? total - base : null,
    invalidUsage,
    usageReported: [input, output, total, read, write].some((v) => v !== null),
    provenance: wire.tool === 'codex' ? 'codex-rollout/reported-snapshot' : 'claude-code/otel-api-event',
    recordUnit: wire.tool === 'codex' ? 'usage-observation' : 'request',
  };
}
function normalizeOpenCodeRecord(raw, sourceId) {
  if (!raw || !number(raw.at) || raw.at <= 0 || !['v1-step', 'v1-message', 'v2-message'].includes(raw.format))
    throw new Error('OpenCode metadata schema');
  // OpenCode stores non-cached input and visible output separately from cache/reasoning.
  const fresh = count(raw.input),
    read = count(raw.read),
    write = count(raw.write),
    visible = count(raw.output),
    reasoning = count(raw.reasoning),
    reported = count(raw.total);
  const input = [fresh, read, write].every((v) => v !== null) ? fresh + read + write : null,
    output = visible !== null && reasoning !== null ? visible + reasoning : null;
  const base = input !== null && output !== null ? input + output : null;
  const invalidUsage =
    ['input', 'read', 'write', 'output', 'reasoning', 'total'].some((k) => raw[k] != null && count(raw[k]) === null) ||
    (base !== null && !Number.isSafeInteger(base)) ||
    (reported !== null && base !== null && reported < base);
  const total = invalidUsage ? null : (reported ?? base);
  return {
    ...identity({
      sourceId,
      tool: 'opencode',
      requestId: raw.id,
      attemptId: raw.id,
      sessionId: raw.session_id,
      at: raw.at,
      updatedAt: raw.updated_at,
      provider: raw.provider,
      model: raw.model,
      project: raw.directory,
      status: 'unknown',
    }),
    input,
    output,
    total,
    read,
    write,
    fresh,
    reasoning,
    cacheKnown: input !== null && !invalidUsage,
    extra: base !== null && total !== null ? total - base : null,
    invalidUsage,
    usageReported: [fresh, read, write, visible, reasoning, reported].some((v) => v !== null),
    provenance: 'opencode-sqlite/' + raw.format,
    recordUnit: 'usage-observation',
  };
}
function priceRecord(r, prices) {
  const p = prices[r.modelKey],
    canPrice = r.usageReported && p && r.cacheKnown && number(r.output) && r.extra === 0 && !r.invalidUsage;
  return {
    ...r,
    cost: canPrice ? (r.fresh * p.input + r.output * p.output + r.read * p.read + r.write * p.write) / 1e6 : null,
    currency: p?.currency || null,
  };
}
function costs(rows) {
  const priced = rows.filter((r) => number(r.cost)),
    map = {};
  for (const r of priced) {
    const entry = map[r.currency] || (map[r.currency] = { knownCost: 0, cost: 0, pricedRequests: 0 });
    entry.knownCost += r.cost;
    entry.cost += r.cost;
    entry.pricedRequests++;
  }
  for (const entry of Object.values(map)) entry.partial = priced.length !== rows.length;
  for (const [currency, entry] of Object.entries(map))
    if (rows.some((r) => !number(r.cost) && (!r.currency || r.currency === currency))) entry.cost = null;
  const currencies = Object.keys(map),
    currency = currencies.length === 1 ? currencies[0] : null;
  return {
    cost: currency && priced.length === rows.length ? map[currency].knownCost : null,
    knownCost: currency ? map[currency].knownCost : null,
    currency,
    costsByCurrency: map,
    pricedRequests: priced.length,
    unpricedRequests: rows.length - priced.length,
  };
}
function summarize(rows, prices) {
  const completedRows = rows.filter((r) => r.status === 'completed'),
    reported = rows.filter((r) => r.usageReported),
    known = reported.filter((r) => number(r.total)),
    cacheRows = reported.filter((r) => r.cacheKnown),
    completed = completedRows.length,
    failed = rows.filter((r) => r.status === 'failed').length,
    cancelled = rows.filter((r) => r.status === 'cancelled').length;
  const money = costs(rows),
    completedMoney = costs(completedRows),
    read = sum(cacheRows, 'read'),
    write = sum(cacheRows, 'write'),
    fresh = sum(cacheRows, 'fresh'),
    cacheInput = sum(cacheRows, 'input'),
    savingsByCurrency = {};
  const savingsRows = cacheRows.filter((r) => prices[r.modelKey] && !r.invalidUsage);
  for (const r of savingsRows) {
    const p = prices[r.modelKey];
    savingsByCurrency[p.currency] = (savingsByCurrency[p.currency] || 0) + (r.read * (p.input - p.read)) / 1e6;
  }
  const savingsCurrencies = Object.keys(savingsByCurrency),
    savingsCurrency = savingsCurrencies.length === 1 ? savingsCurrencies[0] : null;
  return {
    requests: rows.length,
    completed,
    failed,
    cancelled,
    pending: rows.length - completed - failed - cancelled,
    successRate: completed + failed ? (completed / (completed + failed)) * 100 : null,
    reportedRequests: reported.length,
    missingUsageRequests: rows.length - reported.length,
    missingTokenRequests: rows.length - known.length,
    input: sumKnown(rows, 'input'),
    output: sumKnown(rows, 'output'),
    total: known.length === rows.length && rows.length ? sum(known, 'total') : null,
    knownTokens: sum(known, 'total'),
    ...money,
    averageTokens: sumKnown(completedRows, 'total') === null ? null : sum(completedRows, 'total') / completed,
    averageCost: completedMoney.cost === null ? null : completedMoney.cost / completed,
    averageCurrency: completedMoney.currency,
    reportedAverageTokens:
      known.length === reported.length && reported.length ? sum(known, 'total') / reported.length : null,
    cache: {
      input: cacheRows.length ? cacheInput : null,
      read: cacheRows.length ? read : null,
      write: cacheRows.length ? write : null,
      fresh: cacheRows.length ? fresh : null,
      coverage: reported.length ? (cacheRows.length / reported.length) * 100 : null,
      requests: cacheRows.length,
      missing: reported.length - cacheRows.length,
      hitRate: cacheInput ? (read / cacheInput) * 100 : null,
      estimatedSavings:
        savingsCurrency && savingsRows.length === cacheRows.length ? savingsByCurrency[savingsCurrency] : null,
      currency: savingsCurrency,
      savingsByCurrency,
    },
    scope: 'tools',
    tokenBasis: 'reported-usage',
    costBasis: 'local-estimate',
    invalidUsageRequests: rows.filter((r) => r.invalidUsage).length,
  };
}
function grouped(rows, key, prices) {
  const map = new Map();
  for (const r of rows) {
    const id = r[key];
    if (!map.has(id)) map.set(id, []);
    map.get(id).push(r);
  }
  return [...map]
    .map(([id, list]) => ({
      id,
      model: list[0].model,
      provider: list[0].provider,
      project: list[0].project,
      sessionId: key === 'session' ? list[0].sessionId : undefined,
      sourceId: key === 'session' ? list[0].sourceId : undefined,
      first: list.reduce((n, r) => Math.min(n, r.at), Infinity),
      last: list.reduce((n, r) => Math.max(n, r.at), -Infinity),
      ...summarize(list, prices),
    }))
    .sort((a, b) => b.knownTokens - a.knownTokens || String(a.id).localeCompare(String(b.id)));
}
function deduplicate(records) {
  const map = new Map();
  const newer = (a, b) => {
    const ar = number(a.revision) ? a.revision : -1,
      br = number(b.revision) ? b.revision : -1;
    return ar > br || (ar === br && (a.updatedAt || a.at) >= (b.updatedAt || b.at));
  };
  for (const r of records) {
    if (!r || !number(r.at) || typeof r.sourceId !== 'string' || typeof r.attemptId !== 'string') continue;
    const key = JSON.stringify([r.sourceId, r.attemptId]),
      old = map.get(key);
    if (!old) {
      map.set(key, { latest: r, usage: r.usageReported ? r : null });
      continue;
    }
    if (newer(r, old.latest)) old.latest = r;
    if (r.usageReported && (!old.usage || newer(r, old.usage))) old.usage = r;
  }
  return [...map.values()].map(({ latest, usage }) => {
    const r = { ...latest };
    if (!r.usageReported && usage) {
      for (const field of TOKENS) r[field] = usage[field];
      r.usageReported = true;
    }
    return r;
  });
}
function coverageFor(reports, range) {
  const start = reports.reduce((n, r) => (number(r.coverage?.start) ? Math.min(n, r.coverage.start) : n), Infinity),
    end = reports.reduce((n, r) => (number(r.coverage?.end) ? Math.max(n, r.coverage.end) : n), -Infinity);
  const missingSources = reports.filter((r) => r.status !== 'ready').map((r) => r.id);
  const complete =
    reports.length > 0 &&
    reports.every(
      (r) =>
        r.status === 'ready' &&
        !r.truncated &&
        r.coverage?.complete === true &&
        number(r.coverage.start) &&
        number(r.coverage.end) &&
        r.coverage.start <= range.start &&
        r.coverage.end >= range.end,
    );
  return {
    start: Number.isFinite(start) ? start : null,
    end: Number.isFinite(end) ? end : null,
    complete,
    partial: !complete,
    sourceCount: reports.length,
    missingSources,
    reason: complete ? null : '记录只代表已采集的用量，不能确认完整覆盖所选时段。',
  };
}
function aggregateTools(records, range, filters = {}, prices = {}, sourceReports = []) {
  const p = normalizedPrices(prices),
    ids = Array.isArray(filters.sourceIds) && filters.sourceIds.length ? new Set(filters.sourceIds) : null;
  const reports = sourceReports.filter((r) => !ids || ids.has(r.id));
  const rows = deduplicate(records)
    .filter((r) => (!ids || ids.has(r.sourceId)) && r.at <= range.end)
    .map((r) => priceRecord(r, p));
  const belongs = (r) =>
    !filters.billingGroupId ||
    (filters.billingGroupId === 'unlinked' ? !r.accountId : r.accountId === filters.billingGroupId);
  const inRange = rows.filter((r) => r.at >= range.start && belongs(r)),
    match = (r) =>
      belongs(r) &&
      (!filters.model || r.modelKey === filters.model) &&
      (!filters.project || r.project === filters.project) &&
      (!filters.session || r.session === filters.session);
  const current = inRange.filter(match),
    duration = range.end - range.start,
    previousRange = { start: range.start - duration, end: range.start },
    coverage = coverageFor(reports, range),
    previousCoverage = coverageFor(reports, previousRange),
    comparisonAvailable = coverage.complete && previousCoverage.complete;
  const bins = makeBins(range),
    bucketRows = bins.map(() => []);
  for (const r of current) {
    let lo = 0,
      hi = bins.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1,
        b = bins[mid];
      if (r.at < b.from) hi = mid - 1;
      else if (r.at >= b.to) lo = mid + 1;
      else {
        bucketRows[mid].push(r);
        break;
      }
    }
  }
  bins.forEach((bin, i) => {
    const slice = bucketRows[i],
      s = summarize(slice, p),
      full = coverageFor(reports, {
        start: Math.max(range.start, bin.from),
        end: Math.min(range.end, bin.to),
      }).complete;
    Object.assign(bin, {
      tokens: s.total,
      requests: slice.length || full ? s.requests : null,
      cost: s.cost,
      input: s.input,
      output: s.output,
      knownTokens: s.knownTokens,
      knownCost: s.knownCost,
      currency: s.currency,
      costsByCurrency: s.costsByCurrency,
      reportedRequests: s.reportedRequests,
      missingTokenRequests: s.missingTokenRequests,
      unpricedRequests: s.unpricedRequests,
      coverageMs: full ? Math.max(0, Math.min(bin.to, range.end) - Math.max(bin.from, range.start)) : 0,
      partial: !full,
    });
  });
  const summary = summarize(current, p),
    rateStart = Math.max(range.start, range.end - 30 * 60000),
    recent = current.filter((r) => r.at >= rateStart),
    rateMinutes = (range.end - rateStart) / 60000,
    rateSummary = summarize(recent, p);
  const association = summarizeAssociations(current),
    accountId =
      filters.billingGroupId && filters.billingGroupId !== 'unlinked'
        ? filters.billingGroupId
        : association.groups.length === 1 && !association.unlinkedRecords
          ? association.groups[0].id
          : null;
  if (Object.keys(summary.costsByCurrency).length > 1)
    for (const bin of bins) {
      bin.cost = null;
      bin.currency = null;
    }
  return {
    range,
    source: 'tools',
    summary,
    accountId,
    association,
    previous: comparisonAvailable
      ? summarize(
          rows.filter((r) => r.at >= previousRange.start && r.at < previousRange.end && match(r)),
          p,
        )
      : null,
    comparison: {
      available: comparisonAvailable,
      reason: comparisonAvailable ? null : '当前与上一等长时段均需完整覆盖，当前无法核对。',
    },
    bins,
    models: grouped(current, 'modelKey', p),
    projects: grouped(current, 'project', p),
    sessions: grouped(current, 'session', p),
    options: {
      models: grouped(inRange, 'modelKey', p).map((r) => ({ id: r.id, name: r.model, provider: r.provider })),
      projects: [...new Set(inRange.map((r) => r.project))].sort(),
      sources: reports.map((r) => ({ id: r.id, name: r.label || r.kind || r.id, tool: r.kind })),
    },
    localRate: {
      tokensPerMinute: rateMinutes > 0 && rateSummary.total !== null ? rateSummary.total / rateMinutes : null,
      knownTokensPerMinute: rateMinutes > 0 ? rateSummary.knownTokens / rateMinutes : null,
      windowMinutes: rateMinutes,
      partial:
        !coverageFor(reports, { start: rateStart, end: range.end }).complete || rateSummary.missingTokenRequests > 0,
      tokenBasis: 'reported-usage',
    },
    prices: p,
    sourceReports: reports,
    coverage,
    partial: coverage.partial || summary.missingTokenRequests > 0,
    truncated: reports.some((r) => r.truncated),
    provenance: {
      kind: 'tool-metadata',
      tokenBasis: 'reported-usage',
      costBasis: 'local-estimate',
      accountAssociated: !!accountId,
    },
    missing: {
      usageRequests: summary.missingUsageRequests,
      tokenRequests: summary.missingTokenRequests,
      sourceIds: coverage.missingSources,
    },
  };
}
module.exports = {
  normalizeZcodeRecord,
  normalizeHarnessRecord,
  normalizeSubscriptionRecord,
  normalizeOpenCodeRecord,
  aggregateTools,
};
