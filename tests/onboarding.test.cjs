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
  assert.match(app, /<AdvancedSettings associations=\{state\.associations\}>\s*<AccountLinks/);
  assert.match(wizard, /filter\(\(item\) => item\.valid === false\)/);
  assert.match(wizard, /attention = review > 0 \|\| !!data\.issue;/);
  assert.match(wizard, /useState\(attention\)/);
  assert.match(wizard, /if \(attention && !open\) setOpen\(true\);/);
});
