// Only loaded by --smoke-test, as its last section; all accounts are synthetic. From two accounts on the widget
// follows the tightest account (T11.1), so each platform's own widget only shows with a single account. This keeps
// only the Codex account the subscription section connected, then connects each fixture platform alone, checking
// the collapsed and expanded widget of each and removing the account again.
const fs = require('node:fs');
async function until(win, expression, ms = 8000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await win.webContents.executeJavaScript(expression)) return true;
    await new Promise((r) => setTimeout(r, 40));
  }
  throw Error('Single-account widget did not settle: ' + expression);
}
const ALONE = [
  { provider: 'glm', region: 'cn' },
  { provider: 'minimax', region: 'cn' },
  { provider: 'volcengine', region: 'cn-beijing' },
  { provider: 'opencode-go', region: 'global' },
  { provider: 'openrouter', region: 'global' },
  { provider: 'deepseek', region: 'global' },
  { provider: 'kimi', region: 'cn' },
];
async function checkWidget({ accounts, widgetWindow, store, settings, applySettings }, provider, label) {
  const state = accounts.active.monitor.state,
    windows = state.parts.credits?.windows?.length || 0,
    balances = state.parts.balance?.balances?.length || 0;
  const items = balances ? "'.balance-widget-currency'" : "'.provider-widget-quota'";
  const count = (n) => `document.querySelectorAll(${items}).length===${n}`;
  const account = `document.querySelector('.provider-widget-account strong')?.textContent===${JSON.stringify(label)} && !document.querySelector('.aa-w-account')`;
  applySettings({ ...settings(), widgetExpanded: false });
  await until(widgetWindow, `${account} && ${count(balances || Math.min(2, windows))}`);
  const collapsed = widgetWindow.getBounds();
  applySettings({ ...settings(), widgetExpanded: true });
  // Expanded: every window, or each currency with its parts.
  await until(
    widgetWindow,
    `${account} && ${count(balances || windows)}` +
      (balances ? " && document.querySelectorAll('.balance-widget dl').length===" + balances : ''),
  );
  const expanded = widgetWindow.getBounds();
  // Captured while expanded: right after collapsing, the window is already short but the page not yet redrawn.
  fs.writeFileSync(store.file(`single-widget-${provider}.png`), (await widgetWindow.webContents.capturePage()).toPNG());
  const text = await widgetWindow.webContents.executeJavaScript("document.querySelector('.widget-body').textContent");
  applySettings({ ...settings(), widgetExpanded: false });
  return {
    windows,
    balances,
    noBadValues: !/NaN|undefined|Invalid/.test(text),
    bottomKept: Math.abs(expanded.y + expanded.height - (collapsed.y + collapsed.height)) <= 8,
    collapsedHeight: collapsed.height,
    expandedHeight: expanded.height,
  };
}
async function runSingleWidgetSmoke(ctx) {
  const { accounts } = ctx;
  const checks = [];
  const codex = accounts.entries.find((e) => e.provider === 'codex');
  for (const e of [...accounts.entries]) if (e.id !== codex?.id) accounts.remove(e.id);
  if (codex) {
    checks.push({ provider: 'codex', ...(await checkWidget(ctx, 'codex', codex.label)) });
    accounts.remove(codex.id);
  }
  for (const { provider, region } of ALONE) {
    const label = provider + ' 单账户样例';
    await accounts.connect({
      provider,
      region,
      label,
      apiKey: 'native-synthetic-key',
      accessKeyId: 'native-synthetic-ak',
      secretKey: 'native-synthetic-sk',
    });
    checks.push({ provider, ...(await checkWidget(ctx, provider, label)) });
    accounts.remove();
  }
  return {
    ok:
      !!codex &&
      checks.length === ALONE.length + 1 &&
      checks.every((c) => (c.windows > 0 || c.balances > 0) && c.noBadValues && c.bottomKept),
    checks,
  };
}
module.exports = { runSingleWidgetSmoke };
