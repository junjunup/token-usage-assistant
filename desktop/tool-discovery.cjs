// Local tool discovery (T12.6, D19): which tools have data at their default location in the user's home directory.
// Only existence is checked (a directory kind's own inspect() looks for its sub-directory; a file kind needs a regular
// file); nothing is read. A found tool is still added through the native picker (AGENTS §4), opened at that path.
const fs = require('node:fs');
const path = require('node:path');
const { TOOL_KINDS } = require('./tool-kinds/index.cjs');
const { pathKey } = require('./platform.cjs');

/** The default location of a kind, relative to the home directory, or null when it has none. */
const defaultOf = (kind) => kind.picker.defaultHomePath || kind.picker.defaultFilePath || null;

/**
 * @param {string} home the user's home directory
 * @param {{ kind: string, file: string }[]} sources the tool sources already added
 * @returns {{ kind: string, path: string, added: boolean }[]} found tools; `path` is shown as ~/…
 */
function discoverTools(home, sources) {
  const found = [];
  for (const kind of TOOL_KINDS) {
    const rel = defaultOf(kind);
    if (!rel) continue;
    const file = path.join(home, rel);
    try {
      const stat = fs.statSync(file);
      if (kind.picker.type === 'directory') {
        if (!stat.isDirectory()) continue;
        kind.inspect({ file });
      } else if (!stat.isFile()) continue;
    } catch {
      continue;
    }
    found.push({
      kind: kind.kind,
      path: '~/' + rel.split(path.sep).join('/'),
      added: sources.some((s) => s.kind === kind.kind && pathKey(s.file) === pathKey(file)),
    });
  }
  return found;
}
module.exports = { discoverTools, defaultOf };
