'use strict';
// T6.2 (D7): page model for the coverage report (formerly 账户核对). It reads the result of
// Associations.reconcile() as is — compareEvidence and the reasons stay untouched — and only
// picks what the page shows: each source's covered span and gaps, and the association counts.
// The difference / error-rate fields are left out entirely unless the comparison is available.

/**
 * @typedef {{ id: string, label: string, status: string, start: number|null, end: number|null,
 *   gaps: string[] }} CoverageSource
 * @typedef {{ linked: number, unlinked: number, ambiguous: number, invalid: number }} AssociationCounts
 * @typedef {{ available: boolean, range: { start: number|null, end: number|null },
 *   reasons: string[], sources: CoverageSource[], gapCount: number,
 *   association: AssociationCounts|null,
 *   comparison?: { difference: number|null, errorRate: number|null } }} CoverageReport
 */

/** @param {unknown} v */
const time = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
/** @param {unknown} v */
const whole = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);

/**
 * Gaps of one tool source within the selected range, in the order a reader would check them.
 * @param {any} source a source report from the tool worker
 * @returns {string[]}
 */
function sourceGaps(source) {
  /** @type {string[]} */
  const gaps = [];
  if (source.status === 'stale') gaps.push('数据延迟，显示的是上次成功读取的结果');
  else if (source.status !== 'ready') gaps.push(source.message || '本次未能读取，此来源没有计入');
  if (source.truncated) gaps.push('记录超过读取上限，较早的记录未读入');
  if (source.partialLine) gaps.push('最后一行仍在写入，已跳过');
  const missing = whole(source.missingUsage);
  if (missing) gaps.push(`${missing} 条记录缺少用量，未计为零`);
  if (source.contract === 'unverified-version')
    gaps.push(`${source.observedVersion || '新'} 版本未经验证，按已知结构读取`);
  if (time(source.associationCoverage?.start) === null) gaps.push('所选范围内没有归入此账户的记录');
  return gaps;
}

/**
 * @param {any} report the result of Associations.reconcile()
 * @returns {CoverageReport}
 */
function coverageReport(report) {
  /** @type {CoverageSource[]} */
  const sources = (report?.tools?.sourceReports || []).map(
    /** @param {any} s @returns {CoverageSource} */
    (s) => ({
      id: String(s.id),
      label: s.label || s.kind || String(s.id),
      status: s.status,
      start: time(s.associationCoverage?.start),
      end: time(s.associationCoverage?.end),
      gaps: sourceGaps(s),
    }),
  );
  const a = report?.association || report?.tools?.association || null;
  /** @type {CoverageReport} */
  const view = {
    available: report?.available === true,
    range: { start: time(report?.range?.start), end: time(report?.range?.end) },
    reasons: Array.isArray(report?.reasons) ? report.reasons.slice() : [],
    sources,
    gapCount: sources.reduce((n, s) => n + s.gaps.length, 0),
    association: a
      ? {
          linked: whole(a.linkedRecords),
          unlinked: whole(a.unlinkedRecords),
          ambiguous: whole(a.ambiguousRecords),
          invalid: whole(a.invalidRecords),
        }
      : null,
  };
  if (view.available) view.comparison = { difference: report.difference, errorRate: report.errorRate };
  return view;
}

module.exports = { coverageReport, sourceGaps };
