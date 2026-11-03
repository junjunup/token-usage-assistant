// Kimi Code CLI (tool kind, T12.4): the Kimi Code home directory; one wire.jsonl per agent under sessions.
const fs = require('node:fs');
const path = require('node:path');
const publicError = (message) => Object.assign(new Error(message), { publicMessage: message });
module.exports = {
  kind: 'kimi-code-cli',
  defaultLabel: 'Kimi Code CLI',
  picker: {
    type: 'directory',
    title: '选择 Kimi Code 目录（包含 sessions）',
    // Relative to the user's home directory (resolved in main.cjs).
    defaultHomePath: '.kimi-code',
  },
  inspect(item) {
    if (!fs.existsSync(path.join(item.file, 'sessions')))
      throw publicError(
        '此目录没有 Kimi Code 的 sessions 会话目录，请选择使用中的 Kimi Code 目录（通常是 ~/.kimi-code）。',
      );
    return { installationId: null };
  },
  scan(db, source, range) {
    return require('../kimi-code-reader.cjs').scanKimiCode(db, source, range);
  },
  overlapCheck: true,
};
