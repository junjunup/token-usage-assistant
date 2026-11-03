// Gemini CLI (tool kind, T12.3): the Gemini CLI home directory; session files under tmp/<project hash>/chats.
const fs = require('node:fs');
const path = require('node:path');
const publicError = (message) => Object.assign(new Error(message), { publicMessage: message });
module.exports = {
  kind: 'gemini-cli',
  defaultLabel: 'Gemini CLI',
  picker: {
    type: 'directory',
    title: '选择 Gemini CLI 目录（包含 tmp）',
    // Relative to the user's home directory (resolved in main.cjs).
    defaultHomePath: '.gemini',
  },
  inspect(item) {
    if (!fs.existsSync(path.join(item.file, 'tmp')))
      throw publicError('此目录没有 Gemini CLI 的 tmp 会话目录，请选择使用中的 Gemini CLI 目录（通常是 ~/.gemini）。');
    return { installationId: null };
  },
  scan(db, source, range) {
    return require('../gemini-reader.cjs').scanGemini(db, source, range);
  },
  overlapCheck: true,
};
