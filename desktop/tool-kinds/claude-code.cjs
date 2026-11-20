// Claude Code (tool kind, T5.3b): the local collector's usage.jsonl export.
module.exports = {
  kind: 'claude-code',
  // T17.1 (D24 ①): named after how it collects, so it is not mistaken for the session logs (claude-code-logs).
  defaultLabel: 'Claude Code（启动脚本）',
  picker: {
    type: 'file',
    title: '选择统计组件导出的 usage.jsonl',
    filters: [{ name: '专用用量导出', extensions: ['jsonl'] }],
  },
  inspect: (item) => ({ installationId: require('../claude-collector.cjs').readClaudeManifest(item.file).sourceId }),
  scan(db, source, range) {
    return require('../claude-collector.cjs').scanClaude(db, source, range);
  },
  overlapCheck: true,
};
