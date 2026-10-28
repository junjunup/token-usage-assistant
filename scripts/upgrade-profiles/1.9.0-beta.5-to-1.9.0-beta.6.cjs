// More platforms (T10.1, T10.2; D16): previous tag v1.9.0-beta.5 -> 1.9.0-beta.6.
// 10 platforms: Kimi (balance) and OpenRouter (key limits, a quota kind) are added, so 8 with quota; DeepSeek balance
// unchanged. No new preferences or stored formats for existing accounts; the new build keeps preferences it does not
// know (T8.2), checked by newBuildKeepsUnknownPreferences.
module.exports = {
  from: ['1.9.0-beta.5'],
  to: '1.9.0-beta.6',
  oldVersionCheck: 'oldPackageRecognized',
  newVersionCheck: 'newPackageIs190Beta6',
  seedStage: '190beta5',
  loadStage: '190beta6',
  deepseekAccount: true,
  platforms: { check: 'tenPlatformCapabilitiesPresent', count: 10, quota: 8, deepseekBalance: true },
  rollbackLabel: '190Beta5',
  association: true,
  // Since beta.7 account history is in history.sqlite (T4.1): no history.json to compare.
  oldHistory: 'sqlite',
  unknownPreferencesKept: true,
};
