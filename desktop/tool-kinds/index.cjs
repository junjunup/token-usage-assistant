// Tool source kinds (T5.3b): one file per local tool. tool-sources.cjs, tool-worker.cjs and main.cjs (file picker)
// derive kinds, default labels, inspection, scanning and overlap checks from here. Plain Node only (no electron),
// so the worker thread can load it too; readers are required only when used.
const TOOL_KINDS = Object.freeze(
  [
    'zcode',
    'harness',
    'codex',
    'claude-code',
    'opencode',
    'gemini-cli',
    'kimi-code-cli',
    'qwen-code',
    'cline',
    'kilo',
    'goose',
    'crush',
  ].map((kind) => require('./' + kind + '.cjs')),
);
const toolKind = (kind) => TOOL_KINDS.find((k) => k.kind === kind) || null;
/**
 * A picker's default location relative to the home directory (T12.6). T13.2: it may differ per platform, given as
 * { win32, other } (Goose keeps its data under %APPDATA% on Windows).
 * @param {any} picker
 * @param {'defaultHomePath'|'defaultFilePath'} key
 * @returns {string|null}
 */
function pickerPath(picker, key, platform = process.platform) {
  const value = picker?.[key];
  if (!value) return null;
  if (typeof value === 'string') return value;
  return (platform === 'win32' ? value.win32 : value.other) || null;
}
module.exports = { TOOL_KINDS, toolKind, pickerPath };
