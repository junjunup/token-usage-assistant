// Open source and growth release (T9.1–T9.15; D14, D15): previous tag v1.9.0-beta.4 -> 1.9.0-beta.5.
// Still 8 platforms, 7 with quota, DeepSeek balance. No new preferences or account formats; tool sources gain an
// optional field-name fingerprint (T9.14) that a beta.4 source without it does not need. The new build keeps
// preferences it does not know (T8.2), checked by newBuildKeepsUnknownPreferences.
module.exports = {
  from: ['1.9.0-beta.4'],
  to: '1.9.0-beta.5',
  oldVersionCheck: 'oldPackageRecognized',
  newVersionCheck: 'newPackageIs190Beta5',
  seedStage: '190beta4',
  loadStage: '190beta5',
  deepseekAccount: true,
  platforms: { check: 'eightPlatformCapabilitiesPresent', count: 8, quota: 7, deepseekBalance: true },
  rollbackLabel: '190Beta4',
  association: true,
  // Since beta.7 account history is in history.sqlite (T4.1): no history.json to compare.
  oldHistory: 'sqlite',
  unknownPreferencesKept: true,
};
