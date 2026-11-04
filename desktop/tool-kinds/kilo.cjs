// Kilo Code (tool kind, T13.2): kilo.db, the same database structure as OpenCode (Kilo's CLI and extension are a
// fork of it), read by the OpenCode reader with read-only whitelisted projection.
module.exports = {
  kind: 'kilo',
  defaultLabel: 'Kilo Code',
  picker: {
    type: 'file',
    title: '选择 Kilo Code 的 kilo.db',
    filters: [{ name: 'SQLite 数据库', extensions: ['db', 'sqlite', 'sqlite3'] }],
    defaultFilePath: '.local/share/kilo/kilo.db',
  },
  inspect: () => ({ installationId: null }),
  scan(db, source, range) {
    return require('../opencode-reader.cjs').readOpenCodeRows(source.file, range, source.id, 'kilo');
  },
  overlapCheck: true,
};
