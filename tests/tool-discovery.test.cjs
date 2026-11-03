const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { discoverTools } = require('../desktop/tool-discovery.cjs');

// T12.6: discovery only checks that each tool's default location exists (and a directory kind's own sub-directory).
test('T12.6: tools at their default location are found; added ones are marked; nothing else counts', (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'tua-discover-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  assert.deepEqual(discoverTools(home, []), []);
  fs.mkdirSync(path.join(home, '.codex', 'sessions'), { recursive: true });
  fs.mkdirSync(path.join(home, '.gemini', 'tmp'), { recursive: true });
  // A Kimi Code directory without sessions is not a usable source: not found.
  fs.mkdirSync(path.join(home, '.kimi-code'), { recursive: true });
  // A file kind needs a regular file, not a directory of the same name.
  fs.mkdirSync(path.join(home, '.local', 'share', 'opencode', 'opencode.db'), { recursive: true });
  fs.mkdirSync(path.join(home, '.token-usage-assistant', 'harness'), { recursive: true });
  fs.writeFileSync(path.join(home, '.token-usage-assistant', 'harness', 'usage.jsonl'), '');
  const found = discoverTools(home, [{ kind: 'codex', file: path.join(home, '.codex') }]);
  assert.deepEqual(found, [
    { kind: 'harness', path: '~/.token-usage-assistant/harness/usage.jsonl', added: false },
    { kind: 'codex', path: '~/.codex', added: true },
    { kind: 'gemini-cli', path: '~/.gemini', added: false },
  ]);
});
