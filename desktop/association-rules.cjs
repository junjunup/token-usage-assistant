// @ts-check
// Query-time metadata only. Source records and their on-disk indexes remain unchanged.
/**
 * A user-confirmed association rule (T5.5: JSDoc types only).
 * @typedef {object} AssociationRule
 * @property {string} id
 * @property {string} groupId
 * @property {string} sourceId
 * @property {number} from
 * @property {number|null} to open-ended when null
 * @property {string} [provider]
 * @property {string} [model]
 * @property {boolean} [valid]
 */
/**
 * @param {AssociationRule} rule
 * @param {any} row tool record
 */
function matches(rule, row) {
  return (
    rule.sourceId === row.sourceId &&
    row.at >= rule.from &&
    (rule.to === null || row.at < rule.to) &&
    (!rule.provider || rule.provider === row.provider) &&
    (!rule.model || rule.model === row.model)
  );
}
/**
 * @param {AssociationRule} a
 * @param {AssociationRule} b
 */
function overlaps(a, b) {
  return (
    a.sourceId === b.sourceId &&
    a.from < (b.to ?? Infinity) &&
    b.from < (a.to ?? Infinity) &&
    (!a.provider || !b.provider || a.provider === b.provider) &&
    (!a.model || !b.model || a.model === b.model)
  );
}
/**
 * @param {any[]} rows tool records
 * @param {AssociationRule[]} [rules]
 */
function associateRows(rows, rules = []) {
  return rows.map((row) => {
    const candidates = rules.filter((rule) => matches(rule, row)),
      valid = candidates.filter((rule) => rule.valid),
      groups = new Set(valid.map((rule) => rule.groupId));
    if (candidates.some((rule) => !rule.valid))
      return {
        ...row,
        accountId: null,
        association: { status: 'invalid', basis: 'manual', ruleIds: candidates.map((r) => r.id) },
      };
    if (groups.size > 1)
      return {
        ...row,
        accountId: null,
        association: { status: 'ambiguous', basis: 'manual', ruleIds: valid.map((r) => r.id) },
      };
    return groups.size === 1
      ? {
          ...row,
          accountId: [...groups][0],
          association: { status: 'linked', basis: 'manual', ruleIds: valid.map((r) => r.id) },
        }
      : { ...row, accountId: null, association: { status: 'unlinked', basis: null, ruleIds: [] } };
  });
}
/** @param {any[]} rows associated tool records */
function summarizeAssociations(rows) {
  const groups = new Map(),
    ruleIds = new Set();
  let linked = 0,
    ambiguous = 0,
    invalid = 0;
  for (const row of rows) {
    if (row.accountId) {
      linked++;
      const g = groups.get(row.accountId) || { id: row.accountId, records: 0, knownTokens: 0 };
      g.records++;
      g.knownTokens += Number.isFinite(row.total) ? row.total : 0;
      groups.set(g.id, g);
    }
    if (row.association?.status === 'ambiguous') ambiguous++;
    if (row.association?.status === 'invalid') invalid++;
    for (const id of row.association?.ruleIds || []) ruleIds.add(id);
  }
  return {
    basis: 'manual',
    linkedRecords: linked,
    unlinkedRecords: rows.length - linked,
    ambiguousRecords: ambiguous,
    invalidRecords: invalid,
    groups: [...groups.values()],
    ruleIds: [...ruleIds],
  };
}
// A numeric difference is valid only for certified, comparable evidence. Current local
// collectors cannot certify complete account coverage, so production reports explain gaps.
/**
 * @param {any} platform
 * @param {any} tool
 */
function compareEvidence(platform, tool) {
  /** @type {string[]} */
  const reasons = [];
  if (!platform || !tool)
    return { available: false, difference: null, errorRate: null, reasons: ['缺少可比较的数据。'] };
  if (!platform.accountId || platform.accountId !== tool.accountId) reasons.push('账户范围未对齐。');
  if (
    !Number.isFinite(platform.start) ||
    !Number.isFinite(platform.end) ||
    platform.start !== tool.start ||
    platform.end !== tool.end ||
    platform.end <= platform.start
  )
    reasons.push('统计起止时间未严格对齐。');
  if (!platform.unit || !platform.basis || platform.unit !== tool.unit || platform.basis !== tool.basis)
    reasons.push('统计单位或口径不同。');
  if (platform.scope !== 'account' || tool.scope !== 'account') reasons.push('双方不是同一完整账户范围。');
  if (platform.complete !== true || tool.complete !== true) reasons.push('未确认完整覆盖所选账户和时段。');
  if (platform.fresh !== true || tool.fresh !== true) reasons.push('数据未同步或存在延迟。');
  if (!Number.isFinite(platform.value) || platform.value < 0 || !Number.isFinite(tool.value) || tool.value < 0)
    reasons.push('数值缺失或无效。');
  return reasons.length
    ? { available: false, difference: null, errorRate: null, reasons }
    : {
        available: true,
        difference: tool.value - platform.value,
        errorRate: platform.value === 0 ? null : ((tool.value - platform.value) / platform.value) * 100,
        reasons: platform.value === 0 ? ['平台值为零，不计算误差率。'] : [],
      };
}
module.exports = { matches, overlaps, associateRows, summarizeAssociations, compareEvidence };
