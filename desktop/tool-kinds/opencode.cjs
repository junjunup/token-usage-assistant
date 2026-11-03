// OpenCode (tool kind, T5.3b): read-only whitelisted projection of opencode.db (step records first).
module.exports = {
  kind: 'opencode',
  defaultLabel: 'OpenCode',
  picker: {
    type: 'file',
    title: '选择 OpenCode 的 opencode.db',
    filters: [{ name: 'SQLite 数据库', extensions: ['sqlite', 'db', 'sqlite3'] }],
    // T12.6: where OpenCode keeps it by default (XDG data directory), relative to the home directory.
    defaultFilePath: '.local/share/opencode/opencode.db',
  },
  inspect: () => ({ installationId: null }),
  scan(db, source, range) {
    return require('../opencode-reader.cjs').readOpenCodeRows(source.file, range, source.id);
  },
  overlapCheck: true,
};
