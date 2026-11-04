// Crush (tool kind, T13.2): one project's .crush/crush.db, read-only; only each session's running total. Crush keeps
// one database per project; each is added on its own through the native picker (no default location to discover).
module.exports = {
  kind: 'crush',
  defaultLabel: 'Crush',
  picker: {
    type: 'file',
    title: '选择项目里的 .crush/crush.db',
    filters: [{ name: 'SQLite 数据库', extensions: ['db', 'sqlite', 'sqlite3'] }],
  },
  inspect: () => ({ installationId: null }),
  scan(db, source, range) {
    return require('../session-totals-reader.cjs').readSessionTotals('crush', source, range);
  },
  overlapCheck: true,
};
