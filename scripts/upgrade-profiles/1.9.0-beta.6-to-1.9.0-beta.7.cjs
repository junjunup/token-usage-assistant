// Stages 11-14: previous tag v1.9.0-beta.6 -> 1.9.0-beta.7. 15 platforms (T13.3 added SiliconFlow, StepFun, ZenMux and
// its balance; 10 with quota), DeepSeek balance. New preferences since beta.6 (setupWizard, trayPinHint, statusExport,
// balance reminders, providerStatus, language…) have defaults, so beta.6 settings load unchanged; the new build keeps
// preferences it does not know (T8.2).
module.exports = {
  from: ['1.9.0-beta.6'],
  to: '1.9.0-beta.7',
  oldVersionCheck: 'oldPackageRecognized',
  newVersionCheck: 'newPackageIs190Beta7',
  seedStage: '190beta6',
  loadStage: '190beta7',
  deepseekAccount: true,
  platforms: { check: 'fifteenPlatformCapabilitiesPresent', count: 15, quota: 10, deepseekBalance: true },
  rollbackLabel: '190Beta6',
  association: true,
  // Since beta.7 account history is in history.sqlite (T4.1): no history.json to compare.
  oldHistory: 'sqlite',
  unknownPreferencesKept: true,
};
