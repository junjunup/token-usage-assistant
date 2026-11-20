const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { providerGroups, wizardPending, wizardSteps } = require('../desktop/onboarding.cjs');
const { PROVIDERS } = require('../desktop/provider-catalog.cjs');
const { DEFAULT_SETTINGS, patchSettings } = require('../desktop/domain.cjs');

// T11.4: the first-run wizard and the collapsed "advanced" settings area.
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const fresh = { settings: { ...DEFAULT_SETTINGS }, accounts: [], toolSources: [], hasCredential: false };

test('T11.4: the wizard opens only on a fresh start — never for users upgrading with data, after skipping, or over an unreadable account list', () => {
  assert.equal(DEFAULT_SETTINGS.setupWizard, true);
  assert.equal(wizardPending(fresh), true);
  // A settings file from before T11.4 has no setupWizard key: it counts as not yet shown.
  const older = { ...DEFAULT_SETTINGS };
  delete older.setupWizard;
  assert.equal(wizardPending({ ...fresh, settings: older }), true);
  // Upgrading users with an account, or with only a tool source, never see it.
  assert.equal(wizardPending({ ...fresh, accounts: [{ id: 'a' }], hasCredential: true }), false);
  assert.equal(wizardPending({ ...fresh, toolSources: [{ id: 's', kind: 'zcode' }] }), false);
  assert.equal(wizardPending({ ...fresh, hasCredential: true }), false);
  // Skipped or finished: never again, even with no data.
  assert.equal(wizardPending({ ...fresh, settings: patchSettings(DEFAULT_SETTINGS, { setupWizard: false }) }), false);
  // An account list that could not be read is not a fresh start.
  assert.equal(wizardPending({ ...fresh, credentialIssue: '本机账户列表暂不可用' }), false);
  assert.equal(wizardPending(null), false);
  assert.throws(() => patchSettings(DEFAULT_SETTINGS, { setupWizard: 'no' }));
});

test('T11.4: step 1 lists every platform exactly once, grouped by what it reports', () => {
  const groups = providerGroups(PROVIDERS);
  const ids = groups.flatMap((g) => g.providers.map((p) => p.id));
  assert.deepEqual([...ids].sort(), PROVIDERS.map((p) => p.id).sort());
  const of = (id) => groups.find((g) => g.providers.some((p) => p.id === id)).id;
  assert.equal(of('codex'), 'subscription');
  assert.equal(of('claude'), 'subscription');
  assert.equal(of('deepseek'), 'balance');
  assert.equal(of('kimi'), 'balance');
  assert.equal(of('openrouter'), 'key');
  for (const id of ['commandcode', 'glm', 'minimax', 'volcengine', 'opencode-go']) assert.equal(of(id), 'plan');
  assert.deepEqual(
    groups.map((g) => g.id),
    ['plan', 'subscription', 'balance', 'key'],
  );
  assert.equal(groups[0].providers[0].id, 'commandcode');
  // A platform added later still appears, at the end of the group its kind picks.
  const extra = { id: 'new-plan', name: 'New', credential: 'apiKey', capabilities: { quota: true, balance: false } };
  const plan = providerGroups([...PROVIDERS, extra]).find((g) => g.id === 'plan').providers;
  assert.equal(plan.at(-1).id, 'new-plan');
});

test('T11.4: the steps — three on macOS, a fourth tray-pin step on Windows; local logins need no key', () => {
  assert.deepEqual(wizardSteps({ platform: 'darwin', credential: 'apiKey' }), [
    '选择平台',
    '填写密钥',
    '本机工具（可选）',
  ]);
  assert.deepEqual(wizardSteps({ platform: 'win32', credential: 'aksk' }), [
    '选择平台',
    '填写密钥',
    '本机工具（可选）',
    '固定托盘图标',
  ]);
  assert.equal(wizardSteps({ platform: 'darwin', credential: 'local' })[1], '连接本机登录');
});

test('T11.4: the app keeps the wizard open while it is used, and finishing or skipping turns it off for good', () => {
  const app = read('src/DesktopApp.jsx'),
    wizard = read('src/Onboarding.jsx'),
    form = read('src/ProviderViews.jsx');
  // Opens by itself only when pending, then stays (connecting an account in step 2 must not close it).
  assert.match(app, /if \(!wizardOpen && !widget && wizardPending\(state\)\) setWizardOpen\(true\);/);
  assert.match(app, /const setup = view === 'overview' && wizardOpen && settings\.setupWizard !== false;/);
  assert.match(app, /const skipSetup = \(\) => pref\(\{ setupWizard: false \}\);/);
  // Finishing on Windows also retires the overview's pin note: the wizard just said the same thing.
  assert.match(app, /setupWizard: false, \.\.\.\(state\.platform === 'win32' \? \{ trayPinHint: false \} : \{\}\)/);
  // Connecting and adding sources use the same bridge calls as settings; the wizard reads no files itself.
  assert.match(app, /connect=\{\(value\) => action\(\(\) => bridge\.connect\(value\)/);
  assert.match(app, /addSource=\{\(kind, label\) => action\(\(\) => bridge\.addToolSource\(\{ kind, label \}\)\)\}/);
  assert.doesNotMatch(wizard, /require\(|readFile|fs\./);
  // Step 2 is the settings form in wizard mode: a new connection only, never update or remove.
  assert.match(form, /const active = wizard \? null : /);
});

test('T11.4: account links sit in a collapsed "advanced" area that opens by itself when something needs re-confirming', () => {
  const app = read('src/DesktopApp.jsx'),
    wizard = read('src/Onboarding.jsx');
  assert.match(
    app,
    /<AdvancedSettings associations=\{state\.associations\} initialOpen=\{linksOpen\}>\s*<AccountLinks/,
  );
  assert.match(wizard, /filter\(\(item\) => item\.valid === false\)/);
  assert.match(wizard, /attention = review > 0 \|\| !!data\.issue;/);
  assert.match(wizard, /useState\(attention \|\| initialOpen\)/);
  assert.match(wizard, /if \(attention && !open\) setOpen\(true\);/);
});

test('T16.1: three navigation items, coverage inside analytics, settings in tabs that never hide a pending link', () => {
  const app = read('src/DesktopApp.jsx'),
    rail = app.slice(app.indexOf('<div className="rail-nav">'), app.indexOf('<div className="rail-bottom">'));
  // Overview, analytics, settings; the coverage report is a tab of analytics, not a rail item.
  assert.equal((rail.match(/<IconButton/g) || []).length, 3);
  assert.doesNotMatch(rail, /reconciliation'\)/);
  assert.match(app, /\{ value: 'reconciliation', label: t\('数据覆盖'\) \}/);
  // Five settings tabs; links waiting for re-confirmation are counted on the advanced tab.
  for (const tab of ['accounts', 'tools', 'alerts', 'system', 'advanced'])
    assert.match(app, new RegExp(`settingsTab === '${tab}'`));
  assert.match(app, /\{ value: 'advanced', label: t\('高级'\), count: linksReview \}/);
  assert.match(app, /const linksReview = \[[\s\S]*?\]\.filter\(\s*\(item\) => item\.valid === false,?\s*\)\.length;/);
  // Every switch is still reachable, with the same setting key; dark mode stays on the rail only.
  for (const key of [
    'notifications',
    'floating',
    'launchAtLogin',
    'updateCheck',
    'claudeStatusQuota',
    'statusExport',
    'providerStatus',
  ])
    assert.match(app, new RegExp(`toggleRow\\('${key}'\\)`));
  assert.doesNotMatch(app, /t\('开启深色外观'\)/);
  assert.match(app, /onClick=\{changeTheme\}/);
  // Links into settings land on the tab they are about.
  assert.match(app, /openSettings\('system', 'menubar-settings'\)/);
  assert.match(app, /onManageSources=\{\(\) => openSettings\('tools'\)\}/);
  assert.match(app, /onSettings=\{\(\) => openSettings\('advanced', 'account-links'\)\}/);
});

test('T16.2: the overview lists accounts from the first one, has no switcher row, and keeps local tools apart', () => {
  const app = read('src/DesktopApp.jsx'),
    tools = read('src/LocalToolsOverview.jsx');
  assert.match(app, /overviewCards = \(overview\?\.rows\?\.length \|\| 0\) >= 1;/);
  // The switcher row is only on analytics and on the settings' accounts tab.
  assert.match(
    app,
    /\{!setup && \(view === 'analytics' \|\| \(view === 'settings' && settingsTab === 'accounts'\)\) && \(/,
  );
  // Local tools: today and 7 days, every enabled source, never added to account figures.
  // One 7-day query that carries today: tool queries run one at a time, so two would cancel each other.
  assert.equal((app.match(/source: 'tools', range:/g) || []).length, 1);
  assert.match(app, /useAnalytics\(bridge, \{ source: 'tools', range: '7d' \}, state, toolsShown\)/);
  assert.match(tools, /part\?\.bySource/);
  assert.match(tools, /byId\(usable\?\.today\)/);
  assert.match(tools, /t\('本机工具统计，不与上面的账户相加'\)/);
  // Missing stays "—" (never 0); a partial total says it is the known part.
  assert.match(tools, /return \{ text: '—', partial: false \};\n\}/);
  assert.match(tools, /value\.partial \? t\(' · 已知部分'\) : ''/);
  assert.doesNotMatch(tools, /\|\| 0\b/);
});

test('T17.1: the overview lists tools found but not added; adding still goes through the system picker', () => {
  const app = read('src/DesktopApp.jsx'),
    tools = read('src/LocalToolsOverview.jsx');
  // Found tools come from discovery (existence only) and skip the ones already added or ignored.
  assert.match(
    tools,
    /onDiscover\?\.\(\)\.then\(\(r\) => live && r\?\.ok && setFound\(r\.value\.filter\(\(f\) => !f\.added\)\)\)/,
  );
  assert.match(tools, /found\.filter\(\(f\) => !ignored\.includes\(f\.kind\)\)/);
  // "Add" sends only the kind: the main process opens the picker at the default location for the user to confirm.
  assert.match(
    app,
    /onAdd=\{\(kind\) => action\(\(\) => bridge\.addToolSource\(\{ kind, label: kindName\(kind\) \}\)\)\}/,
  );
  assert.doesNotMatch(tools, /file:|\.path\b.*addToolSource/);
  // The ignore list is a validated setting of tool kinds only.
  assert.deepEqual(DEFAULT_SETTINGS.ignoredFound, []);
  assert.deepEqual(patchSettings(DEFAULT_SETTINGS, { ignoredFound: ['codex', 'codex', 'gemini-cli'] }).ignoredFound, [
    'codex',
    'gemini-cli',
  ]);
  for (const bad of ['codex', [1], ['../x'], ['A'], Array.from({ length: 21 }, (_, i) => 'k' + 'a'.repeat(i))])
    assert.throws(() => patchSettings(DEFAULT_SETTINGS, { ignoredFound: bad }));
  // The launch-script source is named after how it collects, apart from the session logs.
  assert.match(read('src/ToolSources.jsx'), /'claude-code': t\('Claude Code（启动脚本）'\)/);
});
