// T4.0: main-process event-loop delay probe for the development app. Loaded with
//   NODE_OPTIONS="--require ./scripts/perf/event-loop-probe.cjs" TUA_PERF_USERDATA=<dir> TUA_PERF_OUT=<file> electron .
// Measurement only, never part of the app: userData is redirected to an isolated directory and the app name to
// the smoke name (its own Keychain item). It samples 20 s idle, then 60 s while driving the analytics page
// (tool analytics, switching 今日 / 近 7 天 every 5 s), writes the histograms to TUA_PERF_OUT and exits.
// The npm `electron` launcher is itself a Node process that inherits NODE_OPTIONS: do nothing there.
if (process.versions.electron && process.type === 'browser') probe();
function probe() {
  const { app } = require('electron');
  const fs = require('node:fs');
  const { monitorEventLoopDelay } = require('node:perf_hooks');

  const dir = process.env.TUA_PERF_USERDATA,
    out = process.env.TUA_PERF_OUT;
  if (!dir || !out) throw new Error('TUA_PERF_USERDATA and TUA_PERF_OUT are required');
  const setPath = app.setPath.bind(app),
    setName = app.setName.bind(app);
  app.setPath = (name, value) => setPath(name, name === 'userData' ? dir : value);
  app.setName = () => setName('TokenUsageAssistant-Smoke');
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const summary = (h) => ({
    samples: h.count,
    meanMs: +(h.mean / 1e6).toFixed(2),
    p50Ms: +(h.percentile(50) / 1e6).toFixed(2),
    p99Ms: +(h.percentile(99) / 1e6).toFixed(2),
    maxMs: +(h.max / 1e6).toFixed(2),
  });
  const click = (text) =>
    `(() => { const b = [...document.querySelectorAll('button')].find((b) => (b.getAttribute('aria-label') || b.textContent).trim() === ${JSON.stringify(text)}); if (b) b.click(); return !!b; })()`;

  app.on('browser-window-created', (_, win) => {
    win.webContents.once('did-finish-load', async () => {
      if (!win.webContents.getURL().includes('surface=main') || run.started) return;
      run.started = true;
      try {
        await run(win);
      } catch (e) {
        fs.writeFileSync(out, JSON.stringify({ ok: false, error: String(e?.message || e) }));
      }
      app.exit(0);
    });
  });
  async function run(win) {
    await wait(5000);
    const idle = monitorEventLoopDelay({ resolution: 10 });
    idle.enable();
    await wait(20000);
    idle.disable();
    const steps = [];
    const active = monitorEventLoopDelay({ resolution: 10 });
    active.enable();
    steps.push(['用量分析', await win.webContents.executeJavaScript(click('用量分析'))]);
    await wait(1500);
    steps.push(['工具分析', await win.webContents.executeJavaScript(click('工具分析'))]);
    const started = Date.now();
    for (let i = 0; Date.now() - started < 60000; i++) {
      await wait(5000);
      const label = i % 2 ? '今日' : '近 7 天';
      steps.push([label, await win.webContents.executeJavaScript(click(label))]);
    }
    active.disable();
    fs.writeFileSync(
      out,
      JSON.stringify(
        {
          ok: steps.every(([, found]) => found),
          electron: process.versions.electron,
          platform: process.platform,
          arch: process.arch,
          idle20s: summary(idle),
          analytics60s: summary(active),
          clicks: steps.map(([label, found]) => `${label}:${found ? 'ok' : 'missing'}`),
        },
        null,
        2,
      ),
    );
  }
}
