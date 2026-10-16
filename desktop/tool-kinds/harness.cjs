// DeepSeek Harness (tool kind, T5.3b): the project's own plugin export (usage.jsonl + manifest), strictly validated.
module.exports = {
  kind: 'harness',
  defaultLabel: 'DeepSeek Harness',
  picker: {
    type: 'file',
    title: '选择统计组件导出的 usage.jsonl',
    filters: [{ name: '专用用量导出', extensions: ['jsonl'] }],
  },
  inspect(item) {
    const { readManifest } = require('../harness-reader.cjs');
    return { installationId: readManifest(item.file).sourceId };
  },
  scan(db, source, range) {
    const { scanHarness } = require('../harness-reader.cjs');
    const { normalizeHarnessRecord } = require('../tool-analytics.cjs');
    return scanHarness(db, source, range, normalizeHarnessRecord);
  },
  overlapCheck: false,
};
