// Only loaded by --smoke-test, before the smoke configures any credential. T11.4: the first-run wizard shows on the
// overview of an empty profile, stays open once an account is connected through it, and closes for good on finish.
// The smoke profile starts with one tool source (its synthetic database, migrated as the legacy Zcode source), so
// the section hides it in memory only (nothing persisted) and puts it back afterwards. The account the wizard
// connects is synthetic (fixture client) and removed again, so the later sections start as before.
const assert = require('node:assert/strict');
const { ipcMain } = require('electron');
const { PROVIDERS } = require('../provider-catalog.cjs');
const isWin = process.platform === 'win32';
async function until(win, expression, ms = 10000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await win.webContents.executeJavaScript(expression)) return;
    await new Promise((r) => setTimeout(r, 40));
  }
  throw Error('Onboarding view did not settle: ' + expression);
}
const click = (win, selector, text) =>
  win.webContents.executeJavaScript(
    `[...document.querySelectorAll(${JSON.stringify(selector)})].find((e) => e.textContent.includes(${JSON.stringify(text)})).click()`,
  );
async function runOnboardingSmoke({ accounts, toolSources, mainWindow, settings, applySettings }) {
  const checks = {},
    main = mainWindow,
    sources = toolSources.entries;
  let connected = null;
  toolSources.entries = [];
  toolSources.changed();
  ipcMain.removeHandler('assistant:connect');
  ipcMain.handle('assistant:connect', async (event, value) => {
    assert.equal(event.sender, main.webContents);
    assert.equal(value.provider, 'kimi');
    assert.equal(value.region, 'global');
    await accounts.connect({ ...value, label: 'Kimi 向导样例' });
    connected = accounts.activeId;
    return { ok: true, value: { connectionMessage: '本机连接已保存。' } };
  });
  try {
    await until(main, "!!document.querySelector('.wz-panel')");
    const steps = await main.webContents.executeJavaScript(
      "[...document.querySelectorAll('.wz-steps li')].map((e) => e.textContent)",
    );
    assert.deepEqual(steps, ['1选择平台', '2填写密钥', '3本机工具（可选）', ...(isWin ? ['4固定托盘图标'] : [])]);
    assert.equal(
      await main.webContents.executeJavaScript("document.querySelectorAll('.wz-tile').length"),
      PROVIDERS.length,
    );
    // While the wizard is open the overview shows no account grid and no dashboard.
    assert.equal(
      await main.webContents.executeJavaScript(
        "!!document.querySelector('.aa-tile, .provider-dashboard, .balance-dashboard')",
      ),
      false,
    );
    checks.shownOnEmptyProfile = true;
    await click(main, '.wz-tile', 'Kimi 开放平台');
    await until(main, "document.querySelectorAll('.wz-chip').length===2");
    await click(main, '.wz-chip', '国际');
    await click(main, '.wz-actions .button.primary', '下一步');
    await until(main, "!!document.querySelector('.wz-key #api-key')");
    assert.match(
      await main.webContents.executeJavaScript("document.querySelector('.wz-steps li.current').textContent"),
      /填写密钥/,
    );
    assert.match(await main.webContents.executeJavaScript("document.querySelector('.wz-key').textContent"), /国际/);
    await main.webContents.executeJavaScript(
      "(()=>{const e=document.querySelector('.wz-key #api-key');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'native-synthetic-kimi-key');e.dispatchEvent(new Event('input',{bubbles:true}));})()",
    );
    await until(main, "!document.querySelector('.wz-key button[type=submit]').disabled");
    await main.webContents.executeJavaScript("document.querySelector('.wz-key button[type=submit]').click()");
    // Connected through the wizard: it stays open on the optional tools step instead of closing.
    await until(main, "document.querySelector('.wz-steps li.current')?.textContent.includes('本机工具')");
    assert.ok(connected && accounts.entries.length === 1);
    assert.match(
      await main.webContents.executeJavaScript("document.querySelector('.wz-done').textContent"),
      /已连接 Kimi/,
    );
    assert.equal(await main.webContents.executeJavaScript("document.querySelectorAll('.wz-tool').length"), 12);
    assert.equal(await main.webContents.executeJavaScript("!!document.querySelector('.wz-panel')"), true);
    checks.staysOpenAfterConnect = true;
    if (isWin) {
      await click(main, '.wz-actions .button.primary', '下一步');
      await until(main, "!!document.querySelector('.wz-pin')");
      checks.pinStep = true;
    }
    await click(main, '.wz-actions .button.primary', isWin ? '开始使用' : '完成');
    await until(main, "!document.querySelector('.wz-panel')");
    assert.equal(settings().setupWizard, false);
    // T11.4: finishing on Windows also retires the pin note; the overview section expects it, so it comes back.
    assert.equal(settings().trayPinHint, !isWin);
    checks.closedForGood = true;
    // The connection toast would still be up for the next sections (they check that no toast shows).
    await main.webContents.executeJavaScript(
      'document.querySelector(\'.toast button[aria-label="关闭提示"]\')?.click()',
    );
    await until(main, "!document.querySelector('.toast')");
    return { ok: true, checks, steps: steps.length };
  } finally {
    ipcMain.removeHandler('assistant:connect');
    ipcMain.handle('assistant:connect', () => ({ ok: false, error: '测试模式不保存真实账户' }));
    if (isWin) applySettings({ ...settings(), trayPinHint: true });
    if (connected && accounts.runtimes.has(connected)) accounts.remove(connected);
    toolSources.entries = sources;
    toolSources.changed();
  }
}
module.exports = { runOnboardingSmoke };
