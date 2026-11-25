// T20.2–T20.3 (D27 ② ③): the menu bar follows the coding app in front (macOS), or shows a chosen account.
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseActivation,
  parseLsappinfo,
  isHost,
  cliProviders,
  focusFor,
  ForegroundFollower,
} = require('../desktop/foreground-app.cjs');
const { menubarStatus, candidates } = require('../desktop/menubar-status.cjs');
const { panelState } = require('../desktop/menubar-panel.cjs');
const { DEFAULT_SETTINGS, patchSettings } = require('../desktop/domain.cjs');

// The user info Electron hands over, as seen on macOS 15 (2026-11-25 experiment).
const activation = (id, pid) => ({
  NSWorkspaceApplicationKey: `<NSRunningApplication: 0x12400f7a4d0 (${id} - ${pid}) LSASN:{hi=0x0;lo=0x54ac4a7}>`,
});

test('T20.3: the front app comes from the activation notification or lsappinfo', () => {
  assert.deepEqual(parseActivation(activation('com.anthropic.claudefordesktop', 14239)), {
    bundleId: 'com.anthropic.claudefordesktop',
    pid: 14239,
  });
  assert.deepEqual(parseActivation(activation('com.apple.finder', 463)), { bundleId: 'com.apple.finder', pid: 463 });
  for (const bad of [
    null,
    {},
    { NSWorkspaceApplicationKey: 42 },
    { NSWorkspaceApplicationKey: '<NSRunningApplication>' },
  ])
    assert.equal(parseActivation(bad), null);
  assert.deepEqual(parseLsappinfo('"CFBundleIdentifier"="com.apple.Terminal"\n"pid"=72116\n'), {
    bundleId: 'com.apple.Terminal',
    pid: 72116,
  });
  assert.equal(parseLsappinfo('"pid"=1'), null);
  assert.equal(parseLsappinfo(''), null);
});

// A synthetic process table: Terminal (100) → login → zsh → claude; VS Code (200) → helper → zsh → codex and claude;
// iTerm (300) → zsh → node (a node-based CLI); a claude outside any terminal (999).
const PS = [
  '  100     1 /System/Applications/Utilities/Terminal.app/Contents/MacOS/Terminal',
  '  101   100 login',
  '  102   101 -zsh',
  '  103   102 /Users/x/.local/bin/claude',
  '  200     1 /Applications/Visual Studio Code.app/Contents/MacOS/Electron',
  '  201   200 Code Helper (Plugin)',
  '  202   201 /bin/zsh',
  '  203   202 codex',
  '  204   202 claude',
  '  300     1 iTerm2',
  '  301   300 -zsh',
  '  302   301 node',
  '  999     1 claude',
].join('\n');

test('T20.3: only executable names under the terminal count; node-based tools are not guessed', () => {
  assert.deepEqual(cliProviders(PS, 100), ['claude']);
  assert.deepEqual(cliProviders(PS, 200), ['claude', 'codex']);
  assert.deepEqual(cliProviders(PS, 300), []);
  assert.deepEqual(cliProviders(PS, 12345), []);
  assert.deepEqual(cliProviders('', 100), []);
  assert.equal(isHost('com.apple.Terminal'), true);
  assert.equal(isHost('com.jetbrains.intellij'), true);
  assert.equal(isHost('com.apple.Safari'), false);
});

test('T20.3: apps map to platforms; terminals only when exactly one known tool runs inside', async () => {
  const ps = async () => PS;
  assert.deepEqual(await focusFor({ bundleId: 'com.anthropic.claudefordesktop', pid: 1 }, ps), {
    provider: 'claude',
    source: 'Claude 桌面版',
  });
  assert.equal((await focusFor({ bundleId: 'com.openai.codex', pid: 1 }, ps))?.provider, 'codex');
  assert.equal((await focusFor({ bundleId: 'ai.commandcode.desktop', pid: 1 }, ps))?.provider, 'commandcode');
  assert.deepEqual(await focusFor({ bundleId: 'com.apple.Terminal', pid: 100 }, ps), {
    provider: 'claude',
    source: '终端或编辑器里的 claude',
  });
  // Two tools, none, an unrelated app, the assistant itself, or a failed listing: keep the previous one.
  assert.equal(await focusFor({ bundleId: 'com.microsoft.VSCode', pid: 200 }, ps), null);
  assert.equal(await focusFor({ bundleId: 'com.googlecode.iterm2', pid: 300 }, ps), null);
  assert.equal(await focusFor({ bundleId: 'com.apple.Safari', pid: 5 }, ps), null);
  assert.equal(await focusFor({ bundleId: 'local.commandcode.tokenusageassistant', pid: 6 }, ps), null);
  assert.equal(
    await focusFor({ bundleId: 'com.apple.Terminal', pid: 100 }, () => Promise.reject(new Error('ps'))),
    null,
  );
  // The process list is read only for terminals and editors.
  let listed = 0;
  await focusFor({ bundleId: 'com.apple.Safari', pid: 5 }, async () => (listed++, PS));
  await focusFor({ bundleId: 'com.anthropic.claudefordesktop', pid: 1 }, async () => (listed++, PS));
  assert.equal(listed, 0);
});

test('T20.3: the follower keeps the last focus, reports only changes and never lets a late answer win', async () => {
  /** @type {any[]} */
  const changes = [];
  let release = () => {};
  const slow = new Promise((resolve) => (release = () => resolve(PS)));
  const f = new ForegroundFollower({ listProcesses: () => slow, onChange: (x) => changes.push(x?.provider ?? null) });
  await f.activated({ bundleId: 'com.anthropic.claudefordesktop', pid: 1 });
  await f.activated({ bundleId: 'com.anthropic.claudefordesktop', pid: 1 });
  await f.activated({ bundleId: 'com.apple.Safari', pid: 5 });
  assert.deepEqual(changes, ['claude']);
  // A terminal is activated (its process list is slow), then the Codex app: the terminal's answer comes too late.
  const terminal = f.activated({ bundleId: 'com.apple.Terminal', pid: 100 });
  await f.activated({ bundleId: 'com.openai.codex', pid: 2 });
  release();
  await terminal;
  assert.deepEqual(changes, ['claude', 'codex']);
  assert.equal(f.focus?.provider, 'codex');
  await f.activated(null);
  f.reset();
  f.reset();
  assert.deepEqual(changes, ['claude', 'codex', null]);
});

const account = (id, provider, five, extra = {}) => ({
  id,
  label: id,
  provider,
  active: false,
  capabilities: { quota: true, balance: false },
  status: 'connected',
  parts: {
    credits: {
      windows: [
        { id: 'w', label: '5 小时窗口', applicable: true, remainingPercent: five, resetAt: 1, resetState: 'scheduled' },
      ],
    },
  },
  ...extra,
});
const list = [
  account('glm', 'glm', 10),
  account('claude', 'claude', 80),
  account('codex-a', 'codex', 60),
  account('codex-b', 'codex', 30),
];

test('T20.2: the icon shows the account of the app in front, a fixed account, or the most urgent one', () => {
  const base = { threshold: 20 };
  // Following the front app (the default): that platform's most urgent account.
  assert.equal(menubarStatus(list, { ...base, focusProvider: 'claude' })?.accountId, 'claude');
  assert.equal(
    menubarStatus(list, { ...base, menubarAccount: 'foreground', focusProvider: 'codex' })?.accountId,
    'codex-b',
  );
  // Nothing in front yet, or a platform without an account: the most urgent account, as before.
  assert.equal(menubarStatus(list, base)?.accountId, 'glm');
  assert.equal(menubarStatus(list, { ...base, focusProvider: 'kimi-code' })?.accountId, 'glm');
  // Automatic ignores the app in front.
  assert.equal(menubarStatus(list, { ...base, menubarAccount: 'auto', focusProvider: 'claude' })?.accountId, 'glm');
  // A fixed account wins over everything; a removed one falls back.
  assert.equal(
    menubarStatus(list, { ...base, menubarAccount: 'codex-a', focusProvider: 'claude' })?.accountId,
    'codex-a',
  );
  assert.equal(menubarStatus(list, { ...base, menubarAccount: 'gone' })?.accountId, 'glm');
  assert.equal(candidates(list, { ...base, menubarAccount: 'gone' }).length, 4);
  // The panel opens on the account the icon shows; its list keeps every account, most urgent first.
  const p = panelState(list, { ...base, focusProvider: 'claude' });
  assert.equal(p.defaultAccountId, 'claude');
  assert.deepEqual(
    p.accounts.map((a) => a.id),
    ['glm', 'codex-b', 'codex-a', 'claude'],
  );
});

test('T20.2: the setting defaults to following the front app and accepts only a mode or an account id', () => {
  assert.equal(DEFAULT_SETTINGS.menubarAccount, 'foreground');
  for (const v of ['auto', 'foreground', 'cc471589-0e18-42f7-9a74-fdafe800b166'])
    assert.equal(patchSettings(DEFAULT_SETTINGS, { menubarAccount: v }).menubarAccount, v);
  for (const v of ['', ' auto', 'a/b', 42, null, 'x'.repeat(65)])
    assert.throws(() => patchSettings(DEFAULT_SETTINGS, { menubarAccount: v }));
});
