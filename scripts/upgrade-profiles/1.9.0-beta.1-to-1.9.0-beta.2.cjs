// Menu-bar follow-ups (T7.9–T7.12, T4.7): previous tag v1.9.0-beta.1 -> 1.9.0-beta.2.
// Still 8 platforms, 7 with quota, DeepSeek balance. No new preferences or stored files: the menu-bar selection,
// panel and render-timeout changes and the Harness plugin fix keep every stored format as in beta.1.
module.exports = {
  from: ['1.9.0-beta.1'],
  to: '1.9.0-beta.2',
  oldVersionCheck: 'oldPackageRecognized',
  newVersionCheck: 'newPackageIs190Beta2',
  seedStage: '190beta1',
  loadStage: '190beta2',
  deepseekAccount: true,
  platforms: { check: 'eightPlatformCapabilitiesPresent', count: 8, quota: 7, deepseekBalance: true },
  rollbackLabel: '190Beta1',
  association: true,
  // Since beta.7 account history is in history.sqlite (T4.1): no history.json to compare.
  oldHistory: 'sqlite',
};
