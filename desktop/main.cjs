const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  ipcMain,
  protocol,
  net,
  safeStorage,
  Notification,
  shell,
  screen,
  powerMonitor,
  nativeImage,
  dialog,
} = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { LocalStore } = require('./store.cjs');
const { patchSettings } = require('./domain.cjs');
const { ApiError } = require('./api.cjs');
const { AnalyticsService } = require('./analytics-service.cjs');
const { ToolSources } = require('./tool-sources.cjs');
const { Associations } = require('./associations.cjs');
const { AccountManager } = require('./accounts.cjs');
const { createClient } = require('./providers.cjs');
const { resizedWidgetBounds } = require('./widget-bounds.cjs');
const { connectCodex } = require('./codex-connect.cjs');
const { providerDefinition } = require('./providers/index.cjs');
const { toolKind } = require('./tool-kinds/index.cjs');
const { UpdateChecker, PAGE_PREFIX } = require('./update-check.cjs');
const { formatAmount } = require('./balance-domain.cjs');
const { connectionStatus } = require('./subscription-status.cjs');
const {
  windowChrome,
  loginOptions,
  readLogin,
  launcherName,
  sameFile,
  macDataName,
  macSmokeName,
} = require('./platform.cjs');
const { windowIcon, taskbarDetails } = require('./branding.cjs');
const { log } = require('./logger.cjs');
const { buildDiagnostics } = require('./diagnostics.cjs');
const isMac = process.platform === 'darwin';
const APP_ORIGIN = 'companion://app';
const APP_ID = 'local.commandcode.tokenusageassistant';
const smoke = process.argv.includes('--smoke-test');
const smokeDirArg = process.argv.find((a) => a.startsWith('--test-directory='));
// Everything that only runs in smoke mode lives in desktop/smoke/ (T5.4).
const smokeMode = smoke ? require('./smoke/index.cjs') : null;
// Island POC (T7.1): development only, never in a package (the directory is excluded by electron-builder.yml).
const islandPoc = !app.isPackaged && process.env.TUA_ISLAND_POC === '1' && isMac;
if (isMac) {
  // Packaged: ~/Library/Application Support/TokenUsageAssistant (unchanged). Development: TokenUsageAssistant-Dev.
  const macName = macDataName(app.isPackaged);
  // Smoke runs get their own name and therefore their own Keychain Safe Storage item.
  app.setName(smoke ? macSmokeName : macName);
  app.setPath('userData', path.join(app.getPath('appData'), macName));
}
if (smoke || islandPoc) {
  if (!smokeDirArg)
    throw new Error(smoke ? 'Smoke test requires an isolated directory' : 'Island POC requires an isolated directory');
  const testDir = path.resolve(smokeDirArg.slice('--test-directory='.length));
  app.setPath('userData', fs.existsSync(testDir) ? fs.realpathSync(testDir) : testDir);
}
log.configure({ dir: path.join(app.getPath('userData'), 'logs') });
log.info('main', 'start', { version: app.getVersion(), stage: smoke ? 'smoke' : app.isPackaged ? 'packaged' : 'dev' });
protocol.registerSchemesAsPrivileged([
  { scheme: 'companion', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
]);
if (process.platform === 'win32') app.setAppUserModelId(APP_ID);
let mainWindow,
  widgetWindow,
  tray,
  store,
  settings,
  bounds = {},
  monitor,
  quitting = false,
  saveTimer,
  history,
  analytics;
let accounts,
  toolSources,
  associations,
  claudeCollector,
  smokeRun,
  updates,
  diagnosticsText = '',
  connectionBusy = false;
const notifications = new Set(),
  readySurfaces = new Set();
function syncActive() {
  if (!accounts) return;
  const active = accounts.active;
  if (monitor !== active.monitor) {
    monitor = active.monitor;
    history = active.history;
    if (analytics) {
      analytics.monitor = monitor;
      analytics.history = history;
      analytics.client = active.client;
      analytics.resetAccount();
    }
  }
}
function state() {
  const sources = toolSources?.list() || [],
    data = monitor?.snapshot();
  return {
    version: app.getVersion(),
    analyticsRevision: (analytics?.revision || 0) + (toolSources?.revision || 0) + (associations?.revision || 0),
    associations: associations?.publicState() || { groups: [], rules: [], issue: '' },
    toolSources: sources,
    toolSourceIssue: toolSources?.issue || claudeCollector?.issue || '',
    settings,
    hasCredential: !!monitor?.key,
    ...accounts?.publicState(),
    connecting: connectionBusy || !!accounts?.connecting,
    connectionStatus: connectionStatus(accounts?.active?.entry, data, sources, claudeCollector?.issue),
    data,
    platform: process.platform,
    loginItem: readLogin(app),
    packaged: app.isPackaged,
    // T5.2: the newest public version when it is newer than this one (the page address stays in main).
    update: {
      status: updates?.state.status || 'idle',
      version: updates?.state.latest?.version || null,
      checkedAt: updates?.state.checkedAt || null,
    },
    // The active account's real refresh interval (Codex never polls faster than every 120 s).
    refreshInterval: accounts?.active?.monitor.intervalSeconds,
  };
}
function broadcast() {
  syncActive();
  const s = state();
  for (const w of [mainWindow, widgetWindow]) if (w && !w.isDestroyed()) w.webContents.send('assistant:state', s);
  updateTray();
}
function savePreferences() {
  store.saveSettings(settings, bounds);
}
function rememberWindow(key, win) {
  win.on('move', save);
  win.on('resize', save);
  function save() {
    if (win.isDestroyed() || win.isMaximized() || win.isMinimized()) return;
    bounds[key] = win.getBounds();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        savePreferences();
      } catch (e) {
        log.warn('main', 'save-bounds-failed', { errno: e?.code });
      }
    }, 350);
  }
}
function widgetHeight() {
  return settings?.widgetExpanded ? 552 : 366;
}
function savedWidgetBounds(saved) {
  const area = screen.getDisplayMatching(saved).workArea,
    height = widgetHeight();
  return {
    x: Math.max(area.x, Math.min(Math.round(saved.x), area.x + area.width - 324)),
    y: Math.max(area.y, Math.min(Math.round(saved.y), area.y + area.height - height)),
    width: 324,
    height,
  };
}
function placedBounds(kind) {
  const work = screen.getPrimaryDisplay().workArea;
  const saved = bounds[kind];
  if (
    saved &&
    ['x', 'y', 'width', 'height'].every((k) => Number.isFinite(saved[k])) &&
    screen
      .getAllDisplays()
      .some(
        (d) =>
          saved.x >= d.workArea.x &&
          saved.y >= d.workArea.y &&
          saved.x + 120 <= d.workArea.x + d.workArea.width &&
          saved.y + 120 <= d.workArea.y + d.workArea.height,
      )
  )
    return kind === 'widget'
      ? savedWidgetBounds(saved)
      : {
          x: Math.round(saved.x),
          y: Math.round(saved.y),
          width: Math.max(780, Math.min(saved.width, work.width)),
          height: Math.max(640, Math.min(saved.height, work.height)),
        };
  return kind === 'widget'
    ? {
        x: work.x + work.width - 348,
        y: work.y + work.height - widgetHeight() - 24,
        width: 324,
        height: widgetHeight(),
      }
    : { width: Math.min(1260, work.width - 48), height: Math.min(960, work.height - 48) };
}
function secureWindow(kind) {
  const win = new BrowserWindow({
    ...placedBounds(kind),
    show: false,
    ...windowChrome(kind),
    minWidth: kind === 'main' ? 780 : 324,
    minHeight: kind === 'main' ? 640 : 366,
    resizable: kind === 'main',
    maximizable: kind === 'main',
    skipTaskbar: kind === 'widget',
    alwaysOnTop: kind === 'widget',
    movable: kind !== 'widget' || !settings.pinned,
    title: kind === 'main' ? 'Token 用量助手' : '用量悬浮窗',
    backgroundColor: settings.theme === 'dark' ? '#141416' : '#ffffff',
    icon: windowIcon(__dirname),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
      devTools: !app.isPackaged,
    },
  });
  if (process.platform === 'win32' && kind === 'main') win.setAppDetails(taskbarDetails(app, APP_ID));
  if (!isMac) win.setMenuBarVisibility(false);
  if (isMac && kind === 'widget') {
    win.setAlwaysOnTop(true, 'floating');
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  }
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e, url) => {
    if (url !== `${APP_ORIGIN}/index.html?surface=${kind}`) e.preventDefault();
  });
  win.webContents.on('will-attach-webview', (e) => e.preventDefault());
  win.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  win.webContents.session.setPermissionCheckHandler(() => false);
  win.on('close', (e) => {
    if (quitting || !tray) return;
    e.preventDefault();
    if (kind === 'main') win.hide();
    else {
      settings.floating = false;
      win.hide();
      savePreferences();
      broadcast();
    }
  });
  rememberWindow(kind, win);
  win.loadURL(`${APP_ORIGIN}/index.html?surface=${kind}`);
  win.once('ready-to-show', () => {
    if (smoke) return;
    if (
      kind === 'main' &&
      (!tray || (!process.argv.includes('--hidden') && !(isMac && readLogin(app).wasOpenedAtLogin)))
    )
      win.show();
    if (kind === 'widget' && settings.floating) win.showInactive();
  });
  return win;
}
function showMain() {
  if (!mainWindow || mainWindow.isDestroyed()) mainWindow = secureWindow('main');
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}
function applySettings(next) {
  const previous = settings,
    loginChanged = previous.launchAtLogin !== next.launchAtLogin;
  if (loginChanged) {
    try {
      app.setLoginItemSettings(loginOptions(next.launchAtLogin));
    } catch {
      log.warn('main', 'login-item-failed');
      throw inputError('启动项设置未成功，请检查系统登录项设置。');
    }
  }
  settings = next;
  try {
    savePreferences();
  } catch (e) {
    log.warn('main', 'save-preferences-failed', { errno: e?.code });
    settings = previous;
    if (loginChanged) {
      try {
        app.setLoginItemSettings(loginOptions(previous.launchAtLogin));
      } catch {
        log.warn('main', 'login-item-restore-failed');
      }
    }
    throw inputError('设置无法保存，请检查应用数据目录');
  }
  widgetWindow?.setMovable(!settings.pinned);
  if (previous.widgetExpanded !== settings.widgetExpanded && widgetWindow && !widgetWindow.isDestroyed()) {
    const b = widgetWindow.getBounds(),
      area = screen.getDisplayMatching(b).workArea;
    widgetWindow.setBounds(resizedWidgetBounds(b, area, widgetHeight()));
  }
  if (settings.floating && !smoke) widgetWindow.showInactive();
  else widgetWindow?.hide();
  accounts.updateSettings(settings);
  if (previous.updateCheck !== settings.updateCheck) setUpdateCheck();
  broadcast();
}
// T5.2: the update check runs only while enabled, and never in smoke mode (no network there).
function setUpdateCheck() {
  if (!updates) return;
  if (settings.updateCheck && !smoke) updates.start();
  else updates.stop();
}
function openUpdate() {
  const url = updates?.state.latest?.url;
  if (updates?.state.status === 'available' && url?.startsWith(PAGE_PREFIX)) return shell.openExternal(url);
  throw inputError('暂无可查看的新版本。');
}
function showNotification(title, body) {
  if (smoke || !Notification.isSupported()) return false;
  const notice = new Notification({ title, body, icon: path.join(__dirname, 'assets', 'app.png'), silent: true });
  notifications.add(notice);
  notice.on('click', showMain);
  notice.on('close', () => notifications.delete(notice));
  notice.on('failed', () => notifications.delete(notice));
  notice.show();
  return true;
}
function quotaAlert(alert) {
  const name =
    alert.label || (alert.key === 'monthly' ? '月度套餐额度' : alert.key === 'five' ? '5 小时额度' : '每周额度');
  const prefix = alert.accountLabel ? alert.accountLabel + ' · ' : '';
  const detail =
    alert.key === 'monthly'
      ? alert.hasPurchased
        ? '仍有购买额度，可在面板查看。'
        : alert.hasFree
          ? '仍有免费余额。'
          : '请打开面板查看余额与账期。'
      : '可打开助手查看重置时间。';
  showNotification(
    prefix + name + (alert.level === 2 ? '已用尽' : '偏低'),
    alert.level === 2
      ? detail
      : '剩余 ' + Math.round(alert.remaining) + '%，低于 ' + settings.threshold + '% 提醒阈值。',
  );
}
function percent(v) {
  return typeof v === 'number' ? `${Math.round(v)}%` : '—';
}
function updateTray() {
  if (!tray || !settings) return;
  const credit = monitor?.state.parts.credits;
  const balance = monitor?.state.parts.balance;
  const lines =
    accounts?.active.client.capabilities?.balance && !accounts?.active.client.capabilities?.quota
      ? balance?.balances.length
        ? balance.balances.map((b) => b.currency + ' 余额 ' + formatAmount(b.total))
        : ['余额金额暂未返回']
      : Array.isArray(credit?.windows)
        ? credit.windows
            .filter((w) => w.applicable !== false)
            .slice(0, 4)
            .map((w) => w.label + ' ' + (w.unlimited ? '不限' : percent(w.remainingPercent)))
        : [
            '月度剩余 ' + (typeof credit?.monthly === 'number' ? '$' + credit.monthly.toFixed(2) : '—'),
            '5 小时 ' + percent(credit?.five?.remainingPercent) + ' · 每周 ' + percent(credit?.week?.remainingPercent),
          ];
  tray.setToolTip(['Token 用量助手', accounts?.active.entry.label || '未连接', ...lines].join('\n'));
  tray.setContextMenu(
    Menu.buildFromTemplate([
      ...(updates?.state.status === 'available'
        ? [
            { label: `发现新版本 ${updates.state.latest.version}，查看…`, click: () => openUpdate() },
            { type: 'separator' },
          ]
        : []),
      { label: '打开用量总览', click: showMain },
      {
        label: '显示悬浮窗',
        type: 'checkbox',
        checked: settings.floating,
        click: (item) => applySettings({ ...settings, floating: item.checked }),
      },
      { label: '刷新用量', enabled: !!monitor?.key && !monitor?.state.fetching, click: () => monitor.refresh() },
      { type: 'separator' },
      {
        label: '开机启动',
        type: 'checkbox',
        checked: settings.launchAtLogin,
        enabled: app.isPackaged,
        click: (item) => applySettings({ ...settings, launchAtLogin: item.checked }),
      },
      { type: 'separator' },
      {
        label: '退出助手',
        click: () => {
          quitting = true;
          app.quit();
        },
      },
    ]),
  );
}
function trusted(event) {
  return (
    [mainWindow, widgetWindow].some((w) => w && !w.isDestroyed() && w.webContents === event.sender) &&
    event.senderFrame === event.sender.mainFrame &&
    event.senderFrame.url.startsWith(`${APP_ORIGIN}/index.html?surface=`)
  );
}
function mainOnly(event) {
  if (event.sender !== mainWindow?.webContents) throw new Error('请在详细面板中操作');
}
function handle(channel, fn) {
  ipcMain.handle(channel, async (event, value) => {
    if (!trusted(event)) return { ok: false, error: '不受信任的请求' };
    try {
      return { ok: true, value: await fn(event, value) };
    } catch (e) {
      log.warn('ipc', e instanceof ApiError ? 'api-error' : e?.publicMessage ? 'public-error' : 'unexpected', {
        stage: channel,
        status: e instanceof ApiError ? e.status : undefined,
        errno: typeof e?.code === 'string' ? e.code : undefined,
      });
      return {
        ok: false,
        error: e instanceof ApiError ? e.message : e?.publicMessage || '操作未完成，请重试或检查本机设置。',
      };
    }
  });
}
function inputError(message) {
  const e = new Error(message);
  e.publicMessage = message;
  return e;
}
function installIpc() {
  handle('assistant:get-state', () => state());
  // Retry reading the encrypted account list after a failed load (T3.4). Never overwrites the encrypted file.
  handle('assistant:retry-credentials', (event) => {
    mainOnly(event);
    if (connectionBusy) throw inputError('请等待账户连接完成。');
    if (accounts.retryLoad()) accounts.refreshAll();
    broadcast();
    return state();
  });
  handle('assistant:save-billing-group', (event, value) => {
    mainOnly(event);
    if (connectionBusy) throw inputError('请等待账户连接完成。');
    return associations.saveGroup(value);
  });
  handle('assistant:remove-billing-group', (event, id) => {
    mainOnly(event);
    return associations.removeGroup(id);
  });
  handle('assistant:save-account-link', (event, value) => {
    mainOnly(event);
    if (connectionBusy) throw inputError('请等待账户连接完成。');
    return associations.saveRule(value);
  });
  handle('assistant:remove-account-link', (event, id) => {
    mainOnly(event);
    return associations.removeRule(id);
  });
  handle('assistant:analytics', (event, query) => {
    mainOnly(event);
    return analytics.get(query);
  });
  handle('assistant:cancel-analytics', (event, id) => {
    mainOnly(event);
    if (typeof id !== 'string' || id.length > 100) return false;
    return toolSources.cancel(id);
  });
  // The native picker for each tool kind comes from desktop/tool-kinds/ (T5.3b).
  const chooseToolFile = async (kind) => {
    const picker = toolKind(kind)?.picker;
    if (!picker) throw inputError('不支持的工具来源');
    const choice = await dialog.showOpenDialog(
      mainWindow,
      picker.type === 'directory'
        ? {
            title: picker.title,
            defaultPath: path.join(app.getPath('home'), picker.defaultHomePath),
            properties: ['openDirectory'],
          }
        : { title: picker.title, properties: ['openFile'], filters: picker.filters },
    );
    return choice.canceled ? null : choice.filePaths[0];
  };
  handle('assistant:add-tool-source', async (event, value) => {
    mainOnly(event);
    const file = await chooseToolFile(value?.kind);
    if (!file) return { cancelled: true };
    toolSources.add({ kind: value.kind, label: value.label, file });
    return { cancelled: false };
  });
  handle('assistant:update-tool-source', (event, value) => {
    mainOnly(event);
    return toolSources.update(value?.id, value?.patch);
  });
  handle('assistant:choose-tool-source', async (event, id) => {
    mainOnly(event);
    const source = toolSources.require(id),
      file = await chooseToolFile(source.kind);
    if (!file) return { cancelled: true };
    toolSources.relocate(id, file);
    if (id === 'legacy-zcode') analytics.setFile(file);
    return { cancelled: false };
  });
  handle('assistant:remove-tool-source', async (event, id) => {
    mainOnly(event);
    return toolSources.remove(id);
  });
  handle('assistant:sync-tool-source', async (event, id) => {
    mainOnly(event);
    return toolSources.sync(id, analytics.prices);
  });
  handle('assistant:choose-local', async (event) => {
    mainOnly(event);
    const choice = await dialog.showOpenDialog(mainWindow, {
      title: '选择 Zcode 用量数据库',
      properties: ['openFile'],
      filters: [{ name: 'SQLite 数据库', extensions: ['sqlite', 'db', 'sqlite3'] }],
    });
    if (choice.canceled) return { cancelled: true };
    const file = fs.realpathSync(choice.filePaths[0]);
    if (!fs.statSync(file).isFile()) throw inputError('请选择数据库文件');
    analytics.setFile(file);
    const source = toolSources.entries.find((s) => s.kind === 'zcode');
    if (source) toolSources.relocate(source.id, file);
    else toolSources.add({ kind: 'zcode', file });
    broadcast();
    return { cancelled: false };
  });
  handle('assistant:model-price', (event, value) => {
    mainOnly(event);
    try {
      const price = analytics.savePrice(value?.key, value?.price);
      broadcast();
      return price;
    } catch {
      throw inputError('请输入有效的模型单价，单位为所选币种 / 百万 Token。');
    }
  });
  handle('assistant:renderer-ready', (event) => {
    readySurfaces.add(event.sender === mainWindow?.webContents ? 'main' : 'widget');
    if (smokeRun && readySurfaces.size === 2) smokeRun.finish();
    return true;
  });
  handle('assistant:connect', async (event, value) => {
    mainOnly(event);
    if (smoke) throw inputError('测试模式不保存真实账户');
    if (connectionBusy) throw inputError('正在连接，请等待当前操作完成。');
    connectionBusy = true;
    broadcast();
    try {
      if (value?.provider === 'codex') {
        const result = await connectCodex(value, {
          accounts,
          tools: toolSources,
          userHome: app.getPath('home'),
          chooseHome: async () => {
            const choice = await dialog.showOpenDialog(mainWindow, {
              title: '选择 Codex 配置目录',
              defaultPath: path.join(app.getPath('home'), '.codex'),
              properties: ['openDirectory'],
            });
            return choice.canceled ? null : choice.filePaths[0];
          },
          chooseExecutable: async ({ message } = {}) => {
            const choice = await dialog.showOpenDialog(mainWindow, {
              title: isMac ? '选择官方 Codex.app' : '选择官方 Codex 的 codex.exe',
              message,
              properties: ['openFile'],
              ...(isMac
                ? { defaultPath: '/Applications' }
                : { filters: [{ name: 'Codex 程序', extensions: ['exe'] }] }),
            });
            return choice.canceled ? null : choice.filePaths[0];
          },
        });
        if (result.cancelled || result.needsProfileSelection) return result;
        return { ...state(), connectionMessage: result.message };
      }
      let source, connectionMessage;
      if (value?.provider === 'claude') {
        const home = store.file('claude-collector');
        claudeCollector ||= new (require('./claude-collector.cjs').ClaudeCollector)(home);
        try {
          await claudeCollector.start();
          claudeCollector.generateLauncher();
        } catch (e) {
          log.warn('claude-collector', 'start-failed', { stage: 'connect', errno: e?.code });
          throw inputError('Claude 本机采集器启动失败，请检查端口占用或本机目录权限。');
        }
        value = { ...value, home };
        source = { kind: 'claude-code', file: path.join(home, 'usage.jsonl'), label: 'Claude Code' };
      }
      await accounts.connect(value);
      if (value.provider === 'claude')
        connectionMessage = monitor.state.parts.credits?.windows?.length
          ? 'Claude 最近额度已载入，请查看同步状态。'
          : 'Claude 组件已就绪，等待首次额度数据。请在项目目录运行生成的 ' + launcherName() + '。';
      if (source && !toolSources.entries.some((s) => s.kind === source.kind && sameFile(s.file, source.file))) {
        try {
          toolSources.add(source);
        } catch {
          log.warn('tool-sources', 'add-failed', { kind: source.kind });
          connectionMessage += ' 工具来源暂未添加，请在工具数据源中检查。';
        }
      }
      if (value.provider === 'claude') {
        try {
          const error = await shell.openPath(value.home);
          if (error) connectionMessage += ' 配置目录未能自动打开，请从工具数据源位置查看启动配置。';
        } catch {
          log.warn('main', 'open-path-failed');
          connectionMessage += ' 配置目录未能自动打开。';
        }
      }
      return { ...state(), connectionMessage };
    } finally {
      connectionBusy = false;
      broadcast();
    }
  });
  handle('assistant:select-account', (event, id) => {
    mainOnly(event);
    if (connectionBusy) throw inputError('请等待当前连接完成。');
    accounts.select(id);
    return state();
  });
  handle('assistant:disconnect', (event) => {
    mainOnly(event);
    if (connectionBusy) throw inputError('请等待当前连接完成。');
    accounts.remove();
    return state();
  });
  handle('assistant:refresh', async () => {
    await monitor.refresh();
    return state();
  });
  handle('assistant:settings', (event, value) => {
    if (
      event.sender !== mainWindow?.webContents &&
      Object.keys(value || {}).some((k) => !['pinned', 'floating', 'widgetExpanded'].includes(k))
    )
      throw inputError('请在详细面板修改此设置');
    if (value?.launchAtLogin && !app.isPackaged) throw inputError('请在打包后的桌面版启用开机启动');
    let next;
    try {
      next = patchSettings(settings, value);
    } catch {
      throw inputError('设置值不正确');
    }
    applySettings(next);
    return state();
  });
  handle('assistant:window', (event, action) => {
    if (action === 'show-main') showMain();
    else if (action === 'hide-main') mainWindow.hide();
    else if (action === 'maximize') {
      mainOnly(event);
      mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
    } else if (action === 'hide-widget') applySettings({ ...settings, floating: false });
    else if (action === 'quit') {
      mainOnly(event);
      quitting = true;
      app.quit();
    } else throw inputError('不支持的窗口操作');
    return true;
  });
  handle('assistant:official', (_event, target) => {
    if (!['usage', 'studio'].includes(target)) throw inputError('不支持的地址');
    const { provider, region } = accounts.active.entry;
    // Official pages come from the platform registry (desktop/providers/, T5.3a).
    const url = providerDefinition(provider)?.officialUrl({ region, identity: monitor.state.parts.identity, target });
    if (!url) throw inputError('不支持的地址');
    return shell.openExternal(url);
  });
  // Diagnostics export (T3.3): preview first; saving writes exactly the previewed text, nothing else.
  handle('assistant:diagnostics-preview', (event) => {
    mainOnly(event);
    diagnosticsText = JSON.stringify(
      buildDiagnostics({
        app: {
          version: app.getVersion(),
          packaged: app.isPackaged,
          electron: process.versions.electron,
          chrome: process.versions.chrome,
          node: process.versions.node,
        },
        system: { platform: process.platform, arch: process.arch, release: process.getSystemVersion() },
        settings,
        credentialIssue: accounts.issue,
        accounts: accounts.entries.map((e) => ({
          provider: e.provider,
          region: e.region,
          active: e.id === accounts.activeId,
          monitor: accounts.runtimes.get(e.id)?.monitor.state,
        })),
        sources: toolSources?.list() || [],
        logLines: log.tail(500),
        now: Date.now,
      }),
      null,
      2,
    );
    return diagnosticsText;
  });
  handle('assistant:diagnostics-save', async (event) => {
    mainOnly(event);
    if (!diagnosticsText) throw inputError('请先生成诊断信息预览。');
    const text = diagnosticsText,
      stamp = new Date().toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');
    const choice = await dialog.showSaveDialog(mainWindow, {
      title: '保存诊断信息',
      defaultPath: `TokenUsageAssistant-diagnostics-${stamp}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (choice.canceled || !choice.filePath) return false;
    try {
      fs.writeFileSync(choice.filePath, text + '\n', { encoding: 'utf8', mode: 0o600 });
    } catch (e) {
      log.warn('main', 'diagnostics-save-failed', { errno: e?.code });
      throw inputError('诊断信息未能保存，请换一个位置重试。');
    }
    log.info('main', 'diagnostics-saved', { count: text.length });
    return true;
  });
  handle('assistant:open-update', (event) => {
    mainOnly(event);
    return openUpdate();
  });
  handle('assistant:test-notification', (event) => {
    mainOnly(event);
    if (!settings.notifications) throw inputError('请先开启额度提醒');
    if (!showNotification('Token 用量助手', `提醒已就绪：剩余额度低于 ${settings.threshold}% 时通知你。`))
      throw inputError('当前系统不支持通知，请检查系统通知设置');
    return true;
  });
}
// Live view of the main-process state for the smoke module (T5.4); getters so it always sees current values.
function smokeContext() {
  return {
    get monitor() {
      return monitor;
    },
    get analytics() {
      return analytics;
    },
    get mainWindow() {
      return mainWindow;
    },
    get widgetWindow() {
      return widgetWindow;
    },
    get settings() {
      return settings;
    },
    get tray() {
      return tray;
    },
    get accounts() {
      return accounts;
    },
    get store() {
      return store;
    },
    get toolSources() {
      return toolSources;
    },
    get associations() {
      return associations;
    },
    readySurfaces,
    applySettings,
    setQuitting: () => (quitting = true),
  };
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', showMain);
  app
    .whenReady()
    .then(async () => {
      store = new LocalStore(app.getPath('userData'), safeStorage);
      const saved = store.settings();
      settings = saved.preferences;
      bounds = saved.bounds;
      const root = path.resolve(__dirname, '..', 'dist', 'client');
      protocol.handle('companion', (request) => {
        try {
          const url = new URL(request.url);
          if (url.host !== 'app') return new Response('', { status: 403 });
          const file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
          if (!file.startsWith(root + path.sep) || !fs.statSync(file).isFile())
            return new Response('', { status: 404 });
          const type =
            {
              '.html': 'text/html; charset=utf-8',
              '.js': 'text/javascript; charset=utf-8',
              '.css': 'text/css; charset=utf-8',
              '.woff2': 'font/woff2',
              '.woff': 'font/woff',
              '.png': 'image/png',
              '.svg': 'image/svg+xml',
            }[path.extname(file)] || 'application/octet-stream';
          return new Response(fs.readFileSync(file), {
            headers: {
              'Content-Type': type,
              'Content-Security-Policy':
                "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
            },
          });
        } catch {
          return new Response('', { status: 404 });
        }
      });
      const factory = smokeMode
        ? smokeMode.clientFactory(createClient)
        : (provider, region) => createClient(provider, region, (...args) => net.fetch(...args));
      accounts = new AccountManager({ store, settings, clientFactory: factory, notify: quotaAlert });
      accounts.load();
      syncActive();
      analytics = new AnalyticsService({ store, monitor, history, client: accounts.active.client });
      if (smokeMode) analytics.file = smokeMode.createDatabase(store.root || app.getPath('userData'));
      toolSources = new ToolSources({ store, legacyFile: analytics.file });
      analytics.tools = toolSources;
      if (!smoke && fs.existsSync(store.file('claude-collector/collector.json'))) {
        claudeCollector = new (require('./claude-collector.cjs').ClaudeCollector)(store.file('claude-collector'));
        try {
          await claudeCollector.start();
          claudeCollector.generateLauncher();
        } catch (e) {
          log.warn('claude-collector', 'start-failed', { stage: 'startup', errno: e?.code });
          claudeCollector.issue = 'Claude 本地采集端口不可用，请重启或重新连接。';
        }
      }
      associations = new Associations({ store, accounts, tools: toolSources });
      toolSources.associations = associations;
      analytics.associations = associations;
      associations.on('change', () => {
        toolSources.cancel();
        broadcast();
      });
      toolSources.on('change', broadcast);
      toolSources.on('status', broadcast);
      accounts.on('change', broadcast);
      try {
        let icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray.png'));
        if (isMac) {
          icon = icon.resize({ width: 18, height: 18 });
          icon.setTemplateImage(true);
        }
        tray = new Tray(icon);
        if (!isMac) {
          tray.on('click', showMain);
          tray.on('double-click', showMain);
        }
      } catch {
        log.warn('main', 'tray-failed');
        tray = null;
      }
      if (isMac && !app.isPackaged)
        app.dock?.setIcon(nativeImage.createFromPath(path.join(__dirname, 'assets', 'app.png')));
      if (isMac)
        Menu.setApplicationMenu(
          Menu.buildFromTemplate([
            {
              label: 'Token 用量助手',
              submenu: [
                { role: 'about', label: '关于 Token 用量助手' },
                { type: 'separator' },
                { role: 'hide', label: '隐藏助手' },
                { role: 'hideOthers', label: '隐藏其他应用' },
                { role: 'unhide', label: '显示全部' },
                { type: 'separator' },
                { role: 'quit', label: '退出助手' },
              ],
            },
            {
              label: '编辑',
              submenu: [
                { role: 'undo' },
                { role: 'redo' },
                { type: 'separator' },
                { role: 'cut' },
                { role: 'copy' },
                { role: 'paste' },
                { role: 'selectAll' },
              ],
            },
            {
              label: '窗口',
              submenu: [
                { label: '打开用量总览', accelerator: 'CommandOrControl+1', click: showMain },
                { role: 'minimize' },
                { role: 'close' },
              ],
            },
          ]),
        );
      mainWindow = secureWindow('main');
      widgetWindow = secureWindow('widget');
      installIpc();
      if (islandPoc) require(path.join(__dirname, 'island-poc', 'index.cjs')).start();
      if (smokeMode) smokeRun = smokeMode.attach(smokeContext());
      else accounts.refreshAll();
      updates = new UpdateChecker({
        currentVersion: app.getVersion(),
        fetch: (...args) => net.fetch(...args),
        onChange: () => broadcast(),
      });
      setUpdateCheck();
      powerMonitor.on('resume', () => {
        accounts.refreshAll();
      });
      // T4.4: no account queries while the screen is locked; unlocking resumes with a staggered refresh.
      powerMonitor.on('lock-screen', () => accounts.pauseAll());
      powerMonitor.on('unlock-screen', () => accounts.resumeAll());
      broadcast();
    })
    .catch((e) => {
      log.error('main', 'startup-failed', { errno: typeof e?.code === 'string' ? e.code : undefined });
      log.flushSync();
      smokeMode?.startupFailed();
      app.exit(1);
    });
  app.on('activate', () => {
    if (app.isReady() && settings) showMain();
  });
  app.on('before-quit', () => {
    quitting = true;
    accounts?.dispose();
    toolSources?.dispose();
    claudeCollector?.close();
    clearTimeout(saveTimer);
    try {
      if (settings && store) savePreferences();
    } catch (e) {
      log.warn('main', 'save-on-quit-failed', { errno: e?.code });
    }
    log.info('main', 'quit');
    log.flushSync();
  });
  app.on('window-all-closed', () => {
    if (!tray) app.quit();
  });
}
