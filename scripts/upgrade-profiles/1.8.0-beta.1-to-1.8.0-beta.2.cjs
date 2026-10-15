// Was scripts/verify-upgrade-1.8-beta2-native.cjs.
module.exports = {
  from: ['1.8.0-beta.1'],
  to: '1.8.0-beta.2',
  oldVersionCheck: 'oldPackageRecognized',
  newVersionCheck: 'newPackageIs180Beta2',
  seedStage: '180beta1',
  loadStage: '180beta1',
  deepseekAccount: true,
  platforms: { check: 'sevenPlatformCapabilitiesPresent', count: 7, quota: 6, deepseekBalance: true },
  rollbackLabel: '170',
  association: true,
};
