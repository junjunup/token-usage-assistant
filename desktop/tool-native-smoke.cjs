// Isolated fixture-only native checks. Invoked only by --smoke-test.
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { createHarness, harnessWire } = require('./tool-fixture.cjs');
const { ToolSources } = require('./tool-sources.cjs');
async function until(win, expression) {
  const until = Date.now() + 8000;
  while (Date.now() < until) {
    if (await win.webContents.executeJavaScript(expression)) return true;
    await new Promise((r) => setTimeout(r, 40));
  }
  throw new Error('tool renderer did not settle');
}
async function runToolSmoke({ toolSources, analytics, store, accounts, mainWindow, settings, applySettings }) {
  const root = path.join(store.root, 'harness-smoke'),
    file = createHarness(root, [harnessWire()]);
  const h = toolSources.add({ kind: 'harness', file, label: 'Harness native fixture' });
  const legacy = await analytics.get({ source: 'local', range: '7d' }),
    both = await analytics.get({ source: 'tools', range: '7d' });
  assert.equal(both.summary.knownTokens, legacy.summary.knownTokens + 120);
  assert.equal(both.summary.requests, legacy.summary.requests + 1);
  assert.equal(both.accountId, null);
  assert.equal(both.credits, null);
  assert.equal(both.prediction, null);
  fs.appendFileSync(
    file,
    JSON.stringify(harnessWire(undefined, { timestamp: both.range.end - 60000, updatedAt: both.range.end - 1000 })) +
      '\n',
  );
  assert.equal((await analytics.get({ source: 'tools', range: '7d' })).summary.requests, both.summary.requests);
  const savedId = accounts.activeId;
  accounts.select(accounts.entries.find((e) => e.id !== savedId).id);
  assert.equal((await analytics.get({ source: 'tools', range: '7d' })).summary.knownTokens, both.summary.knownTokens);
  accounts.select(savedId);
  assert.equal((await analytics.get({ source: 'tools', range: 'billing' })).status, 'unavailable');
  const reloaded = new ToolSources({ store });
  assert.equal(reloaded.list().length, 2);
  assert.equal((await reloaded.query({ range: '7d' })).summary.requests, both.summary.requests);
  await reloaded.dispose();
  await mainWindow.webContents.executeJavaScript('document.querySelector(\'button[aria-label="用量分析"]\').click()');
  await until(
    mainWindow,
    "document.querySelector('.analysis-source-picker') && !document.querySelector('.analysis-loading')",
  );
  await mainWindow.webContents.executeJavaScript(
    "[...document.querySelectorAll('.range-control button')].find(b=>b.textContent==='近 7 天').click()",
  );
  await until(
    mainWindow,
    "document.querySelectorAll('.analysis-source-picker input:checked').length===2 && document.querySelector('.analysis-stats') && !document.querySelector('.analysis-loading')",
  );
  const isolated = await mainWindow.webContents.executeJavaScript(
    "[...document.querySelectorAll('.range-control button')].find(b=>b.textContent==='本账期').disabled && !document.querySelector('.prediction-panel')",
  );
  assert.ok(isolated);
  await mainWindow.webContents.executeJavaScript('document.querySelector(\'button[aria-label="账户与设置"]\').click()');
  await until(mainWindow, "document.querySelectorAll('.tool-source-row').length===2");
  const sourcesVisible = await mainWindow.webContents.executeJavaScript(
    "[...document.querySelectorAll('.tool-source-label input')].some(input=>input.value==='Harness native fixture')",
  );
  assert.ok(sourcesVisible);
  applySettings({ ...settings, theme: 'light' });
  await until(mainWindow, "!document.querySelector('.native-app.dark')");
  applySettings({ ...settings, theme: 'dark' });
  await until(mainWindow, "document.querySelector('.native-app.dark')");
  const exported = fs.readFileSync(file, 'utf8');
  assert.ok(!exported.includes('PRIVATE'));
  return {
    ok: true,
    twoSources: true,
    legacyCompatibility: true,
    reportedTotals: true,
    replayDeduplicated: true,
    accountIsolation: true,
    billingDisabled: true,
    sourceReload: true,
    nativeWorkerSqlite: true,
    sourceManagementRendered: true,
    lightDark: true,
    harnessVersion: '0.1.7-rc.1',
    realToolCalls: false,
  };
}
module.exports = { runToolSmoke };
