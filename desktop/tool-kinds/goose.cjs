// Goose (tool kind, T13.2): sessions.db, read-only; only each session's running total (会话级汇总).
module.exports = {
  kind: 'goose',
  defaultLabel: 'Goose',
  picker: {
    type: 'file',
    title: '选择 Goose 的 sessions.db',
    filters: [{ name: 'SQLite 数据库', extensions: ['db', 'sqlite', 'sqlite3'] }],
    // Goose's data folder: XDG on macOS / Linux, %APPDATA%\Block\goose\data on Windows.
    defaultFilePath: {
      other: '.local/share/goose/sessions/sessions.db',
      win32: 'AppData/Roaming/Block/goose/data/sessions/sessions.db',
    },
  },
  inspect: () => ({ installationId: null }),
  scan(db, source, range) {
    return require('../session-totals-reader.cjs').readSessionTotals('goose', source, range);
  },
  overlapCheck: true,
};
