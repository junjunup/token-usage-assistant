// Stage 3 release (D3): previous tag v1.8.0-beta.5 -> 1.8.0-beta.6.
// beta.6 adds no platform and no stored-format change: still 8 platforms, 7 with quota, DeepSeek balance.
// New in beta.6 (diagnostic log, credential retry, diagnostics export) writes nothing the old version reads.
module.exports = {
  from: ['1.8.0-beta.5'],
  to: '1.8.0-beta.6',
  oldVersionCheck: 'oldPackageRecognized',
  newVersionCheck: 'newPackageIs180Beta6',
  seedStage: '180beta5',
  loadStage: '180beta6',
  deepseekAccount: true,
  platforms: { check: 'eightPlatformCapabilitiesPresent', count: 8, quota: 7, deepseekBalance: true },
  rollbackLabel: '180Beta5',
  association: true,
};
