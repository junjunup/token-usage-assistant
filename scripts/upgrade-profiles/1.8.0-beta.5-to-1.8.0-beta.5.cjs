// Stage 1-2 baseline (D3 keeps the version at 1.8.0-beta.5): previous tag v1.8.0-beta.5 -> current main.
// beta.5 added OpenCode Go: 8 platforms, 7 with quota, DeepSeek balance.
// When the version is bumped (beta.6), add a 1.8.0-beta.5-to-1.8.0-beta.6 profile.
module.exports = {
  from: ['1.8.0-beta.5'],
  to: '1.8.0-beta.5',
  oldVersionCheck: 'oldPackageRecognized',
  newVersionCheck: 'newPackageIs180Beta5',
  seedStage: '180beta5',
  loadStage: '180beta5',
  deepseekAccount: true,
  platforms: { check: 'eightPlatformCapabilitiesPresent', count: 8, quota: 7, deepseekBalance: true },
  rollbackLabel: '180Beta5',
  association: true,
};
