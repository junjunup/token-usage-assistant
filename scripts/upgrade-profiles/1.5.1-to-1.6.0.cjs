// Was scripts/verify-upgrade-1.6-native.cjs.
module.exports = {
  from: ['1.5.1'],
  to: '1.6.0',
  oldVersionCheck: 'oldPackageRecognized',
  newVersionCheck: 'newPackageIs160',
  seedStage: '130',
  loadStage: '140',
  deepseekAccount: false,
  platforms: { check: 'sevenPlatformCapabilitiesPresent', count: 7, quota: 6, deepseekBalance: true },
  rollbackLabel: '130',
  association: false,
};
