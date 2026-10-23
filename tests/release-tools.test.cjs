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
