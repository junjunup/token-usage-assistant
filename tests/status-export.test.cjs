// T13.5 (D20 ③): the command-line quota snapshot — tightest account first (menu-bar rule), missing stays null,
// money keeps every digit with its currency, no credentials; the files exist only while the setting is on, and the
// generated command prints them.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { statusSnapshot, statusText } = require('../desktop/status-snapshot.cjs');
const { StatusExport, scripts, MISSING } = require('../desktop/status-export.cjs');
const { DEFAULT_SETTINGS } = require('../desktop/domain.cjs');

const NOW = Date.UTC(2026, 11, 5, 9);
const quota = (id, remainingPercent, extra = {}) => ({
  id,
  label: id === 'five' ? '5 小时窗口' : '每周额度',
  remainingPercent,
  resetAt: NOW + 3600000,
  resetState: 'scheduled',
  exceeded: remainingPercent === 0,
  applicable: true,
  ...extra,
});
const accounts = [
  {
    id: 'glm-1',
    label: 'GLM 主号',
    provider: 'glm',
    active: true,
    capabilities: { quota: true, balance: false },
    status: 'connected',
    parts: { credits: { windows: [quota('five', 64), quota('week', null)] } },
    updatedAt: { credits: NOW - 1000 },
  },
  {
    id: 'ds-1',
    label: 'DeepSeek',
    provider: 'deepseek',
    active: false,
    capabilities: { quota: false, balance: true },
    status: 'offline',
    parts: {
      balance: { isAvailable: true, balances: [{ currency: 'CNY', total: '49.58894', granted: null, toppedUp: null }] },
    },
    updatedAt: { balance: NOW - 600000 },
  },
  {
    id: 'kc-1',
    label: 'Kimi Code',
    provider: 'kimi-code',
    active: false,
    capabilities: { quota: true, balance: false },
    status: 'connected',
    parts: { credits: { windows: [quota('five', 8)] } },
    updatedAt: { credits: NOW - 2000 },
    credential: { apiKey: 'sk-SECRET-should-never-appear' },
  },
];

test('T13.5: tightest first, values as reported, missing null, money with every digit, stale marked', () => {
  const s = statusSnapshot(accounts, { threshold: 20 }, NOW);
  assert.equal(s.schema, 'token-usage-assistant.status');
  assert.equal(s.generatedAt, new Date(NOW).toISOString());
  assert.deepEqual(
    s.accounts.map((a) => a.id),
    ['kc-1', 'glm-1', 'ds-1'],
  );
  const [kimi, glm, ds] = s.accounts;
  assert.deepEqual(kimi.windows[0], {
    id: 'five',
    label: '5 小时窗口',
    remainingPercent: 8,
    state: 'active',
    exceeded: false,
    resetAt: new Date(NOW + 3600000).toISOString(),
    alert: 'amber',
  });
  assert.equal(glm.windows[1].remainingPercent, null, 'unknown stays null, never 0');
  assert.deepEqual(ds.balances, [{ currency: 'CNY', amount: '49.58894', available: true }]);
  assert.equal(ds.stale, true);
  assert.match(ds.text, /（上次的值）$/);
  assert.doesNotMatch(JSON.stringify(s), /SECRET|apiKey|credential/);
  const text = statusText(s);
  assert.equal(text.split('\n')[1], kimi.text);
  assert.match(text, /^Token 用量助手 · 生成于 /);
  assert.match(statusText(statusSnapshot([], {}, NOW)), /未连接账户/);
  assert.equal(DEFAULT_SETTINGS.statusExport, false, 'off by default');
});

test('T13.5: files appear on update, are rewritten only on change or after a minute, and go away on remove', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tua-status-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  let now = NOW;
  const exporter = new StatusExport({ dir: path.join(dir, 'cli'), platform: 'darwin', now: () => now });
  assert.equal(exporter.update(accounts, { threshold: 20 }), true);
  const files = fs.readdirSync(path.join(dir, 'cli')).sort();
  assert.deepEqual(files, ['status.json', 'status.txt', 'tua-status']);
  if (process.platform !== 'win32') assert.equal(fs.statSync(exporter.command).mode & 0o777, 0o700);
  now += 5000;
  assert.equal(exporter.update(accounts, { threshold: 20 }), false, 'same values within a minute: no write');
  now += 60000;
  assert.equal(exporter.update(accounts, { threshold: 20 }), true);
  exporter.remove();
  assert.deepEqual(fs.readdirSync(path.join(dir, 'cli')), []);
  const win = scripts("C:\\Users\\o'neil\\cli", 'win32');
  assert.deepEqual(Object.keys(win), ['tua-status.ps1', 'tua-status.cmd']);
  assert.match(win['tua-status.ps1'], /Join-Path 'C:\\Users\\o''neil\\cli'/);
  assert.match(win['tua-status.ps1'], /UTF8/);
});

test(
  'T13.5: the generated macOS command prints the JSON, --text the lines, and explains a missing snapshot',
  { skip: process.platform === 'win32' },
  (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tua status '));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const exporter = new StatusExport({ dir: path.join(dir, 'cli'), platform: 'darwin', now: () => NOW });
    exporter.update(accounts, { threshold: 20 });
    const run = (...args) => spawnSync(exporter.command, args, { encoding: 'utf8' });
    const json = JSON.parse(run().stdout);
    assert.equal(json.accounts[0].id, 'kc-1');
    assert.match(run('--text').stdout, /Kimi Code：5 小时窗口 8%/);
    fs.rmSync(path.join(dir, 'cli', 'status.json'));
    const missing = run();
    assert.equal(missing.status, 1);
    assert.equal(missing.stderr.trim(), MISSING);
  },
);
