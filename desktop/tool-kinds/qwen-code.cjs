// Qwen Code (tool kind, T12.5): the Qwen Code home directory; session files under projects/*/chats (older: tmp).
const fs = require('node:fs');
const path = require('node:path');
const publicError = (message) => Object.assign(new Error(message), { publicMessage: message });
module.exports = {
  kind: 'qwen-code',
  defaultLabel: 'Qwen Code',
  picker: {
    type: 'directory',
    title: '选择 Qwen Code 目录（包含 projects）',
    // Relative to the user's home directory (resolved in main.cjs).
    defaultHomePath: '.qwen',
  },
  inspect(item) {
    if (!fs.existsSync(path.join(item.file, 'projects')) && !fs.existsSync(path.join(item.file, 'tmp')))
      throw publicError('此目录没有 Qwen Code 的 projects 会话目录，请选择使用中的 Qwen Code 目录（通常是 ~/.qwen）。');
    return { installationId: null };
  },
  scan(db, source, range) {
    return require('../qwen-reader.cjs').scanQwen(db, source, range);
  },
  overlapCheck: true,
};
