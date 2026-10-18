const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
const { createRequire } = require('node:module');
const { spawnSync } = require('node:child_process');
const pluginPath = path.resolve(__dirname, '../integrations/deepseek-harness/exporter.js');
const plugin = import(pathToFileURL(pluginPath));
const BASE = 1800000000000;
const sample = {
  inputTokens: 12,
  outputTokens: 7,
  cacheReadTokens: 30,
  cacheWriteTokens: 3,
  reasoningTokens: 2,
  totalTokens: 52,
};
const stream = (usage) => [{ type: 'chunk', time: BASE, chunk: { type: 'usage', usage } }];
function session(id = 'session-1', extra = {}) {
  return { id, inheritedEventCount: 0, header: { version: 4, id, cwd: 'D:\\Project', isSeeded: false }, ...extra };
}
function event(seq, type, data) {
  return { seq, time: BASE + seq, type, data };
}
async function setup(t, options = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'tua-harness-test-'));
  t.after(async () => {
    if (
      path.dirname(directory) !== path.resolve(os.tmpdir()) ||
      !path.basename(directory).startsWith('tua-harness-test-')
    )
      throw new Error('Unexpected test directory');
    await fs.rm(directory, { recursive: true, force: true });
  });
  const { UsageExporter, HARNESS_VERSION } = await plugin;
  const exporter = new UsageExporter({
    outputDirectory: directory,
    runtimeVersion: HARNESS_VERSION,
    now: () => BASE,
    ...options,
  });
  await exporter.ready;
  return {
    exporter,
    directory,
    rows: async () => {
      await exporter.flush();
      return (await fs.readFile(path.join(directory, 'usage.jsonl'), 'utf8'))
        .trim()
        .split('\n')
        .filter(Boolean)
        .map(JSON.parse);
    },
  };
}
function latest(rows) {
  return [...new Map(rows.map((row) => [row.attemptId, row])).values()];
}
function settle(exporter, s, seq, usage = sample, interrupted = false) {
  exporter.observe(
    s,
    event(seq, 'assistant/message', {
      turn: 1,
      step: 1,
      stream: stream(usage),
      usage,
      interrupted,
      message: { source: { provider: 'deepseek', model: 'deepseek-chat' }, content: ['secret body'] },
    }),
  );
}

test('Harness final usage replaces embedded stream and same-attempt prior sample exactly once', async (t) => {
  const { exporter, rows } = await setup(t);
  const s = session();
  exporter.observe(s, event(0, 'step/start', { turn: 1, step: 1 }));
  exporter.observe(
    s,
    event(1, 'assistant/attempt', {
      turn: 1,
      step: 1,
      stream: stream({ ...sample, outputTokens: 3, totalTokens: 48 }),
    }),
  );
  exporter.observe(
    s,
    event(2, 'assistant/message', {
      turn: 1,
      step: 1,
      stream: stream({ ...sample, outputTokens: 4, totalTokens: 49 }),
      usage: sample,
      message: { source: { provider: 'deepseek', model: 'deepseek-chat' } },
    }),
  );
  const records = await rows();
  assert.equal(records.length, 3);
  assert.equal(latest(records).length, 1);
  assert.equal(latest(records)[0].usage.totalTokens, 52);
  assert.equal(latest(records)[0].usage.uncachedInputTokens, 12);
  assert.equal(latest(records)[0].status, 'completed');
  assert.equal(latest(records)[0].revision, 2);
});

test('Harness retry retains failed reported usage and creates a distinct stable attempt', async (t) => {
  const { exporter, rows } = await setup(t);
  const s = session();
  exporter.observe(s, event(0, 'step/start', { turn: 1, step: 1 }));
  exporter.observe(s, event(1, 'assistant/attempt', { turn: 1, step: 1, stream: stream(sample) }));
  exporter.observe(s, event(2, 'llm/retry', { turn: 1, step: 1, retry: 1 }));
  exporter.observe(s, event(3, 'llm/retry-started', { turn: 1, step: 1, retry: 1 }));
  settle(exporter, s, 4);
  const final = latest(await rows());
  assert.equal(final.length, 2);
  assert.equal(final[0].requestId, final[1].requestId);
  assert.notEqual(final[0].attemptId, final[1].attemptId);
  assert.deepEqual(
    final.map((r) => r.status),
    ['failed', 'completed'],
  );
  assert.equal(
    final.reduce((sum, r) => sum + r.usage.totalTokens, 0),
    104,
  );
});

test('Harness cancelled requests retain reported usage and missing usage stays unknown', async (t) => {
  const { exporter, rows } = await setup(t);
  const s = session();
  exporter.observe(s, event(0, 'step/start', { turn: 1, step: 1 }));
  settle(exporter, s, 1, sample, true);
  exporter.observe(s, event(2, 'turn/end', { turn: 1, reason: { kind: 'aborted', reason: { kind: 'user' } } }));
  exporter.observe(s, event(3, 'step/start', { turn: 2, step: 1 }));
  exporter.observe(s, event(4, 'assistant/attempt', { turn: 2, step: 1, stream: [] }));
  exporter.observe(s, event(5, 'turn/end', { turn: 2, reason: { kind: 'error' } }));
  const final = latest(await rows());
  assert.equal(final[0].status, 'cancelled');
  assert.equal(final[0].usage.totalTokens, 52);
  assert.equal(final[1].status, 'failed');
  assert.equal(final[1].usageReported, false);
  assert.ok(Object.values(final[1].usage).every((value) => value === null));
});

test('Harness duplicate events, source restart, inherited fork prefix and subagents do not duplicate attempts', async (t) => {
  const { exporter, directory, rows } = await setup(t);
  const parent = session();
  const start = event(0, 'step/start', { turn: 1, step: 1 });
  exporter.observe(parent, start);
  exporter.observe(parent, start);
  settle(exporter, parent, 1);
  const child = session('child-1', {
    inheritedEventCount: 2,
    header: { version: 4, id: 'child-1', isSeeded: true, origin: 'subagent' },
  });
  exporter.observe(child, start);
  settle(exporter, child, 1);
  exporter.observe(child, event(2, 'step/start', { turn: 1, step: 1 }));
  settle(exporter, child, 3);
  const before = latest(await rows());
  assert.equal(before.length, 2);
  assert.notEqual(before[0].attemptId, before[1].attemptId);
  const markerBefore = JSON.parse(await fs.readFile(path.join(directory, 'source.json'), 'utf8'));
  await exporter.close();
  const { UsageExporter, HARNESS_VERSION } = await plugin;
  const restarted = new UsageExporter({
    outputDirectory: directory,
    runtimeVersion: HARNESS_VERSION,
    now: () => BASE + 100,
  });
  await restarted.ready;
  restarted.observe(parent, start);
  settle(restarted, parent, 1);
  await restarted.close();
  const markerAfter = JSON.parse(await fs.readFile(path.join(directory, 'source.json'), 'utf8'));
  assert.equal(markerBefore.sourceId, markerAfter.sourceId);
  const final = (await fs.readFile(path.join(directory, 'usage.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(latest(final).length, 2);
});

test('Harness metadata export never reads bodies, tool output, failure text or credentials', async (t) => {
  const { exporter, directory, rows } = await setup(t);
  const s = session();
  const forbidden = () => {
    throw new Error('PRIVATE_SECRET_READ');
  };
  exporter.observe(s, event(0, 'step/start', { turn: 1, step: 1 }));
  const message = {
    source: {
      provider: 'deepseek',
      model: 'deepseek-chat',
      get replayState() {
        return forbidden();
      },
    },
    get content() {
      return forbidden();
    },
  };
  const packed = {
    type: 'text-chunks',
    get texts() {
      return forbidden();
    },
  };
  const raw = {
    type: 'chunk',
    chunk: {
      type: 'text-delta',
      get text() {
        return forbidden();
      },
    },
  };
  exporter.observe(
    s,
    event(1, 'assistant/message', {
      turn: 1,
      step: 1,
      usage: sample,
      message,
      stream: [packed, raw, ...stream(sample)],
      get apiKey() {
        return forbidden();
      },
    }),
  );
  exporter.observe(
    s,
    event(2, 'tool/result', {
      get message() {
        return forbidden();
      },
    }),
  );
  exporter.observe(
    s,
    event(3, 'user/message', {
      get content() {
        return forbidden();
      },
    }),
  );
  const final = latest(await rows());
  assert.equal(final.length, 1);
  assert.equal(final[0].status, 'completed');
  assert.equal(exporter.error, null);
  for (const file of await fs.readdir(directory))
    assert.doesNotMatch(
      await fs.readFile(path.join(directory, file), 'utf8'),
      /PRIVATE_SECRET_READ|secret body|apiKey|replayState|content/,
    );
});

test('Harness unknown runtime and session formats explicitly fail closed without throwing into host', async (t) => {
  const unsupported = await setup(t, { runtimeVersion: '9.9.9' });
  unsupported.exporter.observe(session(), event(0, 'step/start', { turn: 1, step: 1 }));
  assert.equal((await unsupported.rows()).length, 0);
  assert.equal(
    JSON.parse(await fs.readFile(path.join(unsupported.directory, 'status.json'), 'utf8')).code,
    'unsupported-runtime',
  );
  const bad = await setup(t);
  const s = session();
  s.header.version = 999;
  assert.doesNotThrow(() => bad.exporter.observe(s, event(0, 'step/start', { turn: 1, step: 1 })));
  assert.equal((await bad.rows()).length, 0);
  assert.equal(bad.exporter.error, 'unsupported-format');
});

test('Harness missing attempt boundary is disclosed instead of inventing history', async (t) => {
  const { exporter, directory, rows } = await setup(t);
  settle(exporter, session(), 4);
  assert.equal((await rows()).length, 0);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(directory, 'status.json'), 'utf8')).gaps, [
    'missing-attempt-boundary',
  ]);
});

test('Harness missing cache counters stay unknown and contradictory counters fail explicitly', async (t) => {
  const partial = await setup(t);
  const s = session();
  partial.exporter.observe(s, event(0, 'step/start', { turn: 1, step: 1 }));
  settle(partial.exporter, s, 1, { inputTokens: 8, outputTokens: 2, totalTokens: 15 });
  const r = latest(await partial.rows())[0];
  assert.equal(r.usage.cacheReadTokens, null);
  assert.equal(r.usage.totalTokens, 15);
  const bad = await setup(t);
  const b = session();
  bad.exporter.observe(b, event(0, 'step/start', { turn: 1, step: 1 }));
  settle(bad.exporter, b, 1, { ...sample, totalTokens: 20 });
  await bad.rows();
  assert.equal(bad.exporter.error, 'invalid-usage');
});

test('Harness disk failures and queue overflow never interrupt host execution or expose exceptions', async (t) => {
  const failing = await setup(t, {
    io: {
      ...fs,
      appendFile: async () => {
        throw new Error('secret credential disk exception');
      },
    },
  });
  assert.doesNotThrow(() => failing.exporter.observe(session(), event(0, 'step/start', { turn: 1, step: 1 })));
  assert.equal(failing.exporter.error, 'io-error');
  const bounded = await setup(t, { maxQueue: 1 });
  const s = session();
  bounded.exporter.observe(s, event(0, 'step/start', { turn: 1, step: 1 }));
  settle(bounded.exporter, s, 1);
  await bounded.rows();
  assert.equal(bounded.exporter.error, 'queue-overflow');
});

test('Harness transient append error publishes a fixed failure status without requiring shutdown', async (t) => {
  let appendCalls = 0;
  const io = {
    ...fs,
    appendFile: async (...args) => {
      if (++appendCalls === 2) throw new Error('SECRET failure detail');
      return fs.appendFile(...args);
    },
  };
  const { exporter, directory } = await setup(t, { io });
  exporter.observe(session(), event(0, 'step/start', { turn: 1, step: 1 }));
  await exporter.tail;
  const status = await fs.readFile(path.join(directory, 'status.json'), 'utf8');
  assert.equal(JSON.parse(status).code, 'io-error');
  assert.doesNotMatch(status, /SECRET/);
});

test('Harness concurrent exporters share one source identity and serialize complete JSONL lines', async (t) => {
  const { exporter: first, directory } = await setup(t);
  const { UsageExporter, HARNESS_VERSION } = await plugin;
  const second = new UsageExporter({ outputDirectory: directory, runtimeVersion: HARNESS_VERSION, now: () => BASE });
  await second.ready;
  const a = session('parallel-a'),
    b = session('parallel-b');
  first.observe(a, event(0, 'step/start', { turn: 1, step: 1 }));
  second.observe(b, event(0, 'step/start', { turn: 1, step: 1 }));
  settle(first, a, 1);
  settle(second, b, 1);
  await Promise.all([first.close(), second.close()]);
  const rows = (await fs.readFile(path.join(directory, 'usage.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(rows.length, 4);
  assert.equal(new Set(rows.map((row) => row.sourceId)).size, 1);
  assert.equal(latest(rows).length, 2);
});

// T4.7: Windows reports lock and status-file contention as EPERM; it is retried, never fatal.
const busy = () => Object.assign(new Error('SECRET contention detail'), { code: 'EPERM' });

test('T4.7: a transient EPERM on the lock and on the status rename is retried; both writers keep every line', async (t) => {
  let lockFailures = 1,
    renameFailures = 1;
  const io = {
    ...fs,
    open: async (file, ...rest) => {
      if (String(file).endsWith('.export.lock') && lockFailures-- > 0) throw busy();
      return fs.open(file, ...rest);
    },
    rename: async (...args) => {
      if (renameFailures-- > 0) throw busy();
      return fs.rename(...args);
    },
  };
  const { exporter: first, directory } = await setup(t);
  const { UsageExporter, HARNESS_VERSION } = await plugin;
  const second = new UsageExporter({
    outputDirectory: directory,
    runtimeVersion: HARNESS_VERSION,
    now: () => BASE,
    io,
  });
  await second.ready;
  const a = session('busy-a'),
    b = session('busy-b');
  first.observe(a, event(0, 'step/start', { turn: 1, step: 1 }));
  second.observe(b, event(0, 'step/start', { turn: 1, step: 1 }));
  settle(first, a, 1);
  settle(second, b, 1);
  await Promise.all([first.close(), second.close()]);
  assert.equal(lockFailures < 0 && renameFailures < 0, true);
  assert.equal(first.error, null);
  assert.equal(second.error, null);
  const rows = (await fs.readFile(path.join(directory, 'usage.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(rows.length, 4);
  assert.equal(latest(rows).length, 2);
  const status = JSON.parse(await fs.readFile(path.join(directory, 'status.json'), 'utf8'));
  assert.equal(status.code, null);
});

test('T4.7: a lock that stays unavailable still ends in a fixed io-error without leaking the cause', async (t) => {
  const io = {
    ...fs,
    open: async (file, ...rest) => {
      if (String(file).endsWith('.export.lock')) throw busy();
      return fs.open(file, ...rest);
    },
  };
  const { directory } = await setup(t);
  const { UsageExporter, HARNESS_VERSION } = await plugin;
  const stuck = new UsageExporter({ outputDirectory: directory, runtimeVersion: HARNESS_VERSION, now: () => BASE, io });
  await stuck.ready.catch(() => {});
  const s = session('stuck');
  stuck.observe(s, event(0, 'step/start', { turn: 1, step: 1 }));
  settle(stuck, s, 1);
  await stuck.tail;
  assert.equal(stuck.error, 'io-error');
  const rows = (await fs.readFile(path.join(directory, 'usage.jsonl'), 'utf8')).trim();
  assert.doesNotMatch(rows, /busy|SECRET/);
});

test('Harness one process stopping does not hide another active writer or erase its failure gap', async (t) => {
  const { exporter: first, directory } = await setup(t);
  const { UsageExporter, HARNESS_VERSION } = await plugin;
  const second = new UsageExporter({ outputDirectory: directory, runtimeVersion: HARNESS_VERSION, now: () => BASE });
  await second.ready;
  await first.close();
  let health = JSON.parse(await fs.readFile(path.join(directory, 'status.json'), 'utf8'));
  assert.equal(health.state, 'ready');
  assert.equal(health.writers.length, 1);
  second.disable('invalid-usage');
  await second.tail;
  await second.close();
  const third = new UsageExporter({ outputDirectory: directory, runtimeVersion: HARNESS_VERSION, now: () => BASE });
  await third.ready;
  health = JSON.parse(await fs.readFile(path.join(directory, 'status.json'), 'utf8'));
  assert.equal(health.state, 'ready');
  assert.ok(health.gaps.includes('invalid-usage'));
  await third.close();
});

test('Harness multi-step turns and concurrent sessions keep retry status and model attribution isolated', async (t) => {
  const { exporter, rows } = await setup(t);
  const a = session('parent'),
    b = session('child');
  exporter.observe(a, event(0, 'step/start', { turn: 1, step: 1 }));
  exporter.observe(b, event(0, 'step/start', { turn: 1, step: 1 }));
  exporter.observe(a, event(1, 'request/context', { provider: 'deepseek', model: 'alpha' }));
  exporter.observe(b, event(1, 'request/context', { provider: 'other', model: 'beta' }));
  exporter.observe(a, event(2, 'assistant/attempt', { turn: 1, step: 1, stream: stream(sample) }));
  exporter.observe(a, event(3, 'llm/retry', { turn: 1, step: 1 }));
  exporter.observe(a, event(4, 'llm/retry-started', { turn: 1, step: 1 }));
  settle(exporter, a, 5);
  exporter.observe(a, event(6, 'step/end', { turn: 1, step: 1 }));
  exporter.observe(a, event(7, 'step/start', { turn: 1, step: 2 }));
  exporter.observe(a, event(8, 'assistant/attempt', { turn: 1, step: 2, stream: stream(sample) }));
  exporter.observe(a, event(9, 'turn/end', { turn: 1, reason: { kind: 'aborted' } }));
  exporter.observe(b, event(2, 'assistant/attempt', { turn: 1, step: 1, stream: stream(sample) }));
  exporter.observe(b, event(3, 'turn/end', { turn: 1, reason: { kind: 'error' } }));
  const final = latest(await rows());
  assert.equal(final.length, 4);
  assert.deepEqual(
    final.filter((row) => row.sessionId === 'parent').map((row) => row.status),
    ['failed', 'completed', 'cancelled'],
  );
  assert.equal(final.find((row) => row.sessionId === 'child').model, 'beta');
  assert.equal(
    final.reduce((sum, row) => sum + row.usage.totalTokens, 0),
    208,
  );
});

test(
  'Pinned installed Harness Cordis SessionStore publishes the exact plugin contract',
  { skip: !process.env.TUA_HARNESS_CONTRACT_RUNTIME },
  async (t) => {
    const runtimeRequire = createRequire(
      path.join(path.resolve(process.env.TUA_HARNESS_CONTRACT_RUNTIME), 'package.json'),
    );
    const { Context } = await import(pathToFileURL(runtimeRequire.resolve('@deepseek-ai/cordis')));
    const { default: SessionStore } = await import(pathToFileURL(runtimeRequire.resolve('@deepseek-ai/dsh-session')));
    assert.equal(runtimeRequire('@deepseek-ai/dsh-session/package.json').version, '0.1.7-rc.1');
    const { exporter, rows } = await setup(t, { now: Date.now });
    const ctx = new Context();
    const fiber = await ctx.plugin(SessionStore);
    ctx.on('session/event', (s, e) => exporter.observe(s, e));
    const s = ctx.sessions.create();
    s.append('turn/start', { turn: 1 });
    s.append('step/start', { turn: 1, step: 1 });
    s.append('assistant/attempt', { turn: 1, step: 1, stream: stream(sample) });
    s.append('llm/retry', {
      retryId: 'retry-1',
      turn: 1,
      step: 1,
      provider: 'mock',
      mode: 'always',
      policyKey: 'fixture',
      retry: 1,
      delayMs: 0,
      failure: { code: 'NETWORK', message: 'never exported' },
    });
    s.append('llm/retry-started', { retryId: 'retry-1', turn: 1, step: 1, retry: 1 });
    s.append(
      'assistant/message',
      {
        turn: 1,
        step: 1,
        usage: sample,
        stream: stream(sample),
        message: {
          id: 'fixture-message',
          role: 'assistant',
          content: [],
          source: { kind: 'model', provider: 'mock', model: 'fixture' },
        },
      },
      { surfaceOp: 'append' },
    );
    s.append('step/end', { turn: 1, step: 1 });
    s.append('turn/end', { turn: 1, reason: { kind: 'completed' } });
    const final = latest(await rows());
    assert.equal(final.length, 2);
    assert.deepEqual(
      final.map((r) => r.status),
      ['failed', 'completed'],
    );
    assert.equal(final[1].usage.totalTokens, 52);
    await exporter.close();
    await fiber.dispose();
  },
);

test(
  'Pinned Cordis loads the shipped plugin entrypoint and unload flushes its local export',
  { skip: !process.env.TUA_HARNESS_CONTRACT_RUNTIME },
  async (t) => {
    const runtime = path.resolve(process.env.TUA_HARNESS_CONTRACT_RUNTIME);
    const runtimeRequire = createRequire(path.join(runtime, 'package.json'));
    const { Context } = await import(pathToFileURL(runtimeRequire.resolve('@deepseek-ai/cordis')));
    const { default: SessionStore } = await import(pathToFileURL(runtimeRequire.resolve('@deepseek-ai/dsh-session')));
    const copy = await fs.mkdtemp(path.join(runtime, 'fixture-plugin-'));
    t.after(async () => {
      if (path.dirname(copy) === runtime && path.basename(copy).startsWith('fixture-plugin-'))
        await fs.rm(copy, { recursive: true, force: true });
    });
    await fs.cp(path.dirname(pluginPath), copy, { recursive: true });
    const entrypoint = await import(pathToFileURL(path.join(copy, 'index.js')));
    const { exporter, directory } = await setup(t, { now: Date.now });
    await exporter.close();
    const ctx = new Context();
    const sessionFiber = await ctx.plugin(SessionStore);
    const pluginFiber = await ctx.plugin(entrypoint, { outputDirectory: directory });
    const s = ctx.sessions.create();
    s.append('step/start', { turn: 1, step: 1 });
    s.append(
      'assistant/message',
      {
        turn: 1,
        step: 1,
        usage: sample,
        stream: stream(sample),
        message: {
          id: 'fixture-entrypoint',
          role: 'assistant',
          content: [],
          source: { kind: 'model', provider: 'mock', model: 'fixture' },
        },
      },
      { surfaceOp: 'append' },
    );
    await pluginFiber.dispose();
    const rows = (await fs.readFile(path.join(directory, 'usage.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
    assert.equal(latest(rows).length, 1);
    assert.equal(latest(rows)[0].usage.totalTokens, 52);
    const before = rows.length;
    s.append('step/start', { turn: 2, step: 1 });
    assert.equal((await fs.readFile(path.join(directory, 'usage.jsonl'), 'utf8')).trim().split('\n').length, before);
    assert.equal(JSON.parse(await fs.readFile(path.join(directory, 'status.json'), 'utf8')).state, 'stopped');
    await sessionFiber.dispose();
  },
);

test(
  'Official dsh CLI installs, composes, boots a linked plugin and removes it in an isolated profile',
  { skip: !process.env.TUA_HARNESS_CLI_RUNTIME },
  async (t) => {
    const cli = path.join(
      path.resolve(process.env.TUA_HARNESS_CLI_RUNTIME),
      'node_modules/@deepseek-ai/dsh/lib/bin.js',
    );
    const { exporter, directory } = await setup(t, { now: Date.now });
    await exporter.close();
    const fixtureHome = path.join(directory, 'isolated-dsh-home');
    const env = { ...process.env, DSH_HOME: fixtureHome, DSH_TELEMETRY_DISABLED: '1' };
    const run = (args) => {
      const result = spawnSync(process.execPath, [cli, ...args], {
        cwd: directory,
        env,
        encoding: 'utf8',
        timeout: 30000,
        windowsHide: true,
      });
      assert.equal(result.status, 0, `CLI failed ${args[0]}: ${result.error?.code ?? result.stderr ?? ''}`);
      return result.stdout;
    };
    assert.equal(run(['--version']).trim(), '0.1.7-rc.1');
    run(['plugin', '--profile', 'usage-fixture', 'add', path.dirname(pluginPath), '--ignore-scripts']);
    const composed = run(['--profile', 'usage-fixture', '--dump-config']);
    assert.match(composed, /id: token-usage-assistant/);
    assert.match(composed, /name: dsh-token-usage-assistant/);
    // Boot only SessionStore + the shipped plugin + a synthetic event producer.
    // The ordinary add/dump above used the official default profile composition.
    const profileDir = path.join(fixtureHome, 'profiles/usage-fixture');
    const manifestFile = path.join(profileDir, 'package.json');
    const manifest = JSON.parse(await fs.readFile(manifestFile, 'utf8'));
    manifest.dsh.profile.bundles = ['dsh-token-usage-assistant'];
    await fs.writeFile(manifestFile, JSON.stringify(manifest));
    await fs.writeFile(
      path.join(profileDir, 'fixture.mjs'),
      `export const inject = ['sessions'];\nexport function apply(ctx) { ctx.effect(() => ctx.get('appReady').onReady(() => { const s = ctx.sessions.create(); s.append('step/start',{turn:1,step:1}); s.append('assistant/message',{turn:1,step:1,stream:[],usage:{inputTokens:10,outputTokens:5,cacheReadTokens:2,cacheWriteTokens:0,totalTokens:17},message:{id:'cli-fixture',role:'assistant',content:[],source:{kind:'model',provider:'mock',model:'fixture'}}},{surfaceOp:'append'}); ctx.get('appExit')(0); })); }\n`,
    );
    const yamlPath = (value) => `'${value.replace(/'/g, "''")}'`;
    await fs.writeFile(
      path.join(profileDir, 'cordis.patch.yml'),
      `- id: token-usage-assistant\n  config:\n    outputDirectory: ${yamlPath(directory)}\n- insert:\n    - id: fixture-sessions\n      name: '@deepseek-ai/dsh-session'\n    - id: fixture-producer\n      name: './fixture.mjs'\n`,
    );
    run(['--profile', 'usage-fixture']);
    const rows = (await fs.readFile(path.join(directory, 'usage.jsonl'), 'utf8'))
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(JSON.parse);
    assert.equal(latest(rows).length, 1);
    assert.equal(latest(rows)[0].status, 'completed');
    assert.equal(latest(rows)[0].usage.totalTokens, 17);
    assert.equal(JSON.parse(await fs.readFile(path.join(directory, 'status.json'), 'utf8')).state, 'stopped');
    run(['plugin', '--profile', 'usage-fixture', 'remove', 'dsh-token-usage-assistant']);
    const removed = JSON.parse(await fs.readFile(manifestFile, 'utf8'));
    assert.ok(!removed.dependencies?.['dsh-token-usage-assistant']);
    assert.ok(!removed.dsh.profile.bundles.includes('dsh-token-usage-assistant'));
  },
);
