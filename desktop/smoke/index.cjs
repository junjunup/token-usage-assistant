// Native smoke mode (--smoke-test, T5.4): everything that only runs during the packaged/native smoke lives in
// desktop/smoke/. main.cjs passes a context of live getters, so this module always reads the current windows,
// settings and services. These files are packaged on purpose: the native smoke tests the real package.
const path = require('node:path');
const { app, safeStorage, Notification } = require('electron');
const { atomicWrite } = require('../store.cjs');
const { log } = require('../logger.cjs');
const { macSmokeName } = require('../platform.cjs');
const isMac = process.platform === 'darwin';
const resultFile = () => path.join(app.getPath('userData'), 'smoke-result.json');

// Command Code answers from the smoke fixture; other platforms use their synthetic fixture responses.
function clientFactory(createClient) {
  return (provider, region) =>
    provider === 'commandcode'
      ? require('./smoke-fixture.cjs').client
      : createClient(provider, region, require('../provider-fixture.cjs').fixtureFetch);
}
function createDatabase(root) {
  return require('./smoke-fixture.cjs').createDatabase(root);
}
function startupFailed() {
  atomicWrite(resultFile(), { ok: false, error: 'startup failed' });
}
// T7.5: on macOS the tray icon follows the account state through main.cjs (no direct update() call here):
// - before any saved account exists it keeps the static logo;
// - once accounts exist it becomes the dynamic icon matching the status projection, with the ring centred where the
//   brand mark is (18, 22 px in the 2x image). Elsewhere the tray is unchanged.
async function menubarSmoke(ctx, phase) {
  if (!isMac) return { ok: true, skipped: 'not-macos' };
  if (!ctx.menubar) return { ok: false, error: 'menubar icon missing' };
  const { menubarStatus } = require('../menubar-status.cjs');
  let expected = null,
    snap = null;
  for (let i = 0; i < 20; i++) {
    expected = menubarStatus(ctx.accounts.summaries(), ctx.settings);
    snap = await ctx.menubar.snapshot();
    if ((expected?.text ?? null) === (snap.status?.text ?? null) && (expected ? snap.mode === 'dynamic' : true)) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  const centred = !!snap.centre && Math.abs(snap.centre.x - 18) <= 1.5 && Math.abs(snap.centre.y - 22) <= 1.5;
  const ok =
    phase === 'empty'
      ? expected === null && snap.mode === 'static'
      : !!expected &&
        snap.mode === 'dynamic' &&
        snap.status?.text === expected.text &&
        snap.status?.accountId === expected.accountId &&
        snap.size?.height === 22 &&
        centred;
  return {
    ok,
    phase,
    mode: snap.mode,
    text: snap.status?.text,
    tone: snap.status?.tone,
    template: snap.template,
    size: snap.size,
    centre: snap.centre,
  };
}
// Starts the smoke run once both renderers are ready (finish), with a 45 s handshake timeout.
function attach(ctx) {
  ctx.monitor.configure('local-smoke-key');
  let started = false;
  const handshake = setTimeout(() => {
    atomicWrite(resultFile(), {
      ok: false,
      error: 'renderer handshake timeout',
      readySurfaces: [...ctx.readySurfaces],
    });
    log.error('main', 'smoke-handshake-timeout', { count: ctx.readySurfaces.size });
    log.flushSync();
    app.exit(1);
  }, 45000);
  async function finish() {
    if (started) return;
    started = true;
    // The handshake succeeded: its timeout must not exit the app while the smoke checks are still running.
    clearTimeout(handshake);
    try {
      await ctx.monitor.refresh();
      const analyticsResult = await ctx.analytics.get({ source: 'local', range: '7d' });
      const accountResult = await ctx.analytics.get({ source: 'account', range: 'today' });
      const compactHeight = ctx.widgetWindow.getBounds().height,
        compactContentHeight = ctx.widgetWindow.getContentBounds().height;
      ctx.applySettings({ ...ctx.settings, widgetExpanded: true });
      const expandedHeight = ctx.widgetWindow.getBounds().height,
        expandedContentHeight = ctx.widgetWindow.getContentBounds().height;
      ctx.applySettings({ ...ctx.settings, widgetExpanded: false });
      const restoredHeight = ctx.widgetWindow.getBounds().height;
      const testSecret = 'local-smoke-secret-only';
      const encrypted = safeStorage.encryptString(testSecret);
      const report = {
        ok:
          Math.abs(compactHeight - 366) <= 8 &&
          Math.abs(expandedHeight - 552) <= 8 &&
          Math.abs(restoredHeight - compactHeight) <= 8 &&
          expandedContentHeight - compactContentHeight > 160 &&
          analyticsResult.status === 'ready' &&
          analyticsResult.models?.length > 0 &&
          analyticsResult.summary?.cache?.hitRate > 0 &&
          accountResult.status === 'ready' &&
          ctx.monitor.state.status === 'connected' &&
          safeStorage.decryptString(encrypted) === testSecret &&
          (!isMac || app.getName() === macSmokeName),
        version: app.getVersion(),
        platform: process.platform,
        arch: process.arch,
        compactHeight,
        expandedHeight,
        restoredHeight,
        compactContentHeight,
        expandedContentHeight,
        analyticsLocal: analyticsResult.status,
        analyticsAccount: accountResult.status,
        modelGroups: analyticsResult.models?.length,
        cacheHitRate: analyticsResult.summary?.cache?.hitRate,
        readySurfaces: [...ctx.readySurfaces],
        trayCreated: !!ctx.tray,
        notificationSupported: Notification.isSupported(),
        encryptionRoundTrip: safeStorage.decryptString(encrypted) === testSecret,
        keychainName: app.getName(),
        mainSandbox: ctx.mainWindow.webContents.getLastWebPreferences().sandbox,
        mainIsolation: ctx.mainWindow.webContents.getLastWebPreferences().contextIsolation,
        widgetAlwaysOnTop: ctx.widgetWindow.isAlwaysOnTop(),
        widgetMovable: ctx.widgetWindow.isMovable(),
        status: ctx.monitor.state.status,
        hasCredits: !!ctx.monitor.state.parts.credits,
        hasSummary: !!ctx.monitor.state.parts.summary,
      };
      const menubarEmpty = await menubarSmoke(ctx, 'empty');
      report.providers = await require('./provider-native-smoke.cjs').runProviderSmoke({
        accounts: ctx.accounts,
        store: ctx.store,
        mainWindow: ctx.mainWindow,
        widgetWindow: ctx.widgetWindow,
        settings: ctx.settings,
        applySettings: ctx.applySettings,
      });
      report.tools = await require('./tool-native-smoke.cjs').runToolSmoke({
        toolSources: ctx.toolSources,
        analytics: ctx.analytics,
        store: ctx.store,
        accounts: ctx.accounts,
        mainWindow: ctx.mainWindow,
        settings: ctx.settings,
        applySettings: ctx.applySettings,
      });
      report.subscriptions = await require('./subscription-native-smoke.cjs').runSubscriptionSmoke({
        accounts: ctx.accounts,
        toolSources: ctx.toolSources,
        analytics: ctx.analytics,
        store: ctx.store,
        mainWindow: ctx.mainWindow,
        widgetWindow: ctx.widgetWindow,
        settings: ctx.settings,
        applySettings: ctx.applySettings,
      });
      report.balance = await require('./balance-native-smoke.cjs').runBalanceSmoke({
        accounts: ctx.accounts,
        analytics: ctx.analytics,
        store: ctx.store,
        mainWindow: ctx.mainWindow,
        widgetWindow: ctx.widgetWindow,
        settings: ctx.settings,
        applySettings: ctx.applySettings,
      });
      report.associations = await require('./association-native-smoke.cjs').runAssociationSmoke({
        accounts: ctx.accounts,
        toolSources: ctx.toolSources,
        associations: ctx.associations,
        analytics: ctx.analytics,
        store: ctx.store,
        mainWindow: ctx.mainWindow,
        settings: ctx.settings,
        applySettings: ctx.applySettings,
      });
      report.opencode = await require('./opencode-native-smoke.cjs').runOpenCodeSmoke({
        accounts: ctx.accounts,
        toolSources: ctx.toolSources,
        analytics: ctx.analytics,
        store: ctx.store,
        mainWindow: ctx.mainWindow,
        widgetWindow: ctx.widgetWindow,
        settings: ctx.settings,
        applySettings: ctx.applySettings,
      });
      const menubarAccounts = await menubarSmoke(ctx, 'accounts');
      report.menubar = { ok: menubarEmpty.ok && menubarAccounts.ok, empty: menubarEmpty, accounts: menubarAccounts };
      report.branding = await require('./branding-native-smoke.cjs').runBrandingSmoke({
        mainWindow: ctx.mainWindow,
        store: ctx.store,
        settings: ctx.settings,
        applySettings: ctx.applySettings,
      });
      report.ok =
        report.menubar.ok &&
        report.opencode.ok &&
        report.ok &&
        report.branding.ok &&
        report.associations.ok &&
        report.providers.ok &&
        report.tools.ok &&
        report.subscriptions.ok &&
        report.balance.ok;
      atomicWrite(resultFile(), report);
      ctx.setQuitting();
      log.info('main', 'smoke-finished', { status: report.ok ? 1 : 0 });
      log.flushSync();
      app.exit(report.ok ? 0 : 1);
    } catch (error) {
      atomicWrite(resultFile(), {
        ok: false,
        error: 'native smoke failed',
        detail: String(error.stack || error).slice(0, 1500),
      });
      log.error('main', 'smoke-failed');
      log.flushSync();
      app.exit(1);
    }
  }
  return { finish };
}
module.exports = { attach, clientFactory, createDatabase, startupFailed };
