// T9.1: the upstream version check classifies against the verified ranges in the code and never reports a failed
// lookup as up to date.
const test = require('node:test');
const assert = require('node:assert/strict');
const { TOOLS, classify, report, lookup } = require('../scripts/check-upstream.cjs');
const tool = (name) => TOOLS.find((t) => t.name === name);

test('verified ranges come from the readers: Codex 0.155.x, Claude 2.1.x from 251, Harness listed runtimes', () => {
  assert.equal(classify(tool('Codex CLI'), '0.155.3').state, 'verified');
  assert.equal(classify(tool('Codex CLI'), '0.164.0').state, 'outside');
  assert.equal(classify(tool('Claude Code'), '2.1.310').state, 'verified');
  assert.equal(classify(tool('Claude Code'), '2.1.250').state, 'outside');
  assert.equal(classify(tool('Claude Code'), '2.2.0').state, 'outside');
  assert.equal(classify(tool('DeepSeek Harness'), '0.2.1-rc.2').state, 'verified');
  assert.equal(classify(tool('DeepSeek Harness'), '0.1.7-rc.1').state, 'verified');
  assert.equal(classify(tool('DeepSeek Harness'), '0.2.1-rc.3').state, 'outside');
});

test('a failed or malformed lookup is "unknown", never verified', () => {
  for (const v of [null, undefined, '', 'latest', '1.2', {}])
    assert.equal(classify(tool('Claude Code'), /** @type {any} */ (v)).state, 'unknown');
});

test('the report lists every tool with its range and counts what needs attention', () => {
  const rows = [classify(TOOLS[0], '0.164.0'), classify(TOOLS[1], '2.1.310'), classify(TOOLS[2], null)];
  const text = report(rows, TOOLS, '2026-10-26');
  assert.match(text, /^## 上游版本检查（2026-10-26）/);
  assert.match(text, /\| Codex CLI \| 0\.164\.0 \| 0\.155\.x \| 超出范围 \|/);
  assert.match(text, /\| Claude Code \| 2\.1\.310 \| .* \| 已验证 \|/);
  assert.match(text, /\| DeepSeek Harness \| — \| .* \| 无法检查 \| 无法检查（网络或注册表无响应），不代表已是最新 \|/);
  assert.match(text, /需要处理：2 项。/);
  assert.match(report([classify(TOOLS[1], '2.1.310')], [TOOLS[1]], 'x'), /全部在已验证范围内。/);
});

test('lookup reads only the dist-tags endpoint and returns null on any failure', async (t) => {
  const original = global.fetch;
  t.after(() => {
    global.fetch = original;
  });
  const seen = [];
  global.fetch = async (url) => {
    seen.push(String(url));
    return new Response(JSON.stringify({ latest: '2.1.310', next: '2.1.311' }), { status: 200 });
  };
  assert.equal(await lookup('@anthropic-ai/claude-code', 'latest'), '2.1.310');
  assert.equal(await lookup('@anthropic-ai/claude-code', 'missing-tag'), '2.1.310');
  assert.match(seen[0], /\/-\/package\/@anthropic-ai%2fclaude-code\/dist-tags$/);
  global.fetch = async () => new Response('nope', { status: 503 });
  assert.equal(await lookup('@openai/codex', 'latest'), null);
  global.fetch = async () => {
    throw new Error('offline');
  };
  assert.equal(await lookup('@openai/codex', 'latest'), null);
  global.fetch = async () => new Response('{"latest": 5}', { status: 200 });
  assert.equal(await lookup('@openai/codex', 'latest'), null);
});

// T9.15: the compatibility check compares the Codex protocol definitions with what the app reads.
const { CODEX_NEEDS, codexProtocolProblems, testCounts, compatReport } = require('../scripts/upstream-compat.cjs');
const codexSchema = () => {
  const props = (names) => Object.fromEntries(names.map((n) => [n, { type: 'integer' }]));
  const definitions = Object.fromEntries(
    Object.entries(CODEX_NEEDS.types).map(([k, v]) => [k, { properties: props(v) }]),
  );
  definitions.RateLimitWindow.required = ['usedPercent'];
  definitions.Account = {
    oneOf: [
      { properties: { type: { enum: ['apiKey'] } } },
      { properties: { type: { enum: ['chatgpt'] }, email: {}, planType: {} } },
    ],
  };
  const union = (names) => ({ oneOf: names.map((m) => ({ properties: { method: { enum: [m] } } })) });
  return {
    bundle: { definitions },
    clientRequest: union([...CODEX_NEEDS.requests, 'account/rateLimitResetCredit/consume']),
    clientNotification: union(CODEX_NEEDS.notifications),
  };
};

test('T9.15: Codex protocol definitions are compatible when every method, type and field the app reads is there', () => {
  assert.deepEqual(codexProtocolProblems(codexSchema()), []);
  const renamed = codexSchema();
  delete renamed.bundle.definitions.RateLimitWindow.properties.usedPercent;
  renamed.bundle.definitions.RateLimitWindow.properties.usedPct = { type: 'integer' };
  renamed.bundle.definitions.RateLimitWindow.required = ['usedPct'];
  assert.deepEqual(codexProtocolProblems(renamed), [
    'RateLimitWindow 缺少 usedPercent',
    'RateLimitWindow 的 usedPercent 不再是必填',
  ]);
  const gone = codexSchema();
  gone.clientRequest.oneOf = gone.clientRequest.oneOf.filter((v) => v.properties.method.enum[0] !== 'account/read');
  gone.clientNotification.oneOf = [];
  delete gone.bundle.definitions.TokenUsageBreakdown;
  gone.bundle.definitions.Account.oneOf.pop();
  assert.deepEqual(codexProtocolProblems(gone), [
    '缺少方法 account/read',
    '缺少通知 initialized',
    '缺少类型 TokenUsageBreakdown',
    'Account 缺少 chatgpt 类型',
  ]);
  assert.ok(codexProtocolProblems({ bundle: null, clientRequest: null, clientNotification: null }).length > 0);
});

test('T9.15: the compatibility report counts only real incompatibilities and reads node --test counts', () => {
  assert.deepEqual(testCounts('ℹ tests 3\nℹ pass 3\nℹ fail 0\nℹ skipped 0\n'), { pass: 3, fail: 0, skipped: 0 });
  assert.deepEqual(testCounts('crashed'), { pass: null, fail: null, skipped: null });
  const rows = [
    { tool: 'Codex CLI', version: '0.164.0', state: 'compatible', note: 'ok' },
    { tool: 'Claude Code', version: null, state: 'manual', note: 'no definition' },
    { tool: 'DeepSeek Harness', version: '0.2.1-rc.4', state: 'unknown', note: '官方包安装失败' },
  ];
  const text = compatReport(/** @type {any} */ (rows), '2026-10-27');
  assert.match(text, /^## 上游兼容性检查（2026-10-27）/);
  assert.match(text, /\| Codex CLI \| 0\.164\.0 \| 兼容 \| ok \|/);
  assert.match(text, /\| Claude Code \| — \| 无法自动检查 \|/);
  assert.match(text, /\| DeepSeek Harness \| 0\.2\.1-rc\.4 \| 无法检查 \|/);
  assert.match(text, /没有发现不兼容。/);
  rows[0].state = 'incompatible';
  assert.match(compatReport(/** @type {any} */ (rows), 'x'), /发现不兼容：1 项/);
});
