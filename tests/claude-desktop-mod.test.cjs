// T19.1: the Claude desktop mod (integrations/claude-desktop-mod) passes the engine's live rate limits to the
// assistant's collector, and nothing else. Its hooks module runs here as shipped (Node strips the types), with a stand-in
// for the engine's `$` and the assistant's real collector on the loopback address.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { ClaudeCollector } = require('../desktop/claude-collector.cjs');

const MOD = path.join(__dirname, '..', 'integrations', 'claude-desktop-mod');
const load = async () => {
  const { register } = await import(pathToFileURL(path.join(MOD, 'hooks', 'register.ts')).href);
  const hooks = {};
  register((event, hook) => {
    hooks[event] = hook;
    return { catch: () => {} };
  });
  return hooks;
};
const temp = (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tua-claude-mod-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
};
// The engine's interface as far as the mod uses it; every fetch is recorded and really sent.
function engine({ env, fetches, reads }) {
  return {
    env: { get: async (name) => env[name] },
    fs: {
      read: async (file) => {
        reads.push(file);
        return fs.readFileSync(file, 'utf8');
      },
    },
    session: {
      version: async () => ({ version: '2.1.330', base: '2.1.330' }),
      id: async () => 'desktop-session-1',
      cwd: async () => '/Users/someone/project',
    },
    http: {
      fetch: async (url, init) => {
        fetches.push({ url, init });
        const res = await fetch(url, init);
        return { status: res.status, ok: res.ok, headers: {}, text: await res.text() };
      },
    },
  };
}
const RESET_5H = '2026-11-24T14:50:00.000Z',
  RESET_7D = '2026-11-29T20:00:00.000Z';
const measure = (rateLimits, changed = ['rateLimits']) => ({
  context: { window: 1000000 },
  rateLimits,
  changed,
});

test('T19.1: the plugin manifest, hooks list and repository marketplace point at the shipped module', () => {
  const plugin = JSON.parse(fs.readFileSync(path.join(MOD, '.claude-plugin', 'plugin.json'), 'utf8'));
  assert.equal(plugin.name, 'token-usage-quota-sync');
  assert.equal(plugin.license, 'MIT');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(MOD, 'hooks', 'hooks.json'), 'utf8')), {
    modules: ['./register.ts'],
  });
  const market = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '.claude-plugin', 'marketplace.json'), 'utf8'));
  assert.deepEqual(market.plugins, [{ name: 'token-usage-quota-sync', source: './integrations/claude-desktop-mod' }]);
});

test('T19.1: a measurement with rate limits reaches the collector as the two windows, exactly as the engine gave them', async (t) => {
  const home = temp(t),
    collectorHome = path.join(home, 'Library', 'Application Support', 'TokenUsageAssistant', 'claude-collector');
  const collector = new ClaudeCollector(collectorHome);
  collector.prepare();
  await collector.start();
  t.after(() => collector.close());
  const fetches = [],
    reads = [],
    $ = engine({ env: { HOME: home }, fetches, reads }),
    { 'session.measure': hook } = await load();
  let nexted = 0;
  const result = await hook(
    $,
    measure([
      { kind: 'five_hour', percentUsed: 51.5, resetsAt: RESET_5H },
      { kind: 'seven_day', percentUsed: 20, resetsAt: RESET_7D },
      { kind: 'spend_limit', percentUsed: 120 },
    ]),
    (e) => (nexted++, { changed: e.changed }),
  );
  assert.deepEqual(result, { changed: ['rateLimits'] });
  assert.equal(nexted, 1);
  // The macOS form, written with '/' by the mod whatever the test machine (no APPDATA here, as on a Mac).
  assert.deepEqual(reads, [`${home}/Library/Application Support/TokenUsageAssistant/claude-collector/collector.json`]);
  assert.equal(fetches.length, 1);
  assert.equal(fetches[0].url, `http://127.0.0.1:${collector.config.port}/quota`);
  assert.equal(fetches[0].init.headers['x-tua-token'], collector.config.token);
  // Only these four things leave the session.
  assert.deepEqual(JSON.parse(fetches[0].init.body), {
    version: '2.1.330',
    sessionId: 'desktop-session-1',
    project: '/Users/someone/project',
    windows: {
      five_hour: { used_percentage: 51.5, resets_at: Date.parse(RESET_5H) / 1000 },
      seven_day: { used_percentage: 20, resets_at: Date.parse(RESET_7D) / 1000 },
    },
  });
  const quota = JSON.parse(fs.readFileSync(path.join(collectorHome, 'quota.json'), 'utf8'));
  assert.deepEqual(quota.windows, {
    five_hour: { used_percentage: 51.5, resets_at: Date.parse(RESET_5H) / 1000 },
    seven_day: { used_percentage: 20, resets_at: Date.parse(RESET_7D) / 1000 },
  });
});

test('T19.1: nothing is sent without moved rate limits or a known window with its reset time; failures never block', async (t) => {
  const home = temp(t),
    fetches = [],
    reads = [],
    $ = engine({ env: { HOME: home }, fetches, reads }),
    { 'session.measure': hook } = await load(),
    next = (e) => ({ changed: e.changed });
  // Only the context moved.
  await hook($, measure([{ kind: 'five_hour', percentUsed: 3, resetsAt: RESET_5H }], ['context']), next);
  // Off a subscription: no windows.
  await hook($, measure([]), next);
  // A window without a reset time, and an unknown kind.
  await hook(
    $,
    measure([
      { kind: 'five_hour', percentUsed: 3 },
      { kind: 'spend_limit', percentUsed: 5, resetsAt: RESET_5H },
    ]),
    next,
  );
  assert.deepEqual(fetches, []);
  assert.deepEqual(reads, []);
  // The assistant is not installed (no collector settings): the hook still passes the measurement on.
  assert.deepEqual(await hook($, measure([{ kind: 'seven_day', percentUsed: 9, resetsAt: RESET_7D }]), next), {
    changed: ['rateLimits'],
  });
  assert.equal(fetches.length, 0);
  // Settings that are not the collector's: nothing is sent.
  const dir = path.join(home, 'Library', 'Application Support', 'TokenUsageAssistant', 'claude-collector');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'collector.json'), JSON.stringify({ port: 80, token: 'short' }));
  await hook($, measure([{ kind: 'seven_day', percentUsed: 9, resetsAt: RESET_7D }]), next);
  assert.equal(fetches.length, 0);
  // The collector is down: the fetch fails, the session goes on.
  fs.writeFileSync(path.join(dir, 'collector.json'), JSON.stringify({ port: 1, token: 'a'.repeat(64) }));
  const failing = engine({ env: { HOME: home }, fetches, reads });
  failing.http.fetch = async () => {
    throw new Error('connection refused');
  };
  assert.deepEqual(await hook(failing, measure([{ kind: 'seven_day', percentUsed: 9, resetsAt: RESET_7D }]), next), {
    changed: ['rateLimits'],
  });
});

test('T19.1: on Windows the collector settings are read from %APPDATA%\\commandcode-companion', async () => {
  const reads = [],
    $ = engine({ env: { APPDATA: 'C:\\Users\\u\\AppData\\Roaming', HOME: '/ignored' }, fetches: [], reads }),
    { 'session.measure': hook } = await load();
  await hook($, measure([{ kind: 'seven_day', percentUsed: 9, resetsAt: RESET_7D }]), (e) => ({ changed: e.changed }));
  assert.deepEqual(reads, ['C:\\Users\\u\\AppData\\Roaming\\commandcode-companion\\claude-collector\\collector.json']);
});
