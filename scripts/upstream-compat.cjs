// T9.15 (D15): the weekly compatibility check. For each tool whose newest version is outside the reviewed list (T9.1),
// install the official package in a temporary directory (--ignore-scripts, no login, no model calls) and check the
// structures this app reads:
//   - Codex: `codex app-server generate-json-schema` (offline, isolated CODEX_HOME) -> the four read-only methods,
//     the rate-limit types and TokenUsageBreakdown (evidence that the rollout counters still mean the same).
//   - DeepSeek Harness: the runtime tests of tests/harness-plugin.test.cjs against the official runtime.
//   - Claude Code: no machine-readable definition exists for the status line or OTLP events (T9.12); reported as such.
//   node scripts/upstream-compat.cjs
// UPSTREAM_COMPAT_CODEX / UPSTREAM_COMPAT_HARNESS name a version to check regardless of the reviewed list. The report
// holds field and method names and test counts only, never upstream output. Exit code 1 only when a check found an
// incompatibility; a lookup or install failure is reported as "无法检查", never as compatible.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { TOOLS, classify, lookup } = require('./check-upstream.cjs');

const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const ROOT = path.resolve(__dirname, '..');

/** What this app reads from the Codex app-server protocol (desktop/codex-rpc.cjs, desktop/subscriptions.cjs). */
const CODEX_NEEDS = Object.freeze({
  requests: ['initialize', 'account/read', 'account/rateLimits/read'],
  notifications: ['initialized'],
  types: {
    GetAccountRateLimitsResponse: ['rateLimits', 'rateLimitsByLimitId'],
    RateLimitSnapshot: ['limitId', 'limitName', 'primary', 'secondary'],
    RateLimitWindow: ['usedPercent', 'windowDurationMins', 'resetsAt'],
    // Same counters as the rollout `token_count` (snake_case there): their meaning has an official definition here.
    TokenUsageBreakdown: [
      'inputTokens',
      'cachedInputTokens',
      'cacheWriteInputTokens',
      'outputTokens',
      'reasoningOutputTokens',
      'totalTokens',
    ],
  },
  account: ['type', 'email', 'planType'],
});

/** @param {any} union a JSON schema whose oneOf variants each fix `method` */
const methods = (union) =>
  new Set((Array.isArray(union?.oneOf) ? union.oneOf : []).flatMap((v) => v?.properties?.method?.enum ?? []));

/**
 * Differences between the Codex protocol definitions and what this app reads; [] when compatible.
 * @param {{ bundle: any, clientRequest: any, clientNotification: any }} schema
 * @returns {string[]}
 */
function codexProtocolProblems({ bundle, clientRequest, clientNotification }) {
  const problems = [];
  const requests = methods(clientRequest),
    notifications = methods(clientNotification);
  for (const m of CODEX_NEEDS.requests) if (!requests.has(m)) problems.push(`缺少方法 ${m}`);
  for (const m of CODEX_NEEDS.notifications) if (!notifications.has(m)) problems.push(`缺少通知 ${m}`);
  const defs = bundle?.definitions ?? {};
  for (const [type, fields] of Object.entries(CODEX_NEEDS.types)) {
    const props = defs[type]?.properties;
    if (!props) {
      problems.push(`缺少类型 ${type}`);
      continue;
    }
    for (const f of fields) if (!Object.hasOwn(props, f)) problems.push(`${type} 缺少 ${f}`);
  }
  if (!(defs.RateLimitWindow?.required ?? []).includes('usedPercent'))
    problems.push('RateLimitWindow 的 usedPercent 不再是必填');
  const chatgpt = (defs.Account?.oneOf ?? []).find((v) => v?.properties?.type?.enum?.includes('chatgpt'));
  if (!chatgpt) problems.push('Account 缺少 chatgpt 类型');
  else
    for (const f of CODEX_NEEDS.account) if (!Object.hasOwn(chatgpt.properties, f)) problems.push(`Account 缺少 ${f}`);
  return problems;
}

/** @param {string} dir the --out directory of generate-json-schema */
function readCodexSchema(dir) {
  const read = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  return {
    bundle: read('codex_app_server_protocol.v2.schemas.json'),
    clientRequest: read('ClientRequest.json'),
    clientNotification: read('ClientNotification.json'),
  };
}

/**
 * Pass / fail / skip counts and the names of failed tests (ours, never upstream output) from TAP output.
 * @param {string} out
 */
function testCounts(out) {
  const n = (k) => {
    const m = out.match(new RegExp(`^# ${k} (\\d+)$`, 'm'));
    return m ? Number(m[1]) : null;
  };
  const failed = [...out.matchAll(/^\s*not ok \d+ - (.+?)(?: # .*)?$/gm)].map((m) => m[1].slice(0, 160));
  return { pass: n('pass'), fail: n('fail'), skipped: n('skipped'), failed };
}

/**
 * @param {{ tool: string, version: string|null, state: 'compatible'|'incompatible'|'unknown'|'manual'|'current', note: string }[]} rows
 * @param {string} when
 */
function compatReport(rows, when) {
  const LABEL = {
    compatible: '兼容',
    incompatible: '不兼容',
    unknown: '无法检查',
    manual: '无法自动检查',
    current: '无需检查',
  };
  const lines = [
    `## 上游兼容性检查（${when}）`,
    '',
    '| 工具 | 版本 | 结论 | 说明 |',
    '|---|---|---|---|',
    ...rows.map((r) => `| ${r.tool} | ${r.version ?? '—'} | ${LABEL[r.state]} | ${r.note} |`),
  ];
  const bad = rows.filter((r) => r.state === 'incompatible').length;
  lines.push('', bad ? `发现不兼容：${bad} 项，需要按 D15 走兼容修复。` : '没有发现不兼容。');
  return lines.join('\n') + '\n';
}

const MANUAL_CLAUDE =
  '状态栏与 OTLP 事件没有官方可机读定义（T9.12），只能靠读取端的结构契约与字段名指纹（T9.13、T9.14）发现变化';

/** @param {string} pkg @param {string} version @param {string} dir */
function install(pkg, version, dir) {
  const r = spawnSync(
    process.platform === 'win32' ? 'npm.cmd' : 'npm',
    ['install', '--prefix', dir, '--ignore-scripts', '--no-audit', '--no-fund', '--save-exact', `${pkg}@${version}`],
    { encoding: 'utf8', timeout: 600000, shell: process.platform === 'win32' },
  );
  const installed = path.join(dir, 'node_modules', ...pkg.split('/'), 'package.json');
  return (
    r.status === 0 && fs.existsSync(installed) && JSON.parse(fs.readFileSync(installed, 'utf8')).version === version
  );
}

/** @param {string} version @param {string} tmp */
function checkCodex(version, tmp) {
  const dir = path.join(tmp, 'codex'),
    home = path.join(tmp, 'codex-home'),
    out = path.join(tmp, 'codex-schema');
  fs.mkdirSync(home, { recursive: true });
  if (!install('@openai/codex', version, dir)) return { state: 'unknown', note: '官方包安装失败' };
  const bin = path.join(dir, 'node_modules/@openai/codex/bin/codex.js');
  // An isolated home: no login, no configuration, no history of the machine running the check.
  const r = spawnSync(process.execPath, [bin, 'app-server', 'generate-json-schema', '--out', out], {
    env: { PATH: process.env.PATH, HOME: home, USERPROFILE: home, CODEX_HOME: home },
    encoding: 'utf8',
    timeout: 120000,
  });
  if (r.status !== 0) return { state: 'unknown', note: '导出协议定义失败' };
  let schema;
  try {
    schema = readCodexSchema(out);
  } catch {
    return { state: 'incompatible', note: '协议定义文件缺失或无法解析' };
  }
  const problems = codexProtocolProblems(schema);
  return problems.length
    ? { state: 'incompatible', note: problems.join('；') }
    : {
        state: 'compatible',
        note: '协议定义中 4 个只读方法、额度类型与 TokenUsageBreakdown 的字段齐全（rollout 本身不在协议里，仍靠读取端契约）',
      };
}

/** @param {string} version @param {string} tmp */
function checkHarness(version, tmp) {
  const dir = path.join(tmp, 'harness');
  if (!install('@deepseek-ai/dsh', version, dir)) return { state: 'unknown', note: '官方包安装失败' };
  const r = spawnSync(
    process.execPath,
    [
      '--test',
      '--test-reporter=tap',
      `--test-name-pattern=${version.replace(/[.]/g, '\\.')}`,
      path.join('tests', 'harness-plugin.test.cjs'),
    ],
    {
      cwd: ROOT,
      env: {
        ...process.env,
        TUA_HARNESS_CANDIDATE_VERSION: version,
        TUA_HARNESS_CANDIDATE_RUNTIME: dir,
      },
      encoding: 'utf8',
      timeout: 300000,
    },
  );
  const c = testCounts(r.stdout || '');
  if (process.env.UPSTREAM_COMPAT_DEBUG_TMP) console.error((r.stdout || '').slice(-6000), (r.stderr || '').slice(-2000));
  if (c.pass === 3 && c.fail === 0 && r.status === 0)
    return {
      state: 'compatible',
      note: '官方运行时上 3 项运行时测试全部通过（SessionStore 契约、插件入口、CLI 隔离安装）',
    };
  if (c.pass === null) return { state: 'unknown', note: '测试没有运行' };
  return {
    state: 'incompatible',
    note: `运行时测试：通过 ${c.pass}、失败 ${c.fail ?? '—'}${c.failed.length ? '（' + c.failed.join('；') + '）' : ''}，需要复核`,
  };
}

async function main() {
  const overrides = {
    'Codex CLI': process.env.UPSTREAM_COMPAT_CODEX,
    'DeepSeek Harness': process.env.UPSTREAM_COMPAT_HARNESS,
  };
  const checks = { 'Codex CLI': checkCodex, 'DeepSeek Harness': checkHarness };
  const rows = [];
  for (const tool of TOOLS) {
    if (tool.name === 'Claude Code') {
      rows.push({ tool: tool.name, version: null, state: 'manual', note: MANUAL_CLAUDE });
      continue;
    }
    const forced = overrides[tool.name];
    if (forced && !VERSION.test(forced)) {
      rows.push({ tool: tool.name, version: null, state: 'unknown', note: '指定的版本号格式不对' });
      continue;
    }
    const version = forced || (await lookup(tool.pkg, tool.tag));
    const c = classify(tool, version);
    if (!forced && c.state !== 'outside') {
      rows.push({
        tool: tool.name,
        version: c.latest,
        state: c.state === 'verified' ? 'current' : 'unknown',
        note: c.state === 'verified' ? '最新版本在已复核列表内' : c.note,
      });
      continue;
    }
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tua-compat-'));
    try {
      rows.push({ tool: tool.name, version: /** @type {string} */ (version), ...checks[tool.name](version, tmp) });
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }
  const text = compatReport(/** @type {any} */ (rows), new Date().toISOString().slice(0, 10));
  process.stdout.write(text);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, text);
  if (rows.some((r) => r.state === 'incompatible')) process.exitCode = 1;
}

if (require.main === module)
  main().catch((e) => {
    console.error(String(e?.message || e));
    process.exit(2);
  });
module.exports = { CODEX_NEEDS, codexProtocolProblems, readCodexSchema, testCounts, compatReport };
