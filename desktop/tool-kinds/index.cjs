// Tool source kinds (T5.3b): one file per local tool. tool-sources.cjs, tool-worker.cjs and main.cjs (file picker)
// derive kinds, default labels, inspection, scanning and overlap checks from here. Plain Node only (no electron),
// so the worker thread can load it too; readers are required only when used.
const TOOL_KINDS = Object.freeze(
  ['zcode', 'harness', 'codex', 'claude-code', 'opencode'].map((kind) => require('./' + kind + '.cjs')),
);
const toolKind = (kind) => TOOL_KINDS.find((k) => k.kind === kind) || null;
module.exports = { TOOL_KINDS, toolKind };
