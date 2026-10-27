// T8.10: release helpers — the CHANGELOG section for the public notes, and the archive check.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { section } = require('../scripts/changelog-section.cjs');
const { checkRelease, installers, REPORTS } = require('../scripts/archive-release.cjs');

test('changelog section: the version heading up to the next one, or null', () => {
  const text =
    '# 更新日志\n\n## 未发布\n\n- x\n\n## 1.9.0-beta.3（2026-10-30，稳固版）\n\n- a\n- b\n\n## 1.9.0-beta.2（2026-10-23）\n\n- c\n';
  assert.equal(section(text, '1.9.0-beta.3'), '- a\n- b');
  assert.equal(section(text, '1.9.0-beta.2'), '- c');
  assert.equal(section(text, '1.9.0-beta'), null, 'a prefix is not a match');
  assert.equal(section(text, '2.0.0'), null);
  assert.ok(section(fs.readFileSync(path.join(__dirname, '..', 'CHANGELOG.md'), 'utf8'), '1.9.0-beta.2'));
});

test('archive check: installer hashes must be in the CI reports and every report must match the version', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tua-archive-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const v = '1.9.0-beta.9';
  const hashes = installers(v).map((f, i) => {
    fs.writeFileSync(path.join(dir, f), 'installer ' + i);
    return crypto
      .createHash('sha256')
      .update('installer ' + i)
      .digest('hex');
  });
  const write = (f, value) => fs.writeFileSync(path.join(dir, f), JSON.stringify(value));
  write('mac-app-integrity.json', { ok: true, version: v, artifacts: [hashes[2], hashes[3]] });
  write('package-integrity.json', { ok: true, version: v, files: [hashes[0], hashes[1]] });
  write('smoke-result-windows.json', { ok: true, version: v });
  write('upgrade-native-report.json', { status: 'passed', toVersion: v });
  assert.deepEqual(checkRelease(dir, v).problems, []);
  write('upgrade-native-report.json', { status: 'failed', toVersion: v });
  write('package-integrity.json', { ok: true, version: v, files: [hashes[0]] });
  const { problems } = checkRelease(dir, v);
  assert.ok(problems.some((p) => /upgrade-native-report/.test(p)));
  assert.ok(problems.some((p) => p.includes(installers(v)[1])));
  fs.rmSync(path.join(dir, REPORTS[2]));
  assert.ok(checkRelease(dir, v).problems.some((p) => p.includes('smoke-result-windows.json')));
});

// T9.10: the installer repository README (kept in docs/installer-repo/, pushed with each release) and the public
// notes template stay aligned with the source READMEs: same screenshots, same install and privacy docs, both languages.
test('installer README and public notes stay aligned with the source READMEs', () => {
  const root = path.join(__dirname, '..');
  const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
  const installer = read('docs/installer-repo/README.md');
  const raw = 'https://raw.githubusercontent.com/junjunup/token-usage-assistant/main/';
  const shots = [...installer.matchAll(/(?:src|srcset)="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(shots.length, 2);
  for (const url of shots) {
    assert.ok(url.startsWith(raw), url);
    const file = url.slice(raw.length);
    assert.ok(fs.existsSync(path.join(root, file)), file);
    for (const readme of ['README.md', 'README.en.md'])
      assert.ok(read(readme).includes(`"${file}"`), `${readme}: ${file}`);
  }
  const blob = 'https://github.com/junjunup/token-usage-assistant/blob/main/';
  for (const doc of [
    'docs/INSTALL.md',
    'docs/INSTALL.md#english',
    'docs/PRIVACY.md',
    'docs/PRIVACY.md#english',
    'SECURITY.md',
  ]) {
    assert.ok(installer.includes(`${blob}${doc})`), doc);
  }
  for (const anchor of ['## 中文', '## English']) assert.ok(read('docs/INSTALL.md').includes(anchor), anchor);
  assert.ok(
    installer.includes('## English') && installer.includes('Chinese only'),
    'English section says the UI is Chinese only',
  );
  const notes = read('.github/workflows/publish.yml');
  assert.ok(notes.includes(`${blob}docs/INSTALL.md\n`) && notes.includes(`${blob}docs/INSTALL.md#english`));
  assert.ok(notes.includes('https://github.com/junjunup/token-usage-assistant\n'), 'notes link the source repository');
});
