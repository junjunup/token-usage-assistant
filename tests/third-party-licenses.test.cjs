// T8.7: the shipped third-party license texts match the installed packages.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('THIRD_PARTY_LICENSES.txt is up to date with the bundled packages', async () => {
  const { render, BUNDLED } = await import('../scripts/third-party-licenses.mjs');
  const file = fs.readFileSync(path.join(__dirname, '..', 'THIRD_PARTY_LICENSES.txt'), 'utf8');
  assert.equal(file, render(), 'run: node scripts/third-party-licenses.mjs');
  for (const [name] of BUNDLED)
    assert.match(file, new RegExp('^' + name.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&') + ' ', 'm'));
});

test('both platforms ship the license files and the verifiers check them', () => {
  const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  const builder = read('electron-builder.yml');
  for (const f of ['to: LICENSE.txt', 'to: THIRD_PARTY_NOTICES.md', 'to: THIRD_PARTY_LICENSES.txt'])
    assert.ok(builder.indexOf(f) > 0 && builder.indexOf(f) < builder.indexOf('\nwin:'), f + ' must be top-level');
  assert.match(
    read('scripts/verify-package.cjs'),
    /'LICENSE\.txt', 'THIRD_PARTY_NOTICES\.md', 'THIRD_PARTY_LICENSES\.txt'/,
  );
  assert.match(read('scripts/Verify-Mac-Native.command'), /THIRD_PARTY_LICENSES\.txt:THIRD_PARTY_LICENSES\.txt/);
});
