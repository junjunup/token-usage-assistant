// @ts-check
// CSV export of the local tool records (T13.4, D20 ①): the records the usage analysis shows for its current range,
// sources and filters, one line each. Metadata only (no request ids, no content), as the tools report them:
// - a missing count is an empty cell, never 0 (AGENTS §2); cache and reasoning are parts of input / output, not extra;
// - the estimated cost comes from the user's own model prices, with its currency, and is not a bill;
// - the record unit says what one line is (a request, a turn, a session total, a usage snapshot).
// Text cells that a spreadsheet would run as a formula (= + - @, tab, carriage return) get a leading apostrophe.

/** @type {Record<string, string>} */
const UNITS = {
  request: '请求',
  turn: '一轮对话',
  'session-total': '会话汇总',
  'usage-observation': '用量快照',
};
/** @type {Record<string, string>} */
const STATUSES = { completed: '完成', failed: '失败', cancelled: '取消', unknown: '未知' };

const HEADER = [
  '时间（UTC）',
  '工具',
  '数据源',
  '记录单位',
  '状态',
  '服务商',
  '模型',
  '项目',
  '会话',
  '输入',
  '输出',
  '缓存读取',
  '缓存写入',
  '推理',
  '总量',
  '估算费用',
  '费用币种',
  '计费账户',
  '口径',
];

/** @param {any} value */
function cell(value) {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
  return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}
/** @param {any} v */
const count = (v) => (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : null);
/**
 * An estimated cost with its significant digits (12, which drops binary noise) and no exponent form; unknown stays
 * empty. @param {any} v
 */
function money(v) {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return null;
  const text = String(Number(v.toPrecision(12)));
  return /e/i.test(text) ? v.toFixed(12).replace(/\.?0+$/, '') : text;
}

/**
 * @param {any[]} rows records from exportRecords (tool-analytics.cjs)
 * @param {{ sources?: Record<string, string>, accounts?: Record<string, string>, tools?: Record<string, string> }} names
 *   display names by source id, billing-account id and tool kind
 * @returns {string} UTF-8 text with a byte-order mark (spreadsheets then read Chinese correctly), CRLF line ends
 */
function toolRecordsCsv(rows, { sources = {}, accounts = {}, tools = {} } = {}) {
  const lines = [HEADER.map(cell).join(',')];
  for (const r of rows) {
    const at = typeof r.at === 'number' && Number.isFinite(r.at) ? new Date(r.at).toISOString() : null;
    lines.push(
      [
        at,
        tools[r.tool] || r.tool,
        sources[r.sourceId] || null,
        UNITS[r.recordUnit] || '请求',
        STATUSES[r.status] || '未知',
        r.provider,
        r.model,
        r.project === '未关联项目' ? null : r.project,
        r.sessionId,
        count(r.input),
        count(r.output),
        count(r.read),
        count(r.write),
        count(r.reasoning),
        count(r.total),
        money(r.cost),
        money(r.cost) === null ? null : r.currency,
        r.accountId ? accounts[r.accountId] || r.accountId : null,
        r.provenance,
      ]
        .map(cell)
        .join(','),
    );
  }
  return '\uFEFF' + lines.join('\r\n') + '\r\n';
}

module.exports = { toolRecordsCsv, HEADER, cell };
