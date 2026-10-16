// Codex (tool kind, T5.3b): the Codex configuration directory; rollout files under sessions / archived_sessions.
const fs = require('node:fs');
const path = require('node:path');
const publicError = (message) => Object.assign(new Error(message), { publicMessage: message });
module.exports = {
  kind: 'codex',
  defaultLabel: 'Codex',
  picker: {
    type: 'directory',
    title: '选择 Codex 配置目录（包含 sessions）',
    // Relative to the user's home directory (resolved in main.cjs).
    defaultHomePath: '.codex',
  },
  inspect(item) {
    if (!fs.existsSync(path.join(item.file, 'sessions')) && !fs.existsSync(path.join(item.file, 'archived_sessions')))
      throw publicError('此目录没有 Codex sessions 或 archived_sessions，请选择使用中的 Codex 配置目录。');
    return { installationId: null };
  },
  scan(db, source, range) {
    return require('../codex-reader.cjs').scanCodex(db, source, range);
  },
  overlapCheck: true,
};
