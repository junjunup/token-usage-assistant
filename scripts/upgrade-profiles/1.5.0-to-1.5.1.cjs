// Was scripts/verify-upgrade-1.5.1-native.cjs.
module.exports = {
  from: ['1.5.0'],
  to: '1.5.1',
  oldVersionCheck: 'oldPackageRecognized',
  newVersionCheck: 'newPackageIs151',
  seedStage: '130',
  loadStage: '140',
  deepseekAccount: false,
  platforms: { check: 'sixPlatformCapabilitiesPresent', count: 6, quota: 'all', deepseekBalance: false },
  rollbackLabel: '130',
  association: false,
};
