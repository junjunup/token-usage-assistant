const test = require('node:test'),
  assert = require('node:assert/strict'),
  os = require('node:os'),
  path = require('node:path');
const { AccountManager } = require('../desktop/accounts.cjs');
const { UsageMonitor } = require('../desktop/monitor.cjs');
const { DEFAULT_SETTINGS } = require('../desktop/domain.cjs');

const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};
const quietClient = () => ({ usage: async () => ({ parts: {}, errors: [] }) });
// An AccountManager whose runtimes are replaced by stubs, so only scheduling is under test.
function manager(stagger, ids) {
  const m = new AccountManager({
    store: { file: (name) => path.join(os.tmpdir(), 'tua-polling-unused', name) },
    settings: DEFAULT_SETTINGS,
    clientFactory: quietClient,
    stagger,
  });
  const calls = [];
  for (const id of ids)
    m.runtimes.set(id, {
      entry: { id },
      monitor: {
        refresh: async () => calls.push([id, Date.now()]),
        pause: () => calls.push([id, 'pause']),
        resume: () => calls.push([id, 'resume']),
      },
    });
  return { m, calls };
}

test('refreshAll staggers accounts by i*400 ms plus 0–800 ms jitter', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  const { m, calls } = manager({ stepMs: 400, jitterMs: 800, random: () => 0.5 }, ['a', 'b', 'c']);
  const done = m.refreshAll();
  for (let ms = 0; ms <= 1300; ms += 100) {
    t.mock.timers.tick(100);
    await flush();
  }
  await done;
  assert.deepEqual(calls, [
    ['a', 400],
    ['b', 800],
    ['c', 1200],
  ]);
});

test('an account removed while waiting for its turn is not refreshed', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  const { m, calls } = manager({ stepMs: 400, jitterMs: 800, random: () => 0 }, ['a', 'b']);
  const done = m.refreshAll();
  m.runtimes.delete('b');
  t.mock.timers.tick(1000);
  await flush();
  await done;
  assert.deepEqual(calls, [['a', 0]]);
});

test('pauseAll / resumeAll pause every monitor and resume with a staggered refresh', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  const { m, calls } = manager({ stepMs: 400, jitterMs: 800, random: () => 0 }, ['a', 'b']);
  m.pauseAll();
  assert.deepEqual(calls, [
    ['a', 'pause'],
    ['b', 'pause'],
  ]);
  const done = m.resumeAll();
  t.mock.timers.tick(400);
  await flush();
  await done;
  assert.deepEqual(calls.slice(2), [
    ['a', 'resume'],
    ['b', 'resume'],
    ['a', 0],
    ['b', 400],
  ]);
  await m.resumeAll();
  assert.equal(calls.length, 6, 'resume without a pause does nothing');
});

test('a paused monitor keeps its data, never schedules or queries, and runs again after resume', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let clock = 1_000_000,
    queries = 0;
  const client = {
    usage: async () => {
      queries++;
      return { parts: { summary: { total: queries } }, errors: [] };
    },
  };
  const monitor = new UsageMonitor(client, { settings: DEFAULT_SETTINGS, now: () => clock });
  t.after(() => monitor.dispose());
  monitor.configure('key');
  await monitor.refresh();
  assert.equal(queries, 1);
  assert.equal(monitor.state.nextRefreshAt, clock + 60000);
  monitor.pause();
  assert.equal(monitor.state.nextRefreshAt, null);
  t.mock.timers.tick(600000);
  await flush();
  await monitor.refresh();
  assert.equal(queries, 1, 'no query while paused, neither scheduled nor manual');
  assert.equal(monitor.state.parts.summary.total, 1, 'data is kept');
  assert.equal(monitor.state.status, 'connected');
  monitor.resume();
  await monitor.refresh();
  assert.equal(queries, 2);
  assert.equal(monitor.state.nextRefreshAt, clock + 60000);
});

test('Codex monitors never poll faster than every 120 s; slower settings still apply', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const clock = 5_000_000,
    client = quietClient();
  for (const [refreshSeconds, expected] of [
    [30, 120],
    [60, 120],
    [120, 120],
    [300, 300],
  ]) {
    const settings = { ...DEFAULT_SETTINGS, refreshSeconds },
      monitor = new UsageMonitor(client, { settings, now: () => clock, minIntervalSeconds: 120 });
    monitor.configure('key');
    await monitor.refresh();
    assert.equal(monitor.intervalSeconds, expected);
    assert.equal(monitor.state.nextRefreshAt, clock + expected * 1000);
    monitor.updateSettings(settings);
    assert.equal(monitor.state.nextRefreshAt, clock + expected * 1000);
    monitor.dispose();
  }
  const plain = new UsageMonitor(client, { settings: { ...DEFAULT_SETTINGS, refreshSeconds: 30 }, now: () => clock });
  plain.configure('key');
  await plain.refresh();
  assert.equal(plain.state.nextRefreshAt, clock + 30000, 'other platforms keep the user setting');
  plain.dispose();
});

test('Codex accounts get the 120 s floor, lock and unlock are wired, and the UI shows the real interval', () => {
  const fs = require('node:fs'),
    read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  assert.match(read('desktop/accounts.cjs'), /minIntervalSeconds: entry\.provider === 'codex' \? 120 : 0/);
  const main = read('desktop/main.cjs');
  assert.match(main, /powerMonitor\.on\('lock-screen', \(\) => accounts\.pauseAll\(\)\)/);
  assert.match(main, /powerMonitor\.on\('unlock-screen', \(\) => accounts\.resumeAll\(\)\)/);
  assert.match(main, /refreshInterval: accounts\?\.active\?\.monitor\.intervalSeconds/);
  assert.match(read('src/DesktopApp.jsx'), /每 \$\{state\.refreshInterval \|\| settings\.refreshSeconds\} 秒刷新/);
});
