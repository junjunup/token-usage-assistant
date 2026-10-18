// Stage 6 baseline (D3 keeps the version at 1.8.0-beta.8 until stage 6 ends): previous tag v1.8.0-beta.8 -> current
// main. Still 8 platforms, 7 with quota, DeepSeek balance.
// The next version became 1.9.0-beta.1 (D3 adjusted 2026-10-18, menu-bar first version): see
// 1.8.0-beta.8-to-1.9.0-beta.1.cjs.
module.exports = {
  from: ['1.8.0-beta.8'],
  to: '1.8.0-beta.8',
  oldVersionCheck: 'oldPackageRecognized',
  newVersionCheck: 'newPackageIs180Beta8',
  seedStage: '180beta8',
  loadStage: '180beta8',
  deepseekAccount: true,
  platforms: { check: 'eightPlatformCapabilitiesPresent', count: 8, quota: 7, deepseekBalance: true },
  rollbackLabel: '180Beta8',
  association: true,
  // Since beta.7 account history is in history.sqlite (T4.1): no history.json to compare.
  oldHistory: 'sqlite',
};
