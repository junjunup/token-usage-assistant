// Was scripts/verify-upgrade-1.7-native.cjs.
module.exports = {
  from: ['1.6.0'],
  to: '1.7.0',
  oldVersionCheck: 'oldPackageRecognized',
  newVersionCheck: 'newPackageIs170',
  seedStage: '160',
  loadStage: '170',
  deepseekAccount: true,
  platforms: { check: 'sevenPlatformCapabilitiesPresent', count: 7, quota: 6, deepseekBalance: true },
  rollbackLabel: '160',
  association: true,
};
