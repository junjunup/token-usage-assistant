// T4.0: time the analytics worker's query path (execute(), same code as the app) against real tool sources,
// read-only. The index lives in a temp directory; the real tool-usage.sqlite is never opened.
// Prints only kind / range / status / row count / durations. Never prints paths, labels or record contents.
// Usage: node scripts/perf/tool-query.cjs [--config=<tool-sources.json>] [--codex=<CODEX_HOME>] [--runs=5]
const fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path');
const { execute } = require('../../desktop/tool-worker.cjs');
const { rangeFor } = require('../../desktop/analytics-core.cjs');

const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const runs = Number(arg('runs')) || 5;
const sources = [];
if (arg('config'))
  for (const s of JSON.parse(fs.readFileSync(arg('config'), 'utf8')).sources || [])
    if (s.enabled !== false) sources.push(s);
if (arg('codex')) sources.push({ id: 'perf-codex', kind: 'codex', label: 'codex', file: arg('codex'), enabled: true });

function countFiles(source) {
  if (source.kind !== 'codex') return 1;
  let n = 0;
  const visit = (dir) => {
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries)
      if (e.isDirectory()) visit(path.join(dir, e.name));
      else if (e.name.endsWith('.jsonl')) n++;
  };
  visit(path.join(source.file, 'sessions'));
  visit(path.join(source.file, 'archived_sessions'));
  return n;
}
const stats = (times) => {
  const sorted = [...times].sort((a, b) => a - b);
  return { medianMs: sorted[Math.floor((sorted.length - 1) / 2)], maxMs: sorted.at(-1) };
};

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tua-perf-tools-'));
const out = [];
try {
  for (const source of sources) {
    const indexFile = path.join(root, `index-${source.kind}.sqlite`);
    for (const rangeId of ['today', '7d']) {
      const totals = [],
        perSource = [];
      let rows = null,
        status = null,
        cold = null;
      for (let i = 0; i < runs; i++) {
        const timings = [],
          begin = process.hrtime.bigint();
        const result = execute(
          {
            operation: 'query',
            indexFile,
            sources: [source],
            range: rangeFor(rangeId),
            filters: { billingGroupId: '', model: '', project: '', session: '' },
            prices: {},
          },
          timings,
        );
        const total = Number(process.hrtime.bigint() - begin) / 1e6;
        if (cold === null) cold = total;
        totals.push(total);
        perSource.push(timings[0]?.durationMs ?? null);
        rows = timings[0]?.count ?? null;
        status = result.sourceReports?.[0]?.status || result.status;
      }
      out.push({
        kind: source.kind,
        range: rangeId,
        status,
        files: countFiles(source),
        scannedRows: rows,
        firstRunMs: +cold.toFixed(1),
        totalMs: Object.fromEntries(Object.entries(stats(totals)).map(([k, v]) => [k, +v.toFixed(1)])),
        sourceReadMs: stats(perSource.filter((v) => v !== null)),
      });
    }
  }
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
console.log(
  JSON.stringify(
    { node: process.version, platform: process.platform, arch: process.arch, runs, results: out },
    null,
    2,
  ),
);
