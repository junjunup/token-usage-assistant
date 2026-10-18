// After the v1.9.0-beta.1 tag: previous tag v1.9.0-beta.1 -> builds that keep the version (stage 6 work before
// the next bump). Still 8 platforms, 7 with quota, DeepSeek balance. Added together with the bump (T7.8) so the
// first Release run after the tag does not fail on a missing same-version profile.
// When the version is bumped (1.9.0-beta.2), add a 1.9.0-beta.1-to-1.9.0-beta.2 profile (also oldHistory: 'sqlite').
module.exports = {
  from: ['1.9.0-beta.1'],
  to: '1.9.0-beta.1',
  oldVersionCheck: 'oldPackageRecognized',
  newVersionCheck: 'newPackageIs190Beta1',
  seedStage: '190beta1',
  loadStage: '190beta1',
  deepseekAccount: true,
  platforms: { check: 'eightPlatformCapabilitiesPresent', count: 8, quota: 7, deepseekBalance: true },
  rollbackLabel: '190Beta1',
  association: true,
  // Since beta.7 account history is in history.sqlite (T4.1): no history.json to compare.
  oldHistory: 'sqlite',
};
