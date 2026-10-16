// Stage 5 baseline (D3 keeps the version at 1.8.0-beta.7 until stage 5 ends): previous tag v1.8.0-beta.7 -> current
// main. Still 8 platforms, 7 with quota, DeepSeek balance.
// When the version is bumped (beta.8), add a 1.8.0-beta.7-to-1.8.0-beta.8 profile (also with oldHistory: 'sqlite').
module.exports = {
  from: ['1.8.0-beta.7'],
  to: '1.8.0-beta.7',
  oldVersionCheck: 'oldPackageRecognized',
  newVersionCheck: 'newPackageIs180Beta7',
  seedStage: '180beta7',
  loadStage: '180beta7',
  deepseekAccount: true,
  platforms: { check: 'eightPlatformCapabilitiesPresent', count: 8, quota: 7, deepseekBalance: true },
  rollbackLabel: '180Beta7',
  association: true,
  // beta.7 keeps account history in history.sqlite (T4.1): it writes no history.json to compare.
  oldHistory: 'sqlite',
};
