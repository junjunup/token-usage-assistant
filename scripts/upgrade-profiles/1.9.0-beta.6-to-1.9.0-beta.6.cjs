// After the v1.9.0-beta.6 tag: previous tag v1.9.0-beta.6 -> builds that keep the version (work before the next
// bump). 10 platforms, 8 with quota, DeepSeek balance. Added together with the bump so the first Release run after
// the tag does not fail on a missing same-version profile.
// When the version is bumped (1.9.0-beta.7), add a 1.9.0-beta.6-to-1.9.0-beta.7 profile (also oldHistory: 'sqlite'
// and unknownPreferencesKept: true).
module.exports = {
  from: ['1.9.0-beta.6'],
  to: '1.9.0-beta.6',
  oldVersionCheck: 'oldPackageRecognized',
  newVersionCheck: 'newPackageIs190Beta6',
  seedStage: '190beta6',
  loadStage: '190beta6',
  deepseekAccount: true,
  platforms: { check: 'tenPlatformCapabilitiesPresent', count: 10, quota: 8, deepseekBalance: true },
  rollbackLabel: '190Beta6',
  association: true,
  // Since beta.7 account history is in history.sqlite (T4.1): no history.json to compare.
  oldHistory: 'sqlite',
  unknownPreferencesKept: true,
};
