// Was scripts/verify-upgrade-1.5-native.cjs (accepted 1.3.0, 1.4.0 and 1.4.1 as the old package).
module.exports = {
  from: ['1.3.0', '1.4.0', '1.4.1'],
  to: '1.5.0',
  oldVersionCheck: 'oldPackageRecognized',
  newVersionCheck: 'newPackageIs150',
  seedStage: '130',
  loadStage: '140',
  deepseekAccount: false,
  platforms: { check: 'sixPlatformCapabilitiesPresent', count: 6, quota: 'all', deepseekBalance: false },
  rollbackLabel: '130',
  association: false,
};
