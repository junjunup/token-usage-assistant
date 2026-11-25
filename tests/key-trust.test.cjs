// T21.1–T21.2 (D28): what the connection form tells users about their credential must be true; pasted keys are tidied;
// the Kimi Admin key reads the organization balance exactly.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PROVIDERS, providerInfo } = require('../desktop/provider-catalog.cjs');
const { createClient } = require('../desktop/providers.cjs');
const { CommandCodeClient } = require('../desktop/api.cjs');
const { ENDPOINTS } = require('../desktop/domain.cjs');
const { fixtureBody } = require('../desktop/provider-fixture.cjs');
const { cleanKey, keyHint } = require('../desktop/key-format.cjs');
const { milliAmount, normalizeKimiAdmin } = require('../desktop/balance-domain.cjs');

const NOW = Date.UTC(2026, 10, 25, 4);
const credentialFor = (p) =>
  p.credential === 'aksk' ? { accessKeyId: 'AKSYNTH', secretKey: 'SKSYNTH' } : { apiKey: 'synthetic-key' };
async function seen(provider, region) {
  /** @type {{ method: string, url: string }[]} */
  const calls = [];
  const fetch = async (url, options) => {
    calls.push({ method: options.method, url: String(url) });
    return new Response(JSON.stringify(fixtureBody(provider, NOW)), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  const client = createClient(provider, region, fetch);
  client.now = () => NOW;
  await client.usage(credentialFor(providerInfo(provider)));
  return calls.map((c) => c.method + ' ' + c.url);
}

test('T21.1: the addresses the form lists are exactly the requests each platform client sends', async () => {
  for (const p of PROVIDERS) {
    if (p.credential === 'local') {
      assert.equal(p.access, null, p.id);
      continue;
    }
    if (p.id === 'commandcode') continue;
    for (const r of p.regions) assert.deepEqual(await seen(p.id, r.id), p.access.reads[r.id], p.id + ':' + r.id);
  }
});

test('T21.1: Command Code lists the four read-only GETs its client makes (queries aside)', async () => {
  const urls = [];
  const client = new CommandCodeClient(async (url, options) => {
    const u = new URL(url);
    urls.push(options.method + ' ' + u.origin + u.pathname);
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
  });
  for (const kind of Object.keys(ENDPOINTS))
    await client.request(kind, 'k', { orgId: 'o', since: 'x' }).catch(() => {});
  assert.deepEqual(urls, providerInfo('commandcode').access.reads.global);
});

test('T21.1: source links point at files in this repository; key pages only where official docs give them', () => {
  const keyPages = {};
  for (const p of PROVIDERS) {
    if (!p.access) continue;
    const prefix = 'https://github.com/junjunup/token-usage-assistant/blob/main/';
    assert.ok(p.access.source.startsWith(prefix), p.id);
    assert.ok(fs.existsSync(path.join(__dirname, '..', p.access.source.slice(prefix.length))), p.id);
    for (const [region, url] of Object.entries(p.access.keysUrl)) {
      assert.ok(
        p.regions.some((r) => r.id === region),
        p.id + ':' + region,
      );
      assert.match(url, /^https:\/\/[^/]+\//);
      keyPages[p.id + ':' + region] = url;
    }
  }
  // The addresses found in each platform's official documentation on 2026-11-25; the rest have none.
  assert.deepEqual(keyPages, {
    'opencode-go:global': 'https://opencode.ai/console',
    'deepseek:global': 'https://platform.deepseek.com/api_keys',
    'kimi:cn': 'https://platform.kimi.com/console/api-keys',
    'kimi:global': 'https://platform.kimi.ai/console/api-keys',
    'kimi-code:cn': 'https://www.kimi.com/code/console',
    'siliconflow:cn': 'https://cloud.siliconflow.cn/account/ak',
    'stepfun:cn': 'https://platform.stepfun.com/interface-key',
    'glm:cn': 'https://bigmodel.cn/usercenter/proj-mgmt/apikeys',
    'glm:global': 'https://z.ai/manage-apikey/apikey-list',
  });
});

test('T21.1: a pasted key loses quotes, "Bearer ", assignments and whitespace; hints never block', () => {
  for (const [input, key] of [
    ['  sk-abc123  ', 'sk-abc123'],
    ['Bearer sk-abc123', 'sk-abc123'],
    ['Authorization: Bearer sk-abc123\n', 'sk-abc123'],
    ['"sk-abc123"', 'sk-abc123'],
    ["'sk-abc123';", 'sk-abc123'],
    ['export DEEPSEEK_API_KEY=sk-abc123', 'sk-abc123'],
    ['DEEPSEEK_API_KEY="sk-abc123"', 'sk-abc123'],
    ['sk-abc\n123', 'sk-abc123'],
    ['id123.secret456', 'id123.secret456'],
    ['', ''],
  ])
    assert.equal(cleanKey(input).key, key, JSON.stringify(input));
  assert.equal(cleanKey('sk-abc').changed, false);
  assert.equal(cleanKey('Bearer sk-abc').changed, true);
  assert.equal(keyHint('deepseek', 'sk-abc'), null);
  assert.match(keyHint('deepseek', 'abc') || '', /sk-/);
  assert.match(keyHint('openrouter', 'sk-abc') || '', /sk-or-/);
  assert.equal(keyHint('openrouter', 'sk-or-v1-abc'), null);
  assert.match(keyHint('kimi', 'sk-admin-abc') || '', /Admin Key/);
  assert.match(keyHint('kimi-admin', 'sk-abc') || '', /sk-admin-/);
  assert.equal(keyHint('kimi-admin', 'sk-admin-abc'), null);
  // Platforms without a documented prefix get no hint.
  assert.equal(keyHint('glm', 'anything'), null);
  assert.equal(keyHint('deepseek', ''), null);
});

test('T21.2: milli-cent integers become exact decimal strings', () => {
  for (const [v, s] of [
    [4958894, '49.58894'],
    [100000, '1'],
    [250000, '2.5'],
    [5, '0.00005'],
    [0, '0'],
    [-250000, '-2.5'],
    [-1, '-0.00001'],
    [Number.MAX_SAFE_INTEGER, '90071992547.40991'],
  ])
    assert.equal(milliAmount(v), s, String(v));
  for (const v of [1.5, '100000', null, undefined, Number.MAX_SAFE_INTEGER + 1, NaN])
    assert.equal(milliAmount(v), null);
});

test('T21.2: the Kimi Admin key reads the organization balance from the site in its currency', async () => {
  assert.deepEqual(normalizeKimiAdmin(fixtureBody('kimi-admin', NOW), 'CNY'), {
    isAvailable: true,
    balances: [{ currency: 'CNY', total: '49.58894' }],
    source: 'kimi-admin-official-balance',
  });
  assert.equal(normalizeKimiAdmin({ available_balance: 0 }, 'USD').isAvailable, false);
  assert.equal(normalizeKimiAdmin({ available_balance: -100 }, 'USD').balances[0].total, '-0.001');
  for (const bad of [null, [], {}, { available_balance: '1' }, { available_balance: 1.5 }])
    assert.throws(() => normalizeKimiAdmin(bad, 'CNY'));
  assert.throws(() => normalizeKimiAdmin({ available_balance: 1 }, 'EUR'));
  // End to end through the client, both sites.
  for (const [region, currency, host] of [
    ['cn', 'CNY', 'https://api.moonshot.cn'],
    ['global', 'USD', 'https://api.moonshot.ai'],
  ]) {
    assert.deepEqual(await seen('kimi-admin', region), ['GET ' + host + '/v1/admin/organizations/account']);
    const client = createClient('kimi-admin', region, async () =>
      Response.json(fixtureBody('kimi-admin', NOW), { status: 200 }),
    );
    const result = await client.usage({ apiKey: 'sk-admin-synthetic' });
    assert.equal(result.parts.balance.balances[0].currency, currency);
    assert.equal(result.parts.balance.balances[0].total, '49.58894');
  }
});

test('T21.2: a key without billing:read, or an Admin API error body, is reported without the platform text', async () => {
  const run = async (status, body) => {
    const client = createClient('kimi-admin', 'cn', async () => Response.json(body, { status }));
    return (await client.usage({ apiKey: 'sk-admin-synthetic' })).errors;
  };
  const forbidden = await run(403, {
    error: { type: 'permission_error', code: 'insufficient_scope', message: 'secret detail', request_id: 'r' },
  });
  assert.match(JSON.stringify(forbidden), /billing:read/);
  assert.equal(JSON.stringify(forbidden).includes('secret detail'), false);
  const body = await run(200, { error: { type: 'x', code: 'internal_server_error', message: 'secret detail' } });
  assert.ok(body.length > 0);
  assert.equal(JSON.stringify(body).includes('secret detail'), false);
});
