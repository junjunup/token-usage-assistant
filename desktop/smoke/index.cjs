// Native smoke mode (--smoke-test, T5.4): everything that only runs during the packaged/native smoke lives in
// desktop/smoke/. main.cjs passes a context of live getters, so this module always reads the current windows,
// settings and services. These files are packaged on purpose: the native smoke tests the real package.
const path = require('node:path');
const { app, safeStorage, Notification } = require('electron');
const { atomicWrite } = require('../store.cjs');
const { log } = require('../logger.cjs');
const { macSmokeName } = require('../platform.cjs');
const isMac = process.platform === 'darwin';
const isWin = process.platform === 'win32';
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
// T11.2: on Windows the same status becomes a ring-only tray icon, 16 px at 100% with one image per DPI scale
// (16 / 20 / 24 / 32 px), the ring centred in it.
async function menubarSmoke(ctx, phase) {
  if (!isMac && !isWin) return { ok: true, skipped: 'not-macos-or-windows' };
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
  const [cx, cy, height] = isWin ? [8, 8, 16] : [18, 22, 22];
  const centred = !!snap.centre && Math.abs(snap.centre.x - cx) <= 1.5 && Math.abs(snap.centre.y - cy) <= 1.5;
  const scales = !isWin || JSON.stringify([...snap.scales].sort()) === JSON.stringify([1, 1.25, 1.5, 2]);
  const ok =
    phase === 'empty'
      ? expected === null && snap.mode === 'static'
      : !!expected &&
        snap.mode === 'dynamic' &&
        snap.status?.text === expected.text &&
        snap.status?.accountId === expected.accountId &&
        snap.size?.height === height &&
        scales &&
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
    scales: snap.scales,
  };
}
// T11.1: with several accounts the overview lists every account in the menu-bar order, and the widget follows the
// tightest one: shorter while collapsed, every other account listed when expanded, its bottom edge kept (1.4.1).
async function overviewSmoke(ctx) {
  const { accountOverview } = require('../account-overview.cjs');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (test, ms = 10000) => {
    for (const end = Date.now() + ms; Date.now() < end; await sleep(100)) if (await test()) return true;
    return false;
  };
  const count = ctx.accounts.entries.length;
  const expected = accountOverview(ctx.accounts.summaries(), ctx.settings).rows.map((r) => r.label);
  const main = ctx.mainWindow.webContents,
    widget = ctx.widgetWindow;
  await main.executeJavaScript('document.querySelector(\'[aria-label="用量总览"]\')?.click()');
  const tilesShown = await until(
    async () => (await main.executeJavaScript('document.querySelectorAll(".aa-tile").length')) === count,
  );
  const order = await main.executeJavaScript(
    '[...document.querySelectorAll(".aa-tile .aa-name")].map((e) => e.textContent)',
  );
  ctx.applySettings({ ...ctx.settings, widgetExpanded: false });
  const before = widget.getBounds();
  const collapsedHeight = before.height;
  ctx.applySettings({ ...ctx.settings, widgetExpanded: true });
  const listed = await until(
    async () =>
      (await widget.webContents.executeJavaScript('document.querySelectorAll(".aa-w-row").length')) === count - 1,
  );
  const expanded = widget.getBounds();
  ctx.applySettings({ ...ctx.settings, widgetExpanded: false });
  const restored = widget.getBounds();
  const glance = await widget.webContents.executeJavaScript('!!document.querySelector(".aa-w-account")');
  return {
    ok:
      count >= 2 &&
      tilesShown &&
      JSON.stringify(order) === JSON.stringify(expected) &&
      Math.abs(collapsedHeight - 238) <= 8 &&
      Math.abs(expanded.height - 552) <= 8 &&
      Math.abs(restored.height - collapsedHeight) <= 8 &&
      Math.abs(expanded.y + expanded.height - (before.y + before.height)) <= 8 &&
      listed &&
      glance,
    accounts: count,
    tilesShown,
    order: JSON.stringify(order) === JSON.stringify(expected),
    collapsedHeight,
    expandedHeight: expanded.height,
    restoredHeight: restored.height,
    bottomKept: Math.abs(expanded.y + expanded.height - (before.y + before.height)) <= 8,
    listed,
  };
}
// T7.6: the menu-bar popover panel (macOS). Opened without a click (same positioning code), it must be sandboxed,
// content-protected, open on the account the icon shows, refuse IPC channels outside its allow-list, and hide again.
// Light and dark captures of the real panel are kept in the isolated test directory for the D10 review.
// T11.2: the same panel on Windows, placed against the taskbar inside the work area, without the arrow.
async function panelSmoke(ctx) {
  if (!isMac && !isWin) return { ok: true, skipped: 'not-macos-or-windows' };
  const panel = ctx.menubarPanel;
  if (!panel) return { ok: false, error: 'panel missing' };
  const fs = require('node:fs');
  const { menubarStatus } = require('../menubar-status.cjs');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (test, ms = 10000) => {
    for (const end = Date.now() + ms; Date.now() < end; await sleep(100)) if (await test()) return true;
    return false;
  };
  panel.show();
  const ready = await until(() => ctx.readySurfaces.has('panel'));
  await sleep(800);
  const win = panel.window;
  const prefs = win.webContents.getLastWebPreferences();
  const expected = menubarStatus(ctx.accounts.summaries(), ctx.settings)?.accountLabel || '';
  const name = await win.webContents.executeJavaScript('document.querySelector(".panel-name")?.textContent || ""');
  const denied = await win.webContents.executeJavaScript(
    'window.tokenAssistant.getState().then((r) => r.ok ? "" : r.error)',
  );
  const allowed = await win.webContents.executeJavaScript('window.tokenAssistant.panelState().then((r) => r.ok)');
  const capture = async (file) => {
    const image = await win.webContents.capturePage();
    fs.writeFileSync(path.join(app.getPath('userData'), file), image.toPNG());
    return image.getSize();
  };
  const visible = win.isVisible();
  const { screen } = require('electron');
  const placed = win.getBounds(),
    area = screen.getDisplayMatching(placed).workArea;
  const inside =
    placed.x >= area.x &&
    placed.y >= area.y &&
    placed.x + placed.width <= area.x + area.width &&
    placed.y + placed.height <= area.y + area.height;
  const arrow = await win.webContents.executeJavaScript('!!document.querySelector(".panel-arrow")');
  const theme = ctx.settings.theme;
  ctx.applySettings({ ...ctx.settings, theme: 'light' });
  await sleep(800);
  const light = await capture('panel-light.png');
  ctx.applySettings({ ...ctx.settings, theme: 'dark' });
  await sleep(800);
  const dark = await capture('panel-dark.png');
  ctx.applySettings({ ...ctx.settings, theme });
  panel.hide();
  await sleep(200);
  const hidden = !win.isVisible();
  return {
    ok:
      ready &&
      visible &&
      prefs.sandbox === true &&
      prefs.contextIsolation === true &&
      prefs.nodeIntegration === false &&
      win.isContentProtected() &&
      !!expected &&
      name === expected &&
      denied === '不受信任的请求' &&
      allowed === true &&
      (isMac || (inside && !arrow)) &&
      hidden,
    ready,
    visible,
    sandbox: prefs.sandbox,
    contextIsolation: prefs.contextIsolation,
    contentProtected: win.isContentProtected(),
    account: name === expected,
    deniedOutsideAllowList: denied === '不受信任的请求',
    bounds: win.getBounds(),
    inside,
    arrow,
    edge: panel.edge,
    light,
    dark,
    hidden,
  };
}
// T7.7: the menu-bar settings take effect through applySettings (the normal path): usage off is the static logo,
// the forms change the drawn width, and the panel's content protection follows its setting. Everything is restored.
async function menubarSettingsSmoke(ctx) {
  if (!isMac) return { ok: true, skipped: 'not-macos' };
  if (!ctx.menubar || !ctx.menubarPanel?.window) return { ok: false, error: 'menubar or panel missing' };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const saved = { ...ctx.settings };
  const set = async (patch) => {
    ctx.applySettings({ ...ctx.settings, ...patch });
    await sleep(400);
    return ctx.menubar.snapshot();
  };
  const off = await set({ menubarUsage: false });
  const on = await set({ menubarUsage: true });
  const ring = await set({ menubarForm: 'ring' });
  const two = await set({ menubarForm: 'two' });
  // The panel window is recreated with the new protection setting (Electron cannot switch it off in place).
  const protection = async (value) => {
    await set({ panelProtect: value });
    ctx.menubarPanel.show();
    await sleep(600);
    const on = ctx.menubarPanel.window.isContentProtected();
    ctx.menubarPanel.hide();
    return on;
  };
  const unprotected = (await protection(false)) === false;
  const protectedAgain = (await protection(true)) === true;
  ctx.applySettings(saved);
  await sleep(400);
  const restored = await ctx.menubar.snapshot();
  return {
    ok:
      off.mode === 'static' &&
      on.mode === 'dynamic' &&
      ring.size?.width === 18 &&
      two.size?.width > 18 &&
      unprotected &&
      protectedAgain &&
      restored.mode === 'dynamic',
    usageOff: off.mode,
    usageOn: on.mode,
    ringWidth: ring.size?.width,
    twoWidth: two.size?.width,
    unprotected,
    protectedAgain,
    restored: restored.mode,
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
      report.overview = await overviewSmoke(ctx);
      report.panel = await panelSmoke(ctx);
      report.menubarSettings = await menubarSettingsSmoke(ctx);
      report.branding = await require('./branding-native-smoke.cjs').runBrandingSmoke({
        mainWindow: ctx.mainWindow,
        store: ctx.store,
        settings: ctx.settings,
        applySettings: ctx.applySettings,
      });
      report.ok =
        report.menubar.ok &&
        report.overview.ok &&
        report.panel.ok &&
        report.menubarSettings.ok &&
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
