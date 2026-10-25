const test = require('node:test'),
  assert = require('node:assert/strict'),
  crypto = require('node:crypto'),
  fs = require('node:fs'),
  path = require('node:path');
const { REGISTRY, providerDefinition } = require('../desktop/providers/index.cjs');
const { PROVIDERS } = require('../desktop/provider-catalog.cjs');
const { createClient, ORIGINS } = require('../desktop/providers.cjs');
const { fixtureBody } = require('../desktop/provider-fixture.cjs');

// T5.3a: the registry must reproduce the pre-refactor platform list, official pages and client behaviour exactly.
const IDS = ['opencode-go', 'deepseek', 'codex', 'claude', 'commandcode', 'glm', 'minimax', 'volcengine'];

test('the registry holds exactly the original platforms, in order, and feeds PROVIDERS', () => {
  assert.deepEqual(
    REGISTRY.map((p) => p.id),
    IDS,
  );
  assert.deepEqual(
    PROVIDERS.map((p) => p.id),
    IDS,
  );
  for (const p of PROVIDERS)
    assert.deepEqual(Object.keys(p), ['id', 'capabilities', 'name', 'regions', 'credential', 'note', 'verification']);
  assert.deepEqual(Object.keys(ORIGINS), ['opencode-go', 'deepseek', 'glm', 'minimax', 'volcengine']);
  const kinds = Object.fromEntries(REGISTRY.map((p) => [p.id, p.clientKind]));
  assert.deepEqual(kinds, {
    'opencode-go': 'quota',
    deepseek: 'balance',
    codex: 'subscription',
    claude: 'subscription',
    commandcode: 'commandcode',
    glm: 'quota',
    minimax: 'quota',
    volcengine: 'quota',
  });
});

// Pre-refactor `assistant:official` results (main.cjs before T5.3a), written out by hand.
const OFFICIAL = [
  ['deepseek', 'global', {}, 'usage', 'https://platform.deepseek.com/usage'],
  ['deepseek', 'global', {}, 'studio', 'https://platform.deepseek.com/usage'],
  ['codex', 'local', {}, 'usage', 'https://chatgpt.com/codex/settings/usage'],
  ['codex', 'local', {}, 'studio', 'https://chatgpt.com/codex/settings/usage'],
  ['claude', 'local', {}, 'usage', 'https://claude.ai/settings/usage'],
  ['claude', 'local', {}, 'studio', 'https://claude.ai/settings/usage'],
  ['opencode-go', 'global', {}, 'usage', 'https://opencode.ai/auth'],
  ['opencode-go', 'global', {}, 'studio', 'https://opencode.ai/auth'],
  ['glm', 'cn', {}, 'usage', 'https://bigmodel.cn'],
  ['glm', 'cn', {}, 'studio', 'https://bigmodel.cn'],
  ['glm', 'global', {}, 'usage', 'https://z.ai'],
  ['glm', 'global', {}, 'studio', 'https://z.ai'],
  ['glm', 'eu', {}, 'usage', null],
  ['minimax', 'cn', {}, 'usage', 'https://platform.minimax.cn/subscribe/token-plan'],
  ['minimax', 'global', {}, 'studio', 'https://platform.minimax.io/subscribe/token-plan'],
  ['minimax', 'eu', {}, 'usage', null],
  ['volcengine', 'cn-beijing', {}, 'usage', 'https://ark.volcengine.com/region:cn-beijing'],
  ['volcengine', 'cn-beijing', {}, 'studio', 'https://ark.volcengine.com/region:cn-beijing'],
  ['volcengine', 'cn-shanghai', {}, 'usage', null],
  ['commandcode', 'global', { login: 'alice_01' }, 'usage', 'https://commandcode.ai/alice_01/settings/usage'],
  ['commandcode', 'global', { login: 'alice_01' }, 'studio', 'https://commandcode.ai'],
  ['commandcode', 'global', { login: 'not valid' }, 'usage', 'https://commandcode.ai'],
  ['commandcode', 'global', undefined, 'usage', 'https://commandcode.ai'],
];
test('official pages for every platform, region and target match the pre-refactor table', () => {
  for (const [id, region, identity, target, expected] of OFFICIAL)
    assert.equal(
      providerDefinition(id).officialUrl({ region, identity, target }),
      expected,
      `${id} ${region} ${target}`,
    );
  assert.equal(providerDefinition('unknown'), null);
});

// Requests, normalized results and error classification of every quota/balance client, recorded before the
// refactor (tests/fixtures/provider-behaviour-snapshot.json; synthetic credentials and fixture bodies only).
const NOW = Date.UTC(2026, 9, 16, 12, 0, 0);
const sha = (v) => crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const ERROR_BODIES = {
  'opencode-go': [{ error: { type: 'EntitlementError' } }, { error: { type: 'AuthError' } }, { type: 'error' }],
  glm: [{ success: false, code: 1001 }, { code: 1302 }, { code: 500 }, { error: { code: '401' } }],
  minimax: [
    {},
    { base_resp: { status_code: 1004 } },
    { base_resp: { status_code: 1002 } },
    { base_resp: { status_code: 7 } },
    { base_resp: { status_code: true } },
  ],
  volcengine: [
    { ResponseMetadata: { Error: { Code: 'SignatureDoesNotMatch' } } },
    { ResponseMetadata: { Error: { Code: 'AccessDenied' } } },
    { ResponseMetadata: { Error: { Code: 'Throttling' } } },
    { ResponseMetadata: { Error: { Code: 'X' } } },
  ],
  deepseek: [{}],
};
async function run(provider, region, respond) {
  let seen;
  const fetch = async (url, options) => {
    seen = {
      url,
      method: options.method,
      redirect: options.redirect,
      headers: options.headers,
      body: options.body ?? null,
    };
    return respond();
  };
  const client = createClient(provider, region, fetch);
  client.now = () => NOW;
  const credential =
    provider === 'volcengine' ? { accessKeyId: 'AKSYNTH', secretKey: 'SKSYNTH' } : { apiKey: 'synthetic-key' };
  return { seen, result: await client.usage(credential) };
}
const json =
  (body, status = 200) =>
  () =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
// T6.3 changed only the OpenCode Go note (split into note + noteDetail); joining them with '；' reproduces
// the previous snapshot hash f6a6db9b…, checked when the hash was updated.
test('every quota and balance client behaves exactly as before the registry refactor', async () => {
  const expected = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'fixtures', 'provider-behaviour-snapshot.json'), 'utf8'),
  );
  const actual = {};
  for (const [provider, regions] of Object.entries(ORIGINS))
    for (const region of Object.keys(regions)) {
      const ok = await run(provider, region, json(fixtureBody(provider, NOW)));
      const errors = [];
      for (const body of [...(ERROR_BODIES[provider] || []), [], 'not-json'])
        errors.push(
          (await run(provider, region, body === 'not-json' ? () => new Response('x{', { status: 200 }) : json(body)))
            .result.errors,
        );
      for (const status of [401, 402, 403, 429, 500])
        errors.push((await run(provider, region, json({ error: { type: 'EntitlementError' } }, status))).result.errors);
      actual[provider + ':' + region] = { request: ok.seen, resultSha256: sha(ok.result), errors };
    }
  assert.deepEqual(JSON.parse(JSON.stringify(actual)), expected);
});
