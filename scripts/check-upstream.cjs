// T9.1: read-only check of the upstream tools this app reads, against the versions the code has verified.
//   node scripts/check-upstream.cjs            (UPSTREAM_REGISTRY=https://registry.npmmirror.com to use a mirror)
// Queries only the registry's dist-tags; never installs or runs an upstream package. Prints a Markdown report
// and, in GitHub Actions, appends it to the job summary. A lookup failure is reported as "无法检查", never as
// up to date. Exit code is 0 unless the script itself breaks; the report is the result.
const fs = require('node:fs');
const { VERIFIED_VERSIONS: CODEX } = require('../desktop/codex-reader.cjs');
const { supported: claudeSupported } = require('../desktop/claude-collector.cjs');
const { VERIFIED: HARNESS } = require('../desktop/harness-reader.cjs');

const REGISTRY = (process.env.UPSTREAM_REGISTRY || 'https://registry.npmjs.org').replace(/\/+$/, '');
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

/** Each tool: npm package, the dist-tag users get, what counts as verified, and how out-of-range data is read. */
const TOOLS = [
  {
    name: 'Codex CLI',
    pkg: '@openai/codex',
    tag: 'latest',
    verified: (v) => CODEX.some((re) => re.test(v)),
    range: '0.155.x',
    outside: 'rollout 结构一致时读取，标「版本未验证」（T5.1）',
  },
  {
    name: 'Claude Code',
    pkg: '@anthropic-ai/claude-code',
    tag: 'latest',
    verified: claudeSupported,
    range: '2.1.x（≥ 2.1.251）',
    outside: '状态栏与 OTLP 结构一致时读取，标「版本未验证」（T8.4）',
  },
  {
    name: 'DeepSeek Harness',
    pkg: '@deepseek-ai/dsh',
    // `latest` is what a plain install gets; Harness also publishes newer candidates under `next`.
    tag: 'latest',
    verified: (v) => Object.hasOwn(HARNESS, v),
    range: Object.keys(HARNESS).join('、'),
    outside: '事件结构一致时导出，标「版本未验证」（T8.13）',
  },
];

/**
 * @param {{ name: string, verified: (v: string) => boolean, range: string, outside: string }} tool
 * @param {string|null} latest the registry's version, or null when the lookup failed
 */
function classify(tool, latest) {
  if (typeof latest !== 'string' || !VERSION.test(latest))
    return { name: tool.name, latest: null, state: 'unknown', note: '无法检查（网络或注册表无响应），不代表已是最新' };
  if (tool.verified(latest)) return { name: tool.name, latest, state: 'verified', note: '在已验证范围内' };
  return { name: tool.name, latest, state: 'outside', note: `超出已验证范围：${tool.outside}；需复核后加入已验证列表` };
}

const LABEL = { verified: '已验证', outside: '超出范围', unknown: '无法检查' };

/** @param {ReturnType<typeof classify>[]} rows @param {typeof TOOLS} tools @param {string} when ISO time */
function report(rows, tools, when) {
  const lines = [
    `## 上游版本检查（${when}）`,
    '',
    '| 工具 | 最新版本 | 已验证范围 | 结论 | 说明 |',
    '|---|---|---|---|---|',
    ...rows.map((r, i) => `| ${r.name} | ${r.latest ?? '—'} | ${tools[i].range} | ${LABEL[r.state]} | ${r.note} |`),
  ];
  const pending = rows.filter((r) => r.state !== 'verified').length;
  lines.push('', pending ? `需要处理：${pending} 项。` : '全部在已验证范围内。');
  return lines.join('\n') + '\n';
}

/** @param {string} pkg @param {string} tag @returns {Promise<string|null>} */
async function lookup(pkg, tag) {
  try {
    const res = await fetch(`${REGISTRY}/-/package/${pkg.replace('/', '%2f')}/dist-tags`, {
      signal: AbortSignal.timeout(15000),
      headers: { accept: 'application/json' },
    });
    if (!res.ok) return null;
    const tags = await res.json();
    // A missing pre-release tag falls back to latest; the classification still names the version checked.
    const v = tags?.[tag] ?? tags?.latest;
    return typeof v === 'string' ? v : null;
  } catch {
    return null;
  }
}

async function main() {
  const latest = await Promise.all(TOOLS.map((t) => lookup(t.pkg, t.tag)));
  const text = report(
    TOOLS.map((t, i) => classify(t, latest[i])),
    TOOLS,
    new Date().toISOString().slice(0, 10),
  );
  process.stdout.write(text);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, text);
}

if (require.main === module)
  main().catch((e) => {
    console.error(String(e?.message || e));
    process.exit(1);
  });
module.exports = { TOOLS, classify, report, lookup };
