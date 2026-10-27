// After the v1.9.0-beta.5 tag: previous tag v1.9.0-beta.5 -> builds that keep the version (work before the next
// bump). Still 8 platforms, 7 with quota, DeepSeek balance. Added together with the bump so the first Release run
// after the tag does not fail on a missing same-version profile.
// When the version is bumped (1.9.0-beta.6), add a 1.9.0-beta.5-to-1.9.0-beta.6 profile (also oldHistory: 'sqlite'
// and unknownPreferencesKept: true).
module.exports = {
  from: ['1.9.0-beta.5'],
  to: '1.9.0-beta.5',
  oldVersionCheck: 'oldPackageRecognized',
  newVersionCheck: 'newPackageIs190Beta5',
  seedStage: '190beta5',
  loadStage: '190beta5',
  deepseekAccount: true,
  platforms: { check: 'eightPlatformCapabilitiesPresent', count: 8, quota: 7, deepseekBalance: true },
  rollbackLabel: '190Beta5',
  association: true,
  // Since beta.7 account history is in history.sqlite (T4.1): no history.json to compare.
  oldHistory: 'sqlite',
  unknownPreferencesKept: true,
};
