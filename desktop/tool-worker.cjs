const { parentPort, workerData } = require('node:worker_threads');
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const { initIndex } = require('./harness-reader.cjs');
const { aggregateTools } = require('./tool-analytics.cjs');
// Per-kind scanning and overlap rules come from desktop/tool-kinds/ (T5.3b).
const { toolKind } = require('./tool-kinds/index.cjs');
const { associateRows } = require('./association-rules.cjs');
// timings (optional): per-source diagnostics collected for the main-thread log; never part of the result.
function execute(
  { operation, indexFile, sourceId, sources, range, filters, prices, associationRules = [] },
  timings = [],
) {
  let db;
  try {
    fs.mkdirSync(path.dirname(indexFile), { recursive: true });
    db = new DatabaseSync(indexFile, { enableLoadExtension: false });
    initIndex(db);
    if (operation === 'remove') {
      db.prepare('DELETE FROM tool_records WHERE source_id=?').run(sourceId);
      db.prepare('DELETE FROM tool_cursors WHERE source_id=?').run(sourceId);
      if (db.prepare("SELECT 1 FROM sqlite_master WHERE name='codex_files'").get())
        db.prepare('DELETE FROM codex_files WHERE source_id=?').run(sourceId);
      return { removed: true };
    }
    const records = [],
      reports = [],
      zcodeIdentities = new Set();
    for (const source of sources) {
      let result, rows;
      const sourceStarted = Date.now();
      try {
        result = toolKind(source.kind).scan(db, source, range);
        rows = result.rows || [];
      } catch {
        result = {
          status: 'schema',
          message: '此来源的用量身份或字段格式无法识别，已停止本次合并；其他来源继续统计。',
        };
        rows = [];
      }
      if (toolKind(source.kind).overlapCheck) {
        const identities = rows.map((r) =>
          JSON.stringify([source.kind, r.requestId, r.sessionId, r.at, r.provider, r.model]),
        );
        if (identities.some((id) => zcodeIdentities.has(id))) {
          rows = [];
          result.status = 'overlap';
          result.message = '与另一同类工具来源存在重叠记录，已暂停合并；可单独查看或移除副本。';
        } else for (const id of identities) zcodeIdentities.add(id);
      }
      const current = rows.filter((r) => r.at >= range.start),
        times = current.map((r) => r.at);
      reports.push({
        id: source.id,
        kind: source.kind,
        label: source.label,
        status: result.status,
        message: result.message || '',
        ...(result.messageDetail ? { messageDetail: result.messageDetail } : {}),
        harnessVersion: result.harnessVersion || null,
        coverage: {
          start: times.length ? times.reduce((a, b) => Math.min(a, b), Infinity) : null,
          end: times.length ? times.reduce((a, b) => Math.max(a, b), -Infinity) : null,
          complete: false,
        },
        truncated: !!result.truncated,
        partialLine: !!result.partialLine,
        scannedRows: rows.length,
        missingUsage: current.filter((r) => !r.usageReported).length,
        ...(result.contract ? { contract: result.contract, missing: result.missing } : {}),
        ...(Array.isArray(result.fields) ? { fields: result.fields } : {}),
      });
      timings.push({
        kind: source.kind,
        status: result.status,
        count: rows.length,
        durationMs: Date.now() - sourceStarted,
      });
      for (const row of rows) records.push(row);
    }
    const available = reports.some((s) => ['ready', 'stale'].includes(s.status));
    if (!available)
      return {
        source: 'tools',
        range,
        status: 'unavailable',
        summary: null,
        sourceReports: reports,
        message: '所选工具暂时没有可读取的用量记录，请查看各来源的同步状态。',
      };
    const associated = associateRows(records, associationRules);
    for (const report of reports) {
      const times = associated
        .filter(
          (r) =>
            r.sourceId === report.id &&
            r.at >= range.start &&
            r.at <= range.end &&
            (!filters.billingGroupId ||
              (filters.billingGroupId === 'unlinked' ? !r.accountId : r.accountId === filters.billingGroupId)),
        )
        .map((r) => r.at);
      report.associationCoverage = {
        start: times.length ? times.reduce((a, b) => Math.min(a, b), Infinity) : null,
        end: times.length ? times.reduce((a, b) => Math.max(a, b), -Infinity) : null,
        complete: false,
      };
    }
    const report = aggregateTools(associated, range, filters, prices, reports);
    return {
      ...report,
      status: reports.every((s) => s.status === 'ready') ? 'ready' : 'partial',
      updatedAt: Date.now(),
      sourceReports: reports,
      message: reports.some((s) => s.status !== 'ready')
        ? '部分来源未成功同步；合计仅包含可读取的记录。'
        : report.message || '',
    };
  } finally {
    db?.close();
  }
}
if (parentPort) {
  try {
    const timings = [];
    parentPort.postMessage({ ...execute(workerData, timings), timings });
  } catch {
    parentPort.postMessage({
      source: 'tools',
      status: 'error',
      summary: null,
      message: '本机索引或分析无法完成，原始工具记录未修改。',
    });
  }
}
module.exports = { execute };
