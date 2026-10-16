// Stage 5 release (D3): previous tag v1.8.0-beta.7 -> 1.8.0-beta.8.
// Still 8 platforms, 7 with quota, DeepSeek balance. beta.8 adds the updateCheck preference (default on); the
// verifier keeps every old preference exactly and expects new ones at their defaults.
module.exports = {
  from: ['1.8.0-beta.7'],
  to: '1.8.0-beta.8',
  oldVersionCheck: 'oldPackageRecognized',
  newVersionCheck: 'newPackageIs180Beta8',
  seedStage: '180beta7',
  loadStage: '180beta8',
  deepseekAccount: true,
  platforms: { check: 'eightPlatformCapabilitiesPresent', count: 8, quota: 7, deepseekBalance: true },
  rollbackLabel: '180Beta7',
  association: true,
  // beta.7 keeps account history in history.sqlite (T4.1): it writes no history.json to compare.
  oldHistory: 'sqlite',
};
