// Was scripts/verify-upgrade-native.cjs.
module.exports = {
  from: ['1.3.0'],
  to: '1.4.0',
  oldVersionCheck: 'oldPackageIs130',
  newVersionCheck: 'newPackageIs140',
  seedStage: '130',
  loadStage: '140',
  deepseekAccount: false,
  platforms: { check: 'fourPlatformCapabilitiesPresent', count: 4, quota: 'all', deepseekBalance: false },
  rollbackLabel: '130',
  association: false,
};
