// Only invoked by --smoke-test, with an isolated userData directory and synthetic keys.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { AccountManager } = require('../accounts.cjs');
const { createClient } = require('../providers.cjs');
const { fixtureFetch } = require('../provider-fixture.cjs');
async function until(win, expression) {
  const deadline = Date.now() + 4000;
  while (Date.now() < deadline) {
    const value = await win.webContents.executeJavaScript(expression);
    if (value) return value;
    await new Promise((r) => setTimeout(r, 30));
  }
  throw new Error('provider renderer state did not settle');
}
async function runProviderSmoke({ accounts, store, mainWindow, widgetWindow, settings, applySettings }) {
  const checks = [];
  for (const provider of ['glm', 'minimax', 'volcengine']) {
    await accounts.connect({
      provider,
      region: provider === 'volcengine' ? 'cn-beijing' : 'cn',
      label: provider + ' fixture',
      apiKey: 'native-synthetic-key',
      accessKeyId: 'native-synthetic-ak',
      secretKey: 'native-synthetic-sk',
    });
    const c = accounts.active.monitor.state.parts.credits;
    assert.ok(c.windows.length >= 3);
    await until(
      mainWindow,
      "document.querySelector('.provider-dashboard') && document.querySelector('.account-switcher').textContent.includes('" +
        provider +
        " fixture')",
    );
    await until(
      widgetWindow,
      "document.querySelector('.provider-widget-account')?.textContent.includes('" + provider + " fixture')",
    );
    const rows = await until(mainWindow, "document.querySelectorAll('.provider-quota-grid .quota-row').length");
    assert.equal(rows, c.windows.length);
    const text = await mainWindow.webContents.executeJavaScript(
      "document.querySelector('.provider-dashboard').textContent",
    );
    assert.ok(!text.includes('$'));
    assert.ok(!text.includes('NaN'));
    checks.push({
      provider,
      windows: rows,
      renderer: true,
      widget: true,
      status: accounts.active.monitor.state.status,
    });
  }
  applySettings({ ...settings, theme: 'dark', widgetExpanded: true });
  await until(mainWindow, "document.querySelector('.native-app.dark')!==null");
  await until(widgetWindow, "document.querySelectorAll('.provider-widget-quota').length===4");
  const secretFile = fs.readFileSync(store.file('accounts.encrypted.json'), 'utf8');
  assert.ok(!secretFile.includes('native-synthetic'));
  const restored = new AccountManager({ store, settings, clientFactory: (p, r) => createClient(p, r, fixtureFetch) });
  try {
    restored.load();
    assert.equal(restored.entries.length, 3);
    assert.equal(restored.activeId, accounts.activeId);
    assert.equal(restored.issue, '');
  } finally {
    restored.dispose();
  }
  assert.ok([...accounts.runtimes.values()].every((r) => !!r.monitor.timer));
  const lastId = accounts.activeId;
  accounts.remove();
  assert.equal(accounts.entries.length, 2);
  assert.ok(!accounts.runtimes.has(lastId));
  await until(mainWindow, "document.querySelector('.account-switcher').textContent.includes('glm fixture')");
  return {
    ok: true,
    checks,
    encryptedVault: true,
    reload: true,
    independentTimers: true,
    removeIsolation: true,
    darkTheme: true,
    expandedWidget: true,
  };
}
module.exports = { runProviderSmoke };
