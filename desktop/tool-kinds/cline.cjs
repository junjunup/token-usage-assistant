// Cline (tool kind, T13.2): the Cline data folder (default ~/.cline/data) with sessions/<id>/<id>.messages.json.
const fs = require('node:fs');
const path = require('node:path');
const publicError = (message) => Object.assign(new Error(message), { publicMessage: message });
module.exports = {
  kind: 'cline',
  defaultLabel: 'Cline',
  picker: {
    type: 'directory',
    title: '选择 Cline 数据目录（包含 sessions）',
    // Relative to the user's home directory (resolved in main.cjs).
    defaultHomePath: '.cline/data',
  },
  inspect(item) {
    if (!fs.existsSync(path.join(item.file, 'sessions')))
      throw publicError('此目录没有 Cline 的 sessions 会话目录，请选择 Cline 的数据目录（通常是 ~/.cline/data）。');
    return { installationId: null };
  },
  scan(db, source, range) {
    return require('../cline-reader.cjs').scanCline(db, source, range);
  },
  overlapCheck: true,
};
