const test = require('node:test');
const assert = require('node:assert/strict');
const { wingetManifests, scoopManifest, parseSums, ID } = require('../scripts/distribution-manifests.cjs');

// T11.7 (D17 ②): manifests point at the public installer repository and carry the release's own hashes.
const sha = 'ab'.repeat(32);

test('T11.7: winget manifests — per-user NSIS Setup from the installer repository, upper-case hash, three types', () => {
  const files = wingetManifests({ version: '1.9.0', setupSha256: sha, releaseDate: '2026-11-02' });
  assert.deepEqual(Object.keys(files).sort(), [
    `${ID}.installer.yaml`,
    `${ID}.locale.en-US.yaml`,
    `${ID}.locale.zh-CN.yaml`,
    `${ID}.yaml`,
  ]);
  const installer = files[`${ID}.installer.yaml`];
  assert.match(installer, /InstallerType: nullsoft/);
  assert.match(installer, /Scope: user/);
  assert.match(
    installer,
    /InstallerUrl: https:\/\/github\.com\/junjunup\/TokenUsageAssistant\/releases\/download\/v1\.9\.0\/TokenUsageAssistant-Setup-1\.9\.0\.exe/,
  );
  assert.match(installer, new RegExp('InstallerSha256: ' + sha.toUpperCase()));
  assert.match(installer, /ReleaseDate: "2026-11-02"/);
  assert.match(files[`${ID}.yaml`], /DefaultLocale: zh-CN\nManifestType: version/);
  const zh = files[`${ID}.locale.zh-CN.yaml`];
  assert.match(zh, /ManifestType: defaultLocale/);
  assert.match(zh, /PackageName: "Token 用量助手"/);
  assert.match(zh, /License: MIT/);
  assert.match(files[`${ID}.locale.en-US.yaml`], /ManifestType: locale/);
  for (const text of Object.values(files)) assert.match(text, /PackageVersion: "1\.9\.0"/);
});

test('T11.7: Scoop manifest — the portable exe with its lower-case hash; checkver and autoupdate follow the releases', () => {
  const m = scoopManifest({ version: '1.9.0', portableSha256: sha.toUpperCase() });
  assert.equal(m.version, '1.9.0');
  assert.equal(m.license, 'MIT');
  assert.equal(
    m.architecture['64bit'].url,
    'https://github.com/junjunup/TokenUsageAssistant/releases/download/v1.9.0/TokenUsageAssistant-Portable-1.9.0.exe#/TokenUsageAssistant.exe',
  );
  assert.equal(m.architecture['64bit'].hash, sha);
  assert.match(m.autoupdate.architecture['64bit'].url, /v\$version\/TokenUsageAssistant-Portable-\$version\.exe/);
});

test('T11.7: hashes come from SHA256SUMS.txt; bad versions, hashes and dates are refused', () => {
  const sums = parseSums(
    `${sha}  TokenUsageAssistant-Setup-1.9.0.exe\r\n${'cd'.repeat(32)} *TokenUsageAssistant-Portable-1.9.0.exe\nnot a line\n`,
  );
  assert.deepEqual(sums, {
    'TokenUsageAssistant-Setup-1.9.0.exe': sha,
    'TokenUsageAssistant-Portable-1.9.0.exe': 'cd'.repeat(32),
  });
  assert.throws(() => wingetManifests({ version: '1.9', setupSha256: sha }));
  assert.throws(() => wingetManifests({ version: '1.9.0', setupSha256: 'xyz' }));
  assert.throws(() => wingetManifests({ version: '1.9.0', setupSha256: sha, releaseDate: '2026/11/02' }));
  assert.throws(() => scoopManifest({ version: '1.9.0"; rm', portableSha256: sha }));
});
