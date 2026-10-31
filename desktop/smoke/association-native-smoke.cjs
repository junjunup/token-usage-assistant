// Test-only native flow. No real credentials, provider calls or tool logs.
const fs = require('node:fs'),
  assert = require('node:assert/strict');
async function until(win, expression) {
  const end = Date.now() + 6000;
  while (Date.now() < end) {
    if (await win.webContents.executeJavaScript(expression)) return;
    await new Promise((r) => setTimeout(r, 35));
  }
  throw Error('Association view did not settle: ' + expression);
}
async function capture(win, file) {
  await win.webContents.executeJavaScript('document.getAnimations().forEach(a=>{try{a.finish()}catch{}})');
  await win.webContents.capturePage();
  await new Promise((r) => setTimeout(r, 400));
  fs.writeFileSync(file, (await win.webContents.capturePage()).toPNG());
}
async function input(win, label, value) {
  await win.webContents.executeJavaScript(
    `(()=>{const e=document.querySelector('input[aria-label="${label}"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`,
  );
}
async function select(win, label, text) {
  await until(win, `!document.querySelector('button[aria-label="${label}"]').disabled`);
  await win.webContents.executeJavaScript(
    `document.querySelector('button[aria-label="${label}"]').scrollIntoView({block:'center'})`,
  );
  await new Promise((r) => setTimeout(r, 80));
  await win.webContents.executeJavaScript(`document.querySelector('button[aria-label="${label}"]').click()`);
  await until(win, "!!document.querySelector('[role=listbox]')");
  await win.webContents.executeJavaScript(
    `[...document.querySelectorAll('[role=option]')].find(e=>e.textContent.includes(${JSON.stringify(text)})).click()`,
  );
}
async function runAssociationSmoke({
  accounts,
  toolSources,
  associations,
  analytics,
  store,
  mainWindow,
  settings,
  applySettings,
}) {
  const checks = {},
    first = accounts.entries.find((e) => e.provider === 'deepseek');
  assert.ok(first);
  await accounts.connect({
    provider: 'deepseek',
    region: 'global',
    label: '备用 Key 样例',
    apiKey: 'synthetic-shared-balance-key',
  });
  const second = accounts.entries.find((e) => e.label === '备用 Key 样例');
  await mainWindow.webContents.executeJavaScript(
    'document.querySelector(\'button[aria-label="覆盖范围报告"]\').click()',
  );
  await until(mainWindow, "!!document.querySelector('.reconciliation-empty')");
  checks.emptyState = true;
  await mainWindow.webContents.executeJavaScript('document.querySelector(\'button[aria-label="账户与设置"]\').click()');
  // T11.4: account links sit in the "advanced" area, collapsed while nothing needs re-confirming.
  await until(mainWindow, "!!document.querySelector('.st-advanced-head')");
  assert.equal(
    await mainWindow.webContents.executeJavaScript(
      "document.querySelector('.st-advanced-head').getAttribute('aria-expanded')==='false' && !document.querySelector('.account-links-panel')",
    ),
    true,
  );
  checks.advancedCollapsed = true;
  await mainWindow.webContents.executeJavaScript("document.querySelector('.st-advanced-head').click()");
  await until(mainWindow, "!!document.querySelector('.st-advanced-body .account-links-panel')");
  await input(mainWindow, '计费账户名称', '我的 DeepSeek 计费账户');
  for (const entry of [first, second]) {
    const i = accounts.entries.indexOf(entry);
    await mainWindow.webContents.executeJavaScript(
      `document.querySelectorAll('.association-form fieldset input')[${i}].click()`,
    );
  }
  await mainWindow.webContents.executeJavaScript(
    'document.querySelector(\'input[aria-label="确认同一计费账户"]\').click()',
  );
  await until(mainWindow, "!document.querySelector('.association-form button[type=submit]').disabled");
  await mainWindow.webContents.executeJavaScript(
    "document.querySelector('.association-form button[type=submit]').click()",
  );
  await until(mainWindow, "document.querySelectorAll('.association-list')[0].textContent.includes('我的 DeepSeek')");
  assert.equal(associations.groups.length, 1);
  const g = associations.groups[0];
  assert.equal(g.primaryId, first.id);
  assert.equal(g.members.length, 2);
  checks.nativeManualGrouping = true;
  const source = toolSources.entries.find((s) => s.kind === 'harness');
  await select(mainWindow, '关联工具数据源', source.label);
  await select(mainWindow, '关联计费账户', '我的 DeepSeek');
  const from = Date.now() - 86400000,
    d = new Date(from),
    local = new Date(from - d.getTimezoneOffset() * 60000).toISOString().slice(0, 23);
  await input(mainWindow, '关联生效时间', local);
  await mainWindow.webContents.executeJavaScript(
    'document.querySelector(\'input[aria-label="确认工具记录归属"]\').click()',
  );
  await until(mainWindow, "!document.querySelectorAll('.association-form button[type=submit]')[1].disabled");
  await mainWindow.webContents.executeJavaScript(
    "document.querySelectorAll('.association-form button[type=submit]')[1].click()",
  );
  await until(mainWindow, "document.querySelectorAll('.association-list')[1].textContent.includes('我的 DeepSeek')");
  assert.equal(associations.rules.length, 1);
  checks.nativeManualRule = true;
  applySettings({ ...settings, theme: 'light' });
  await until(mainWindow, "!document.querySelector('.native-app.dark')");
  await mainWindow.webContents.executeJavaScript(
    "document.querySelector('.account-links-panel').scrollIntoView({block:'start'})",
  );
  await capture(mainWindow, store.file('association-settings-light.png'));
  await mainWindow.webContents.executeJavaScript('document.querySelector(\'button[aria-label="用量分析"]\').click()');
  await until(mainWindow, '!!document.querySelector(\'button[aria-label="工具计费账户"]\')');
  // Exercise the same custom dropdown keyboard interaction used by account filtering.
  await mainWindow.webContents.executeJavaScript(
    "(()=>{const e=document.querySelector('button[aria-label=\"工具计费账户\"]');e.focus();e.dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true}));})()",
  );
  await until(mainWindow, "!!document.querySelector('[role=listbox]')");
  await mainWindow.webContents.executeJavaScript(
    "document.querySelector('button[aria-label=\"工具计费账户\"]').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))",
  );
  await until(
    mainWindow,
    "document.querySelector('button[aria-label=\"工具计费账户\"]').textContent.includes('我的 DeepSeek') && document.querySelector('.analysis-stats') && !document.querySelector('.analysis-refresh').disabled",
  );
  const result = await analytics.get({ source: 'tools', billingGroupId: g.id, range: 'today' });
  assert.equal(result.summary.total, 120);
  assert.equal(result.accountId, g.id);
  checks.keyboardGroupFilter = true;
  checks.nativeWorkerAssociation = true;
  accounts.select(accounts.entries.find((e) => e.provider !== 'deepseek').id);
  await new Promise((r) => setTimeout(r, 200));
  await until(
    mainWindow,
    "document.querySelector('button[aria-label=\"工具计费账户\"]').textContent.includes('我的 DeepSeek') && !document.querySelector('.analysis-refresh').disabled",
  );
  assert.equal((await analytics.get({ source: 'tools', billingGroupId: g.id })).summary.total, 120);
  checks.activeSelectionDoesNotReattribute = true;
  await mainWindow.webContents.executeJavaScript(
    'document.querySelector(\'button[aria-label="覆盖范围报告"]\').click()',
  );
  await until(
    mainWindow,
    "document.querySelector('.reconciliation-result h2')?.textContent.includes(' 个来源 · ') && document.querySelector('.reconciliation-result')?.textContent.includes('暂不能计算差值') && document.querySelector('.coverage-associations')?.textContent.includes('人工确认')",
  );
  const report = await analytics.get({ source: 'reconciliation', groupId: g.id });
  assert.equal(report.platform.memberCount, 2);
  assert.equal(report.platform.connectionId, first.id);
  assert.equal(report.errorRate, null);
  assert.equal(report.sumOfPlatformAndTools, null);
  checks.singlePrimaryNoSummation = true;
  // T6.2: while the comparison is unavailable the page has no difference block at all.
  assert.equal(
    await mainWindow.webContents.executeJavaScript("!!document.querySelector('.reconciliation-difference')"),
    false,
  );
  checks.noFakeDifference = true;
  await mainWindow.webContents.executeJavaScript("document.querySelector('.main-content').scrollTo({top:0})");
  await capture(mainWindow, store.file('reconciliation-light.png'));
  applySettings({ ...settings, theme: 'dark' });
  await until(mainWindow, "!!document.querySelector('.native-app.dark')");
  await capture(mainWindow, store.file('reconciliation-dark.png'));
  checks.lightDarkRendered = true;
  assert.equal(
    await mainWindow.webContents.executeJavaScript(
      "document.querySelector('.reconciliation-page').scrollWidth<=document.querySelector('.reconciliation-page').clientWidth+1",
    ),
    true,
  );
  checks.noHorizontalOverflow = true;
  const { Associations } = require('../associations.cjs'),
    restored = new Associations({ store, accounts, tools: toolSources });
  assert.deepEqual(restored.publicState(), associations.publicState());
  checks.nativeRestartPreservesRules = true;
  assert.doesNotMatch(
    fs.readFileSync(associations.file, 'utf8'),
    /synthetic-shared-balance-key|native-synthetic-deepseek-key/,
  );
  checks.privateKeysExcluded = true;
  return { ok: true, checks, syntheticOnly: true, liveAccountReconciliation: false, modelCalls: false };
}
module.exports = { runAssociationSmoke };
