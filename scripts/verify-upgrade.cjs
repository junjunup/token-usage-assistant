// Packaged-module upgrade verifier (replaces the per-version verify-upgrade*-native.cjs scripts).
// Version-specific expectations live in scripts/upgrade-profiles/<from>-to-<to>.cjs.
//
// Run with Electron on Windows, never Node: this verifies actual Windows safeStorage (DPAPI) and packaged modules.
//   electron scripts/verify-upgrade.cjs --old-asar=<absolute app.asar> --new-asar=<absolute app.asar>
//     --test-directory=<new project/work child> [--profile=<name>]
// Without --profile, the profile is chosen from the two package versions.
// List the planned checks of a profile (plain Node, no Electron):
//   node scripts/verify-upgrade.cjs --list-checks --profile=<name>
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const projectRoot = path.resolve(__dirname, '..'),
  workRoot = path.join(projectRoot, 'work'),
  profileRoot = path.join(__dirname, 'upgrade-profiles');
const option = (name) => process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const loadProfile = (name) => ({ name, ...require(path.join(profileRoot, name + '.cjs')) });
const profileNames = () =>
  fs
    .readdirSync(profileRoot)
    .filter((file) => file.endsWith('.cjs'))
    .map((file) => file.slice(0, -4))
    .sort();
const accountWord = (profile) => (profile.deepseekAccount ? 'Five' : 'Four');

// The ordered check names a profile runs. A real run fails if the executed checks differ from this list.
function plannedChecks(profile) {
  return [
    profile.oldVersionCheck,
    profile.newVersionCheck,
    'nativeSafeStorageAvailable',
    `oldVaultDecrypts${accountWord(profile)}Accounts`,
    'oldPricesHaveImplicitUSD',
    'vaultContainsNoPlaintextSyntheticCredentials',
    'preferencesAndWindowBoundsPreserved',
    'nativeVaultStillDecrypts',
    `all${accountWord(profile)}AccountsAndSelectionPreserved`,
    'cachedSnapshotsAndHistoryLoaded',
    'legacySourceMigratedIndependently',
    'storedLegacyPriceRatesPreserved',
    'packagedWorkerAnalyzesMigratedSource',
    'reportPricesGainExplicitUSD',
    'estimateUsesOriginalUSDRates',
    'toolDataNotAttributedToSelectedAccount',
    'legacyZcodeQueryStillWorks',
    profile.platforms.check,
    'existingFilesRemainByteIdentical',
    `${profile.rollbackLabel}RollbackCanReadVaultAndSettings`,
    `${profile.rollbackLabel}RollbackCanReadLegacySourceAndPrice`,
    ...(profile.association
      ? [
          'upgradeDoesNotAutoAssociate',
          'manualAssociationWorksAfterUpgrade',
          'associationConfigurationSurvivesRestart',
          'newMetadataDoesNotAffectOldVault',
        ]
      : []),
    'noNetworkRequests',
    'isolatedUserDataOnly',
  ];
}

if (process.argv.includes('--list-checks')) {
  const name = option('profile');
  if (!name) {
    console.log(JSON.stringify(profileNames()));
  } else {
    console.log(JSON.stringify(plannedChecks(loadProfile(name))));
  }
  process.exit(0);
}

const { app, safeStorage } = require('electron');
const originalFs = require('original-fs');
const { DatabaseSync } = require('node:sqlite');
function requiredAbsolute(name) {
  const value = option(name);
  if (!value || !path.isAbsolute(value)) throw new Error(`Missing absolute --${name}`);
  return path.resolve(value);
}
let directory, oldAsar, newAsar;
try {
  if (process.platform !== 'win32' || !process.versions.electron) throw new Error('Windows Electron is required');
  oldAsar = requiredAbsolute('old-asar');
  newAsar = requiredAbsolute('new-asar');
  directory = requiredAbsolute('test-directory');
  if (
    oldAsar === newAsar ||
    ![oldAsar, newAsar].every((file) => path.extname(file) === '.asar' && originalFs.statSync(file).isFile())
  )
    throw new Error('Distinct packaged ASAR files are required');
  const relative = path.relative(workRoot, directory);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative) || fs.existsSync(directory))
    throw new Error('Test directory must be a new isolated child of project/work');
  fs.mkdirSync(directory, { recursive: true });
  const isolatedRoot = path.join(directory, 'isolated-electron');
  fs.mkdirSync(isolatedRoot);
  app.setPath('userData', isolatedRoot);
  app.setPath('sessionData', isolatedRoot);
  app.setAppLogsPath(path.join(isolatedRoot, 'logs'));
  app.setName('TokenUsageAssistantUpgradeVerifier');
} catch {
  console.error(
    'Upgrade verifier requires Windows Electron, two packaged ASAR files, and a new isolated project/work directory.',
  );
  app.exit(2);
}

const report = {
  kind: 'native-packaged-module-upgrade',
  syntheticOnly: true,
  profile: null,
  fromVersion: null,
  toVersion: null,
  platform: process.platform,
  electron: process.versions.electron,
  startedAt: new Date().toISOString(),
  checks: {},
  limitations: [
    'Does not install or execute the NSIS installer.',
    'Does not validate system login startup or a physical reboot.',
    'Does not read or modify real user accounts, app data, billing records, or tool logs.',
  ],
};
const output = () => path.join(directory, 'upgrade-native-report.json');
const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const check = (name, condition) => {
  report.checks[name] = !!condition;
  if (!condition) throw new Error(name);
};
let profile = null;
let stage = 'ready',
  oldAccounts,
  newAccounts,
  tools,
  networkCalls = 0;
const noNetworkClient = () => ({
  usage: async () => {
    networkCalls++;
    throw new Error('Synthetic verifier never makes network requests');
  },
  summary: async () => {
    networkCalls++;
    throw new Error('Synthetic verifier never makes network requests');
  },
});
const load = (asar, file) => require(path.join(asar, file));
const watchdog = setTimeout(() => {
  report.status = 'failed';
  report.failedStage = 'watchdog';
  report.finishedAt = new Date().toISOString();
  try {
    fs.writeFileSync(output(), JSON.stringify(report, null, 2));
  } catch {}
  app.exit(1);
}, 60000);

app
  .whenReady()
  .then(async () => {
    stage = 'version-and-encryption';
    report.fromVersion = load(oldAsar, 'package.json').version;
    report.toVersion = load(newAsar, 'package.json').version;
    const requested = option('profile');
    profile = requested
      ? loadProfile(requested)
      : profileNames()
          .map(loadProfile)
          .find((candidate) => candidate.from.includes(report.fromVersion) && candidate.to === report.toVersion);
    if (!profile) {
      report.missingProfile = `${report.fromVersion}-to-${report.toVersion}`;
      throw new Error('missingProfile');
    }
    report.profile = profile.name;
    check(profile.oldVersionCheck, profile.from.includes(report.fromVersion));
    check(profile.newVersionCheck, report.toVersion === profile.to);
    check('nativeSafeStorageAvailable', safeStorage.isEncryptionAvailable());
    const archiveHash = (file) => crypto.createHash('sha256').update(originalFs.readFileSync(file)).digest('hex');
    report.packages = { oldAsarSha256: archiveHash(oldAsar), newAsarSha256: archiveHash(newAsar) };

    stage = `seed-with-packaged-${profile.seedStage}`;
    const oldStoreModule = load(oldAsar, 'desktop/store.cjs'),
      oldDomain = load(oldAsar, 'desktop/domain.cjs'),
      oldAccountModule = load(oldAsar, 'desktop/accounts.cjs'),
      oldAnalyticsModule = load(oldAsar, 'desktop/analytics-service.cjs'),
      oldCore = load(oldAsar, 'desktop/analytics-core.cjs');
    const dataRoot = path.join(directory, 'synthetic-user-data'),
      oldStore = new oldStoreModule.LocalStore(dataRoot, safeStorage),
      now = Date.now();
    const accounts = [
      {
        id: 'legacy-commandcode',
        provider: 'commandcode',
        region: 'global',
        label: 'Synthetic Command Code',
        orgId: 'synthetic-org',
        credential: { apiKey: 'synthetic-commandcode-upgrade-only' },
      },
      {
        id: crypto.randomUUID(),
        provider: 'glm',
        region: 'cn',
        label: 'Synthetic GLM',
        orgId: '',
        credential: { apiKey: 'synthetic-glm-upgrade-only' },
      },
      {
        id: crypto.randomUUID(),
        provider: 'minimax',
        region: 'cn',
        label: 'Synthetic MiniMax',
        orgId: '',
        credential: { apiKey: 'synthetic-minimax-upgrade-only' },
      },
      {
        id: crypto.randomUUID(),
        provider: 'volcengine',
        region: 'cn-beijing',
        label: 'Synthetic Volcengine',
        orgId: '',
        credential: { accessKeyId: 'synthetic-volcengine-access-only', secretKey: 'synthetic-volcengine-secret-only' },
      },
      ...(profile.deepseekAccount
        ? [
            {
              id: crypto.randomUUID(),
              provider: 'deepseek',
              region: 'global',
              label: 'Synthetic DeepSeek',
              orgId: '',
              credential: { apiKey: 'synthetic-deepseek-upgrade-only' },
            },
          ]
        : []),
    ];
    const vault = { activeId: accounts[0].id, accounts };
    oldStore.saveAccounts(vault);
    const preferences = oldDomain.patchSettings(oldDomain.DEFAULT_SETTINGS, {
      theme: 'dark',
      refreshSeconds: 120,
      threshold: 30,
      floating: true,
      pinned: false,
      notifications: false,
      launchAtLogin: false,
      widgetExpanded: true,
    });
    const bounds = {
      main: { x: 70, y: 90, width: 1040, height: 800 },
      widget: { x: 1170, y: 110, width: 324, height: 552 },
    };
    oldStore.saveSettings(preferences, bounds);
    const dbFile = path.join(dataRoot, 'synthetic-zcode.sqlite'),
      db = new DatabaseSync(dbFile);
    db.exec(
      'CREATE TABLE model_usage(id TEXT PRIMARY KEY,session_id TEXT,started_at INTEGER,model_id TEXT,provider_id TEXT,status TEXT,input_tokens INTEGER,output_tokens INTEGER,computed_total_tokens INTEGER,cache_read_input_tokens INTEGER,cache_creation_input_tokens INTEGER); CREATE TABLE session(id TEXT PRIMARY KEY,directory TEXT);',
    );
    db.prepare('INSERT INTO session VALUES(?,?)').run('synthetic-session', 'D:/Synthetic/upgrade-project');
    db.prepare('INSERT INTO model_usage VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(
      'synthetic-request',
      'synthetic-session',
      now - 1000,
      'synthetic-model',
      'synthetic-provider',
      'completed',
      100,
      20,
      120,
      40,
      10,
    );
    db.close();
    oldStoreModule.atomicWrite(oldStore.file('local-source.json'), { file: dbFile });
    const modelKey = oldCore.priceKey('synthetic-provider', 'synthetic-model'),
      price = { input: 1, output: 3, read: 0.1, write: 2 };
    oldStoreModule.atomicWrite(oldStore.file('local-pricing.json'), { [modelKey]: price });
    oldAccounts = new oldAccountModule.AccountManager({
      store: oldStore,
      settings: preferences,
      clientFactory: noNetworkClient,
    });
    oldAccounts.load();
    check(
      `oldVaultDecrypts${accountWord(profile)}Accounts`,
      !oldAccounts.issue && oldAccounts.entries.length === accounts.length && equal(oldStore.accounts(), vault),
    );
    const sample = {
      parts: {
        summary: oldDomain.normalizeSummary(
          {
            totalTokensIn: 100,
            totalTokensOut: 20,
            totalTokens: 120,
            totalCount: 1,
            completedCount: 1,
            failedCount: 0,
            totalCost: 0.01,
          },
          now - 86400000,
        ),
        credits: oldDomain.normalizeCredits({
          credits: { monthlyCredits: 18, purchasedCredits: 3, freeCredits: 1 },
          windowLimits: {
            limited: true,
            fiveHour: { used: 10, cap: 100, resetAt: now + 3600000 },
            weekly: { used: 20, cap: 100, resetAt: now + 86400000 },
          },
        }),
      },
      updatedAt: { summary: now - 1000, credits: now - 1000 },
      alerts: {},
    };
    for (const runtime of oldAccounts.runtimes.values()) {
      const saved =
        runtime.entry.provider === 'deepseek'
          ? {
              parts: {
                balance: {
                  isAvailable: true,
                  balances: [{ currency: 'CNY', total: '10.000001', granted: '0.000001', toppedUp: '10' }],
                },
              },
              updatedAt: { balance: now },
              alerts: {},
            }
          : sample;
      runtime.scoped.saveCache(runtime.hash, saved);
      runtime.history.append(sample);
    }
    const oldAnalytics = new oldAnalyticsModule.AnalyticsService({
      store: oldStore,
      monitor: oldAccounts.active.monitor,
      history: oldAccounts.active.history,
      client: noNetworkClient(),
      now: () => now,
    });
    check(
      'oldPricesHaveImplicitUSD',
      equal(oldAnalytics.prices[modelKey], price) && !Object.hasOwn(oldAnalytics.prices[modelKey], 'currency'),
    );
    // Old builds up to 1.8.0-beta.6 keep history in history.json; from beta.7 (T4.1) it lives in history.sqlite,
    // which is not compared byte for byte (WAL) and is covered by cachedSnapshotsAndHistoryLoaded instead.
    const jsonHistory = profile.oldHistory !== 'sqlite';
    const preservedFiles = [
      'accounts.encrypted.json',
      'settings.json',
      'local-source.json',
      'local-pricing.json',
      'snapshot.json',
      ...(jsonHistory ? ['history.json'] : []),
      ...accounts
        .slice(1)
        .flatMap((entry) => [
          `accounts/${entry.id}/snapshot.json`,
          ...(jsonHistory ? [`accounts/${entry.id}/history.json`] : []),
        ]),
    ];
    const before = Object.fromEntries(preservedFiles.map((name) => [name, hash(oldStore.file(name))]));
    const encrypted = fs.readFileSync(oldStore.file('accounts.encrypted.json'), 'utf8');
    check(
      'vaultContainsNoPlaintextSyntheticCredentials',
      !accounts.some((entry) => Object.values(entry.credential).some((value) => encrypted.includes(value))),
    );
    oldAccounts.dispose();
    oldAccounts = null;

    stage = `load-with-packaged-${profile.loadStage}`;
    const newStoreModule = load(newAsar, 'desktop/store.cjs'),
      { AccountManager } = load(newAsar, 'desktop/accounts.cjs'),
      { AnalyticsService } = load(newAsar, 'desktop/analytics-service.cjs'),
      { ToolSources } = load(newAsar, 'desktop/tool-sources.cjs'),
      { PROVIDERS } = load(newAsar, 'desktop/provider-catalog.cjs');
    const newStore = new newStoreModule.LocalStore(dataRoot, safeStorage),
      settings = newStore.settings();
    check(
      'preferencesAndWindowBoundsPreserved',
      equal(settings.preferences, preferences) && equal(settings.bounds, bounds),
    );
    check('nativeVaultStillDecrypts', equal(newStore.accounts(), vault));
    newAccounts = new AccountManager({
      store: newStore,
      settings: settings.preferences,
      clientFactory: noNetworkClient,
    });
    newAccounts.load();
    check(
      `all${accountWord(profile)}AccountsAndSelectionPreserved`,
      !newAccounts.issue &&
        newAccounts.entries.length === accounts.length &&
        newAccounts.activeId === vault.activeId &&
        equal(newAccounts.entries, accounts),
    );
    check(
      'cachedSnapshotsAndHistoryLoaded',
      [...newAccounts.runtimes.values()].every(
        (runtime) =>
          (runtime.entry.provider === 'deepseek'
            ? runtime.monitor.snapshot().parts.balance?.balances[0].total === '10.000001'
            : runtime.monitor.snapshot().parts.summary?.total === 120) &&
          runtime.history.records.length === 1 &&
          runtime.history.records[0].summary.total === 120,
      ),
    );
    const analytics = new AnalyticsService({
      store: newStore,
      monitor: newAccounts.active.monitor,
      history: newAccounts.active.history,
      client: noNetworkClient(),
      now: () => now,
    });
    tools = new ToolSources({ store: newStore, legacyFile: analytics.file, now: () => now });
    analytics.tools = tools;
    check(
      'legacySourceMigratedIndependently',
      tools.entries.length === 1 &&
        tools.entries[0].id === 'legacy-zcode' &&
        tools.entries[0].kind === 'zcode' &&
        tools.entries[0].file === dbFile &&
        tools.entries[0].enabled === true,
    );
    check('storedLegacyPriceRatesPreserved', equal(analytics.prices[modelKey], price));
    const result = await analytics.get({ source: 'tools', range: 'today' });
    check(
      'packagedWorkerAnalyzesMigratedSource',
      result.status === 'ready' && result.summary.requests === 1 && result.summary.total === 120,
    );
    check('reportPricesGainExplicitUSD', equal(result.prices[modelKey], { ...price, currency: 'USD' }));
    check(
      'estimateUsesOriginalUSDRates',
      result.summary.currency === 'USD' && Math.abs(result.summary.cost - 0.000134) < 1e-12,
    );
    check(
      'toolDataNotAttributedToSelectedAccount',
      result.accountId === null &&
        result.credits === null &&
        result.prediction === null &&
        result.provenance.accountAssociated === false,
    );
    const legacyResult = await analytics.get({ source: 'local', range: 'today' });
    check('legacyZcodeQueryStillWorks', legacyResult.source === 'local' && legacyResult.summary.total === 120);
    const platforms = profile.platforms;
    check(
      platforms.check,
      PROVIDERS.length === platforms.count &&
        PROVIDERS.every(
          (provider) =>
            typeof provider.capabilities?.quota === 'boolean' &&
            typeof provider.capabilities?.balance === 'boolean' &&
            typeof provider.capabilities?.usageSummary === 'boolean' &&
            typeof provider.capabilities?.actualBilling === 'boolean',
        ) &&
        (platforms.quota === 'all'
          ? PROVIDERS.every((provider) => provider.capabilities.quota)
          : PROVIDERS.filter((provider) => provider.capabilities.quota).length === platforms.quota) &&
        (!platforms.deepseekBalance || PROVIDERS.find((provider) => provider.id === 'deepseek').capabilities.balance),
    );

    stage = 'verify-preservation-and-rollback';
    check(
      'existingFilesRemainByteIdentical',
      preservedFiles.every((name) => hash(newStore.file(name)) === before[name]),
    );
    const rollbackStore = new oldStoreModule.LocalStore(dataRoot, safeStorage),
      rollbackSettings = rollbackStore.settings();
    const rollbackAnalytics = new oldAnalyticsModule.AnalyticsService({
      store: rollbackStore,
      monitor: newAccounts.active.monitor,
      history: newAccounts.active.history,
      client: noNetworkClient(),
      now: () => now,
    });
    check(
      `${profile.rollbackLabel}RollbackCanReadVaultAndSettings`,
      equal(rollbackStore.accounts(), vault) && equal(rollbackSettings, { preferences, bounds }),
    );
    check(
      `${profile.rollbackLabel}RollbackCanReadLegacySourceAndPrice`,
      rollbackAnalytics.file === dbFile && equal(rollbackAnalytics.prices[modelKey], price),
    );
    if (profile.association) {
      stage = 'manual-association-and-rollback';
      const { Associations } = load(newAsar, 'desktop/associations.cjs'),
        links = new Associations({ store: newStore, accounts: newAccounts, tools, now: () => now });
      tools.associations = links;
      check(
        'upgradeDoesNotAutoAssociate',
        links.groups.length === 0 && links.rules.length === 0 && !fs.existsSync(links.file),
      );
      const groupId = links.saveGroup({
        label: 'Synthetic billing account',
        memberIds: [accounts[0].id],
        primaryId: accounts[0].id,
        confirmed: true,
      });
      links.saveRule({
        groupId,
        sourceId: 'legacy-zcode',
        from: now - 86400000,
        to: null,
        provider: '',
        model: '',
        confirmed: true,
      });
      const linked = await tools.query({ range: 'today', billingGroupId: groupId });
      check('manualAssociationWorksAfterUpgrade', linked.accountId === groupId && linked.summary.total === 120);
      const restored = new Associations({ store: newStore, accounts: newAccounts, tools, now: () => now });
      check('associationConfigurationSurvivesRestart', equal(restored.publicState(), links.publicState()));
      check(
        'newMetadataDoesNotAffectOldVault',
        equal(rollbackStore.accounts(), vault) &&
          preservedFiles.every((name) => hash(newStore.file(name)) === before[name]),
      );
    }
    check('noNetworkRequests', networkCalls === 0);
    check('isolatedUserDataOnly', app.getPath('userData') === path.join(directory, 'isolated-electron'));
    // Guard against drift between plannedChecks() and the checks actually executed (not itself a check).
    const planned = plannedChecks(profile);
    if (!equal(Object.keys(report.checks), planned)) {
      report.planMismatch = { planned, executed: Object.keys(report.checks) };
      throw new Error('planMismatch');
    }
    report.status = 'passed';
    report.finishedAt = new Date().toISOString();
  })
  .catch(() => {
    report.status = 'failed';
    report.failedStage = stage;
    report.finishedAt = new Date().toISOString();
  })
  .finally(async () => {
    oldAccounts?.dispose();
    newAccounts?.dispose();
    try {
      await tools?.dispose();
    } catch {}
    clearTimeout(watchdog);
    try {
      fs.writeFileSync(output(), JSON.stringify(report, null, 2), 'utf8');
      console.log(
        JSON.stringify({
          status: report.status,
          profile: report.profile,
          passedChecks: Object.values(report.checks).filter(Boolean).length,
          failedStage: report.failedStage || null,
          reportFile: output(),
        }),
      );
    } catch {
      app.exit(1);
      return;
    }
    app.exit(report.status === 'passed' ? 0 : 1);
  });
