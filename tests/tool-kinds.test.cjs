const test = require('node:test'),
  assert = require('node:assert/strict');
const { TOOL_KINDS, toolKind } = require('../desktop/tool-kinds/index.cjs');

// T5.3b: the registry must reproduce the pre-refactor kinds, labels, pickers and overlap rules exactly.
test('tool kinds, default labels and overlap rules match the pre-refactor code', () => {
  assert.deepEqual(
    TOOL_KINDS.map((k) => k.kind),
    ['zcode', 'harness', 'codex', 'claude-code', 'opencode'],
  );
  assert.deepEqual(Object.fromEntries(TOOL_KINDS.map((k) => [k.kind, k.defaultLabel])), {
    zcode: 'Zcode',
    harness: 'DeepSeek Harness',
    codex: 'Codex',
    'claude-code': 'Claude Code',
    opencode: 'OpenCode',
  });
  assert.deepEqual(
    TOOL_KINDS.filter((k) => k.overlapCheck).map((k) => k.kind),
    ['zcode', 'codex', 'claude-code', 'opencode'],
  );
  assert.equal(toolKind('unknown'), null);
  for (const k of TOOL_KINDS) {
    assert.equal(typeof k.inspect, 'function', k.kind);
    assert.equal(typeof k.scan, 'function', k.kind);
  }
});

// Pre-refactor chooseToolFile (main.cjs before T5.3b), written out by hand.
const SQLITE = [{ name: 'SQLite 数据库', extensions: ['sqlite', 'db', 'sqlite3'] }],
  JSONL = [{ name: '专用用量导出', extensions: ['jsonl'] }];
test('native pickers match the pre-refactor dialog options', () => {
  assert.deepEqual(toolKind('codex').picker, {
    type: 'directory',
    title: '选择 Codex 配置目录（包含 sessions）',
    defaultHomePath: '.codex',
  });
  assert.deepEqual(toolKind('zcode').picker, { type: 'file', title: '选择 Zcode 用量数据库', filters: SQLITE });
  assert.deepEqual(toolKind('opencode').picker, {
    type: 'file',
    title: '选择 OpenCode 的 opencode.db',
    filters: SQLITE,
  });
  for (const kind of ['harness', 'claude-code'])
    assert.deepEqual(toolKind(kind).picker, { type: 'file', title: '选择统计组件导出的 usage.jsonl', filters: JSONL });
});

test('Codex inspection keeps its directory requirement and message', () => {
  const fs = require('node:fs'),
    os = require('node:os'),
    path = require('node:path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tua-kinds-'));
  try {
    assert.throws(() => toolKind('codex').inspect({ file: dir }), {
      publicMessage: '此目录没有 Codex sessions 或 archived_sessions，请选择使用中的 Codex 配置目录。',
    });
    fs.mkdirSync(path.join(dir, 'archived_sessions'));
    assert.deepEqual(toolKind('codex').inspect({ file: dir }), { installationId: null });
    assert.deepEqual(toolKind('zcode').inspect({ file: dir }), { installationId: null });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
