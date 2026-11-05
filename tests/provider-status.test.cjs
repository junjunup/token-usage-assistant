// T14.3 (D21 ③): official status pages — off by default, fixed addresses, no credentials, no redirects; only known
// indicators are accepted; a failure keeps the last result; turning it off forgets everything.
const test = require('node:test');
const assert = require('node:assert/strict');
const { ProviderStatus, PAGES, parseStatus, describe } = require('../desktop/provider-status.cjs');
const { DEFAULT_SETTINGS } = require('../desktop/domain.cjs');

const body = (indicator) => JSON.stringify({ page: { name: 'x' }, status: { indicator, description: 'x' } });
function fakeFetch(responses) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    const r = responses[url];
    if (r instanceof Error) throw r;
    if (!r) return { ok: false, status: 404, text: async () => '' };
    return { ok: true, status: 200, text: async () => r };
  };
  return { fetch, calls };
}

test('T14.3: indicators map to the line; anything else is an incompatible format', () => {
  assert.equal(parseStatus({ status: { indicator: 'minor' } }), 'minor');
  for (const bad of [null, {}, { status: {} }, { status: { indicator: 'degraded' } }, { status: { indicator: 1 } }])
    assert.throws(() => parseStatus(bad), /format/);
  assert.deepEqual(describe('none'), { text: '运行正常', tone: 'green' });
  assert.deepEqual(describe('minor'), { text: '部分服务降级', tone: 'amber' });
  assert.equal(describe('critical').tone, 'red');
  assert.deepEqual(describe(null), { text: '—', tone: 'neutral' });
  assert.equal(DEFAULT_SETTINGS.providerStatus, false, 'off by default');
  assert.deepEqual(Object.keys(PAGES).sort(), ['claude', 'codex', 'kimi', 'minimax']);
  for (const { page } of Object.values(PAGES)) assert.match(page, /^https:\/\/status\.[a-z.]+$/);
});

test('T14.3: only connected platforms with a page are asked, with no credentials and no redirects', async () => {
  const { fetch, calls } = fakeFetch({
    'https://status.claude.com/api/v2/status.json': body('none'),
    'https://status.moonshot.cn/api/v2/status.json': body('minor'),
  });
  let now = 1000,
    changes = 0;
  const s = new ProviderStatus({ fetch, now: () => now, intervalMs: 60_000_000, onChange: () => changes++ });
  s.setProviders(['claude', 'kimi', 'deepseek', 'glm', 'claude']);
  assert.equal(s.state('claude'), null, 'not running: nothing shown');
  s.start();
  await s.check();
  // The check start() began is the one awaited: each page once.
  assert.deepEqual(calls.map((c) => c.url).sort(), [
    'https://status.claude.com/api/v2/status.json',
    'https://status.moonshot.cn/api/v2/status.json',
  ]);
  for (const { init } of calls) {
    assert.equal(init.redirect, 'error');
    assert.equal(init.credentials, 'omit');
    assert.deepEqual(Object.keys(init.headers), ['Accept']);
  }
  assert.deepEqual(s.state('claude'), { name: 'Anthropic', indicator: 'none', checkedAt: 1000, failing: false });
  assert.equal(s.state('kimi').indicator, 'minor');
  assert.equal(s.state('deepseek'), null, 'no page: nothing shown');
  assert.ok(changes > 0);
  s.stop();
});

test('T14.3: a failed check keeps the last result and its time; never checked reads unknown; off forgets', async () => {
  const responses = { 'https://status.openai.com/api/v2/status.json': body('major') };
  const { fetch } = fakeFetch(responses);
  let now = 1000;
  const s = new ProviderStatus({ fetch, now: () => now, intervalMs: 60_000_000 });
  s.setProviders(['codex', 'minimax']);
  s.start();
  await s.check();
  assert.equal(s.state('codex').indicator, 'major');
  assert.deepEqual(s.state('minimax'), { name: 'MiniMax', indicator: null, checkedAt: null, failing: true });
  now = 5000;
  responses['https://status.openai.com/api/v2/status.json'] = new Error('offline');
  await s.check();
  assert.deepEqual(s.state('codex'), { name: 'OpenAI', indicator: 'major', checkedAt: 1000, failing: true });
  responses['https://status.openai.com/api/v2/status.json'] = 'x'.repeat(70 * 1024);
  await s.check();
  assert.equal(s.state('codex').failing, true, 'oversized body is a failure');
  // A platform that is no longer connected is dropped.
  s.setProviders(['minimax']);
  assert.equal(s.pages.has('codex'), false);
  s.stop();
  assert.equal(s.state('minimax'), null);
  assert.equal(s.pages.size, 0);
  assert.equal(ProviderStatus.page('claude'), 'https://status.claude.com');
  assert.equal(ProviderStatus.page('deepseek'), null);
});
