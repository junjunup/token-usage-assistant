// After the v1.9.0-beta.2 tag: previous tag v1.9.0-beta.2 -> builds that keep the version (work before the next
// bump). Still 8 platforms, 7 with quota, DeepSeek balance. Added together with the bump so the first Release run
// after the tag does not fail on a missing same-version profile.
// When the version is bumped (1.9.0-beta.3), add a 1.9.0-beta.2-to-1.9.0-beta.3 profile (also oldHistory: 'sqlite').
module.exports = {
  from: ['1.9.0-beta.2'],
  to: '1.9.0-beta.2',
  oldVersionCheck: 'oldPackageRecognized',
  newVersionCheck: 'newPackageIs190Beta2',
  seedStage: '190beta2',
  loadStage: '190beta2',
  deepseekAccount: true,
  platforms: { check: 'eightPlatformCapabilitiesPresent', count: 8, quota: 7, deepseekBalance: true },
  rollbackLabel: '190Beta2',
  association: true,
  // Since beta.7 account history is in history.sqlite (T4.1): no history.json to compare.
  oldHistory: 'sqlite',
  // T8.2: builds after the tag keep preferences they do not know; check it on every branch build from now on.
  unknownPreferencesKept: true,
};
