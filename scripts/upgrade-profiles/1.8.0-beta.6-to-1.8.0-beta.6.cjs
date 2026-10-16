// Stage 4 baseline (D3 keeps the version at 1.8.0-beta.6 until stage 4 ends): previous tag v1.8.0-beta.6 -> current
// main. Still 8 platforms, 7 with quota, DeepSeek balance. T4.1 moves account history into history.sqlite; the old
// history.json must stay byte-identical so the beta.6 rollback can still read it.
// When the version is bumped (beta.7), add a 1.8.0-beta.6-to-1.8.0-beta.7 profile.
module.exports = {
  from: ['1.8.0-beta.6'],
  to: '1.8.0-beta.6',
  oldVersionCheck: 'oldPackageRecognized',
  newVersionCheck: 'newPackageIs180Beta6',
  seedStage: '180beta6',
  loadStage: '180beta6',
  deepseekAccount: true,
  platforms: { check: 'eightPlatformCapabilitiesPresent', count: 8, quota: 7, deepseekBalance: true },
  rollbackLabel: '180Beta6',
  association: true,
};
