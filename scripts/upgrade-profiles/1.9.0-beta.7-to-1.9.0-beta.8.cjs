// Stages 16-17: previous tag v1.9.0-beta.7 -> 1.9.0-beta.8. Same 15 platforms (10 with quota), DeepSeek balance; the
// new preference since beta.7 (ignoredFound, T17.1) has a default, so beta.7 settings load unchanged; the new build
// keeps preferences it does not know (T8.2).
module.exports = {
  from: ['1.9.0-beta.7'],
  to: '1.9.0-beta.8',
  oldVersionCheck: 'oldPackageRecognized',
  newVersionCheck: 'newPackageIs190Beta8',
  seedStage: '190beta7',
  loadStage: '190beta8',
  deepseekAccount: true,
  platforms: { check: 'fifteenPlatformCapabilitiesPresent', count: 15, quota: 10, deepseekBalance: true },
  rollbackLabel: '190Beta7',
  association: true,
  // Since beta.7 account history is in history.sqlite (T4.1): no history.json to compare.
  oldHistory: 'sqlite',
  unknownPreferencesKept: true,
};
