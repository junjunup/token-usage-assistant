// Product wording release (T6.1–T6.3; D12): previous tag v1.9.0-beta.3 -> 1.9.0-beta.4.
// Still 8 platforms, 7 with quota, DeepSeek balance. No new preferences or stored formats (verification levels live
// in the registry; split notes add optional noteDetail / messageDetail fields, and a beta.3 snapshot without them
// still renders); the new build keeps preferences it does not know (T8.2), checked by newBuildKeepsUnknownPreferences.
module.exports = {
  from: ['1.9.0-beta.3'],
  to: '1.9.0-beta.4',
  oldVersionCheck: 'oldPackageRecognized',
  newVersionCheck: 'newPackageIs190Beta4',
  seedStage: '190beta3',
  loadStage: '190beta4',
  deepseekAccount: true,
  platforms: { check: 'eightPlatformCapabilitiesPresent', count: 8, quota: 7, deepseekBalance: true },
  rollbackLabel: '190Beta3',
  association: true,
  // Since beta.7 account history is in history.sqlite (T4.1): no history.json to compare.
  oldHistory: 'sqlite',
  unknownPreferencesKept: true,
};
