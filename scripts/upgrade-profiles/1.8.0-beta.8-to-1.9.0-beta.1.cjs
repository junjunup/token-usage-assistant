// Menu-bar first version (T7.3–T7.8; D3 adjusted 2026-10-18): previous tag v1.8.0-beta.8 -> 1.9.0-beta.1.
// Still 8 platforms, 7 with quota, DeepSeek balance. 1.9.0-beta.1 adds four macOS menu-bar preferences
// (menubarForm, menubarUsage, menubarAlertColor, panelProtect); the verifier keeps every old preference exactly and
// expects the new ones at their defaults.
module.exports = {
  from: ['1.8.0-beta.8'],
  to: '1.9.0-beta.1',
  oldVersionCheck: 'oldPackageRecognized',
  newVersionCheck: 'newPackageIs190Beta1',
  seedStage: '180beta8',
  loadStage: '190beta1',
  deepseekAccount: true,
  platforms: { check: 'eightPlatformCapabilitiesPresent', count: 8, quota: 7, deepseekBalance: true },
  rollbackLabel: '180Beta8',
  association: true,
  // beta.8 keeps account history in history.sqlite (T4.1): it writes no history.json to compare.
  oldHistory: 'sqlite',
};
