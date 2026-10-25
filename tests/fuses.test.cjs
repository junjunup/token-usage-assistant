// T9.2: the fuse expectations match electron-builder.yml, and the comparison reports every difference.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { EXPECTED, mismatches } = require('../scripts/fuses.cjs');

test('scripts/fuses.cjs expects exactly the electronFuses written in electron-builder.yml', () => {
  const yml = fs.readFileSync(path.join(__dirname, '..', 'electron-builder.yml'), 'utf8');
  const block = /^electronFuses:\n((?: {2}.*\n)+)/m.exec(yml);
  assert.ok(block, 'electron-builder.yml has an electronFuses block');
  const configured = Object.fromEntries(
    block[1]
      .split('\n')
      .map((line) => /^ {2}(\w+): (true|false)/.exec(line))
      .filter(Boolean)
      .map(([, key, value]) => [key[0].toUpperCase() + key.slice(1), value === 'true']),
  );
  assert.deepEqual(configured, { ...EXPECTED });
});

test('RunAsNode stays on (Claude statusLine helper) while NODE_OPTIONS and --inspect are off', () => {
  assert.equal(EXPECTED.RunAsNode, true);
  assert.equal(EXPECTED.EnableNodeOptionsEnvironmentVariable, false);
  assert.equal(EXPECTED.EnableNodeCliInspectArguments, false);
  assert.equal(EXPECTED.OnlyLoadAppFromAsar, true);
});

test('mismatches names each wrong or unreadable fuse', () => {
  assert.deepEqual(mismatches({ ...EXPECTED }), []);
  const wrong = mismatches({ ...EXPECTED, EnableNodeCliInspectArguments: true, OnlyLoadAppFromAsar: null });
  assert.equal(wrong.length, 2);
  assert.match(wrong.join(' '), /EnableNodeCliInspectArguments=true/);
  assert.match(wrong.join(' '), /OnlyLoadAppFromAsar=null/);
  assert.equal(mismatches({}).length, Object.keys(EXPECTED).length);
});
