// Stabilisation release (T8.1–T8.7, T8.10; D12): previous tag v1.9.0-beta.2 -> 1.9.0-beta.3.
// Still 8 platforms, 7 with quota, DeepSeek balance. No new preferences or stored formats; the new build keeps
// preferences it does not know (T8.2), checked by newBuildKeepsUnknownPreferences.
module.exports = {
  from: ['1.9.0-beta.2'],
  to: '1.9.0-beta.3',
  oldVersionCheck: 'oldPackageRecognized',
  newVersionCheck: 'newPackageIs190Beta3',
  seedStage: '190beta2',
  loadStage: '190beta3',
  deepseekAccount: true,
  platforms: { check: 'eightPlatformCapabilitiesPresent', count: 8, quota: 7, deepseekBalance: true },
  rollbackLabel: '190Beta2',
  association: true,
  // Since beta.7 account history is in history.sqlite (T4.1): no history.json to compare.
  oldHistory: 'sqlite',
  unknownPreferencesKept: true,
};
