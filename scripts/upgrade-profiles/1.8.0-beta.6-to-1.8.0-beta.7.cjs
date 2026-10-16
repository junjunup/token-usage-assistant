// Stage 4 release (D3): previous tag v1.8.0-beta.6 -> 1.8.0-beta.7.
// Still 8 platforms, 7 with quota, DeepSeek balance. beta.7 moves account history into history.sqlite and leaves
// history.json byte-identical, so the beta.6 rollback can still read it (with history up to the upgrade).
module.exports = {
  from: ['1.8.0-beta.6'],
  to: '1.8.0-beta.7',
  oldVersionCheck: 'oldPackageRecognized',
  newVersionCheck: 'newPackageIs180Beta7',
  seedStage: '180beta6',
  loadStage: '180beta7',
  deepseekAccount: true,
  platforms: { check: 'eightPlatformCapabilitiesPresent', count: 8, quota: 7, deepseekBalance: true },
  rollbackLabel: '180Beta6',
  association: true,
};
