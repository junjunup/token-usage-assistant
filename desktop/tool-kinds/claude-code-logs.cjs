// Claude Code session logs (tool kind, T14.1): the Claude Code home directory; session files under projects/.
// Every session counts, however it was started; the launcher's OTLP source (claude-code) stays available and the
// requests both report count once (tool-worker.cjs, D21 ②).
const fs = require('node:fs');
const path = require('node:path');
const publicError = (message) => Object.assign(new Error(message), { publicMessage: message });
module.exports = {
  kind: 'claude-code-logs',
  defaultLabel: 'Claude Code 会话日志',
  picker: {
    type: 'directory',
    title: '选择 Claude Code 目录（包含 projects）',
    // Relative to the user's home directory (resolved in main.cjs).
    defaultHomePath: '.claude',
  },
  inspect(item) {
    if (!fs.existsSync(path.join(item.file, 'projects')))
      throw publicError(
        '此目录没有 Claude Code 的 projects 会话目录，请选择使用中的 Claude Code 目录（通常是 ~/.claude）。',
      );
    return { installationId: null };
  },
  scan(db, source, range) {
    return require('../claude-log-reader.cjs').scanClaudeLogs(db, source, range);
  },
  overlapCheck: true,
};
