// Zcode (tool kind, T5.3b): read-only whitelisted projection of the Zcode SQLite model_usage table.
module.exports = {
  kind: 'zcode',
  defaultLabel: 'Zcode',
  picker: {
    type: 'file',
    title: '选择 Zcode 用量数据库',
    filters: [{ name: 'SQLite 数据库', extensions: ['sqlite', 'db', 'sqlite3'] }],
  },
  inspect: () => ({ installationId: null }),
  // Worker thread: raw Zcode rows are normalized into tool records here.
  scan(db, source, range) {
    const { readZcodeRows } = require('../zcode-reader.cjs');
    const { normalizeZcodeRecord } = require('../tool-analytics.cjs');
    const result = readZcodeRows(source.file, range);
    return { ...result, rows: (result.rows || []).map((r) => normalizeZcodeRecord(r, source.id)) };
  },
  overlapCheck: true,
};
