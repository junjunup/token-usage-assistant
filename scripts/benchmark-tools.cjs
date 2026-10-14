// Reproducible 100k Harness metadata import, replay and cancellation; no user data or model calls.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { LocalStore } = require('../desktop/store.cjs');
const { ToolSources } = require('../desktop/tool-sources.cjs');
const { createHarness, harnessWire } = require('../desktop/tool-fixture.cjs');
async function main() {
  const project = path.resolve(__dirname, '..'),
    work = path.join(project, 'work');
  fs.mkdirSync(work, { recursive: true });
  const root = fs.mkdtempSync(path.join(work, 'benchmark-tools-')),
    now = Date.now(),
    file = createHarness(path.join(root, 'export'), []);
  for (let batch = 0; batch < 100; batch++) {
    const rows = [];
    for (let i = 0; i < 1000; i++) {
      const id = batch * 1000 + i;
      rows.push(
        JSON.stringify(
          harnessWire(now, {
            attemptId: 'bulk-' + id,
            requestId: 'bulk-' + id,
            timestamp: now - 120000 - id,
            updatedAt: now - 1000,
          }),
        ),
      );
    }
    fs.appendFileSync(file, rows.join('\n') + '\n');
  }
  const store = new LocalStore(path.join(root, 'assistant')),
    sources = new ToolSources({ store }),
    timings = {};
  sources.add({ kind: 'harness', file });
  let beats = 0,
    maxRss = 0;
  const timer = setInterval(() => {
    beats++;
    maxRss = Math.max(maxRss, process.memoryUsage().rss);
  }, 10);
  try {
    let start = performance.now();
    const first = await sources.query({ range: '7d' });
    timings.firstImportMs = performance.now() - start;
    assert.equal(first.summary?.requests, 100000);
    assert.equal(first.summary?.total, 12000000);
    assert.ok(beats > 2);
    start = performance.now();
    const again = await sources.query({ range: '7d' });
    timings.replayMs = performance.now() - start;
    assert.equal(again.summary?.total, 12000000);
    assert.equal(again.summary?.requests, 100000);
    const cancelStore = new LocalStore(path.join(root, 'cancel-assistant')),
      cancellable = new ToolSources({ store: cancelStore });
    cancellable.add({ kind: 'harness', file });
    try {
      const pending = cancellable.query({ range: '7d', requestId: 'benchmark-cancel' });
      await new Promise((resolve) => setTimeout(resolve, 100));
      await cancellable.cancel('benchmark-cancel');
      assert.equal((await pending).status, 'cancelled');
      const db = new DatabaseSync(cancelStore.file('tool-usage.sqlite'));
      const table = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='tool_records'").get();
      const afterCancel = table ? db.prepare('SELECT COUNT(*) AS n FROM tool_records').get().n : 0;
      db.close();
      assert.equal(afterCancel, 0);
      start = performance.now();
      const restored = await cancellable.query({ range: '7d' });
      timings.recoveryMs = performance.now() - start;
      assert.equal(restored.summary?.requests, 100000);
      assert.equal(restored.summary?.total, 12000000);
    } finally {
      await cancellable.dispose();
    }
    const files = ['tool-sources', 'tool-worker', 'tool-analytics', 'harness-reader'],
      sourceHashes = Object.fromEntries(
        files.map((name) => [
          name,
          crypto
            .createHash('sha256')
            .update(fs.readFileSync(path.join(project, 'desktop', name + '.cjs')))
            .digest('hex'),
        ]),
      );
    const result = {
      ok: true,
      kind: 'synthetic-harness-100k',
      at: new Date().toISOString(),
      records: 100000,
      totalTokens: 12000000,
      replayDeduplicated: true,
      cancelRolledBack: true,
      recoveryExact: true,
      mainThreadHeartbeats: beats,
      maxRssBytes: maxRss,
      ...timings,
      sourceHashes,
      realToolCalls: false,
    };
    fs.writeFileSync(path.join(root, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ root, ...result }));
  } finally {
    clearInterval(timer);
    await sources.dispose();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
