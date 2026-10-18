import { promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { resolve, join } from 'node:path';

export const HARNESS_VERSION = '0.1.7-rc.1';
export const HARNESS_COMMIT = '46a7f68b0922371ce7144b668b90e377d8e799f4';
export const EXPORTER_VERSION = '1.4.0';
const count = value => Number.isSafeInteger(value) && value >= 0;
// eslint-disable-next-line no-control-regex -- intentionally rejects/strips control characters (input validation and privacy).
const text = (value, max = 2048) => typeof value === 'string' && value.length > 0 && value.length <= max && !/[\u0000-\u001f]/.test(value) ? value : null;
const EMPTY_USAGE = Object.freeze({ uncachedInputTokens: null, outputTokens: null, cacheReadTokens: null, cacheWriteTokens: null, reasoningTokens: null, totalTokens: null });
const OBSERVED = new Set(['step/start', 'step/end', 'turn/end', 'request/context', 'assistant/message', 'assistant/attempt', 'llm/retry', 'llm/retry-started']);
const FIXED_ERRORS = new Set(['unsupported-runtime', 'unsupported-config', 'unsupported-format', 'invalid-usage', 'missing-attempt-boundary', 'io-error', 'queue-overflow', 'source-conflict']);
const GAP_CODES = new Set([...FIXED_ERRORS, 'interrupted-writer']);
// Windows reports a file that another process is creating, deleting or holding open as EPERM / EACCES / EBUSY
// instead of EEXIST; these are transient contention, not failures (T4.7).
const BUSY = new Set(['EPERM', 'EACCES', 'EBUSY']);
const pause = ms => new Promise(done => setTimeout(done, ms));

function normalizeUsage(value) {
  if (value === undefined) return { ...EMPTY_USAGE };
  if (!value || typeof value !== 'object' || !count(value.inputTokens) || !count(value.outputTokens)) throw new Error('invalid-usage');
  const result = { ...EMPTY_USAGE, uncachedInputTokens: value.inputTokens, outputTokens: value.outputTokens };
  for (const key of ['cacheReadTokens', 'cacheWriteTokens', 'reasoningTokens', 'totalTokens']) {
    if (value[key] !== undefined) {
      if (!count(value[key])) throw new Error('invalid-usage');
      result[key] = value[key];
    }
  }
  if (result.reasoningTokens !== null && result.reasoningTokens > result.outputTokens) throw new Error('invalid-usage');
  const known = result.uncachedInputTokens + result.outputTokens + (result.cacheReadTokens ?? 0) + (result.cacheWriteTokens ?? 0);
  if (!count(known)) throw new Error('invalid-usage');
  if (result.totalTokens !== null && (result.totalTokens < known || (result.cacheReadTokens !== null && result.cacheWriteTokens !== null && result.totalTokens !== known))) throw new Error('invalid-usage');
  // Missing counters remain unknown; even zero must have been reported.
  return result;
}

/** Only inspect stream tags and usage/finish kind; never access text, arguments or failure messages. */
function streamMetadata(stream) {
  if (!Array.isArray(stream)) throw new Error('unsupported-format');
  let usage, outcome = null;
  for (const record of stream) {
    if (!record || typeof record !== 'object') throw new Error('unsupported-format');
    if (record.type === 'text-chunks' || record.type === 'reasoning-chunks' || record.type === 'tool-call-chunks') continue;
    if (record.type !== 'chunk' || !record.chunk || typeof record.chunk !== 'object') throw new Error('unsupported-format');
    if (record.chunk.type === 'usage') usage = record.chunk.usage;
    if (record.chunk.type === 'finish') {
      const kind = record.chunk.reason?.kind;
      if (kind === 'aborted') outcome = 'cancelled';
      else if (kind === 'error') outcome = 'failed';
    }
  }
  return { usage, outcome };
}

export class UsageExporter {
  constructor({ outputDirectory, runtimeVersion, now = Date.now, maxQueue = 4096, io = fs } = {}) {
    this.directory = resolve(outputDirectory);
    this.now = now;
    this.io = io;
    this.maxQueue = maxQueue;
    this.coverageStart = now();
    this.sessions = new WeakMap();
    this.pending = 0;
    this.closed = false;
    this.error = runtimeVersion === HARNESS_VERSION ? null : 'unsupported-runtime';
    this.gaps = new Set();
    this.lastWriteAt = null;
    this.writerId = randomUUID();
    this.ready = this.initialize().catch(() => { this.error = 'io-error'; });
    this.tail = this.ready;
  }

  async initialize() {
    await this.io.mkdir(this.directory, { recursive: true });
    await this.withLock(async () => {
    const file = join(this.directory, 'source.json');
    const proposed = { schema: 'token-usage-assistant.harness-source', schemaVersion: 1, sourceId: randomUUID(), tool: 'deepseek-harness', harnessVersion: HARNESS_VERSION, harnessCommit: HARNESS_COMMIT, sessionFormatVersion: 4, exporterVersion: EXPORTER_VERSION, createdAt: this.coverageStart };
    try { await this.io.writeFile(file, `${JSON.stringify(proposed)}\n`, { flag: 'wx', mode: 0o600 }); } catch (error) { if (error?.code !== 'EEXIST') throw error; }
    const marker = JSON.parse(await this.io.readFile(file, 'utf8'));
    if (marker.schema !== proposed.schema || marker.schemaVersion !== 1 || marker.harnessVersion !== HARNESS_VERSION || marker.harnessCommit !== HARNESS_COMMIT || marker.sessionFormatVersion !== 4 || marker.exporterVersion !== EXPORTER_VERSION || !text(marker.sourceId, 80)) {
      this.error = 'source-conflict';
    } else this.sourceId = marker.sourceId;
    // An empty export is a valid new source; it does not imply zero historical use.
    await this.io.appendFile(join(this.directory, 'usage.jsonl'), '', { mode: 0o600 });
    });
    await this.writeStatus();
  }

  /** Serialize whole-line appends across Harness processes without blocking event dispatch. */
  async withLock(action) {
    const file = join(this.directory, '.export.lock');
    const deadline = Date.now() + 5000;
    let handle;
    while (!handle) {
      try {
        handle = await this.io.open(file, 'wx', 0o600);
        await handle.writeFile(JSON.stringify({ pid: process.pid }));
      } catch (error) {
        if (handle) { try { await handle.close(); await this.io.unlink(file); } catch {} handle = null; }
        if (error?.code !== 'EEXIST' && !BUSY.has(error?.code)) throw error;
        try {
          const stat = await this.io.stat(file);
          if (Date.now() - stat.mtimeMs > 1000) {
            const lock = JSON.parse(await this.io.readFile(file, 'utf8'));
            if (count(lock.pid) && lock.pid > 0) {
              try { process.kill(lock.pid, 0); } catch (probe) { if (probe?.code === 'ESRCH') await this.io.unlink(file); }
            }
          }
        } catch {}
        // eslint-disable-next-line preserve-caught-error -- deliberately generic; the raw cause is not attached (privacy rule).
        if (Date.now() >= deadline) throw new Error('io-error');
        await pause(10);
      }
    }
    try { return await action(); }
    finally { await handle.close(); await this.io.unlink(file); }
  }

  /** rename() over a file another process has open fails on Windows for a moment; retry for about a second. */
  async replace(from, to) {
    for (let attempt = 0; ; attempt++) {
      try { return await this.io.rename(from, to); } catch (error) {
        if (!BUSY.has(error?.code) || attempt >= 24) throw error;
        await pause(Math.min(10 + attempt * 5, 50));
      }
    }
  }

  async writeStatus() {
    await this.withLock(async () => {
      // Preserve known collection gaps across writers and restarts. A healthy
      // process must never erase a different process's lost-usage warning.
      const gaps = new Set(this.gaps), writers = [];
      let prior;
      try { prior = JSON.parse(await this.io.readFile(join(this.directory, 'status.json'), 'utf8')); } catch {}
      if (prior?.schema === 'token-usage-assistant.harness-status' && prior.sourceId === this.sourceId) {
        for (const gap of prior.gaps ?? []) if (GAP_CODES.has(gap)) gaps.add(gap);
        for (const writer of Array.isArray(prior.writers) ? prior.writers : []) {
          if (writer.id === this.writerId || !text(writer.id, 80) || !count(writer.pid) || writer.pid < 1 || !count(writer.coverageStart)) continue;
          if (writer.code && FIXED_ERRORS.has(writer.code)) gaps.add(writer.code);
          let alive = true;
          try { process.kill(writer.pid, 0); } catch (error) { if (error?.code === 'ESRCH') alive = false; }
          if (!alive) { gaps.add('interrupted-writer'); continue; }
          // Copy fields explicitly: this shared metadata file never imports arbitrary data.
          writers.push({ id: writer.id, pid: writer.pid, state: writer.state === 'error' ? 'error' : 'ready', code: FIXED_ERRORS.has(writer.code) ? writer.code : null, coverageStart: writer.coverageStart, lastWriteAt: count(writer.lastWriteAt) ? writer.lastWriteAt : null });
        }
      }
      if (this.error) gaps.add(this.error);
      if (!this.closed) writers.push({ id: this.writerId, pid: process.pid, state: this.error ? 'error' : 'ready', code: this.error, coverageStart: this.coverageStart, lastWriteAt: this.lastWriteAt });
      // The status reader admits at most 8 KiB; never produce an unbounded registry.
      if (writers.length > 24) throw new Error('io-error');
      const code = writers.find(writer => writer.code)?.code ?? this.error;
      const state = code ? 'error' : writers.length ? 'ready' : 'stopped';
      const status = { schema: 'token-usage-assistant.harness-status', schemaVersion: 1, sourceId: this.sourceId ?? null, state, code: code ?? null, coverageStart: Math.min(this.coverageStart, ...writers.map(writer => writer.coverageStart)), lastWriteAt: Math.max(0, this.lastWriteAt ?? 0, ...writers.map(writer => writer.lastWriteAt ?? 0)) || null, gaps: [...gaps], writers };
      // Atomic replacement also prevents readers from observing truncated JSON.
      const temporary = join(this.directory, `.status-${process.pid}-${randomUUID()}.tmp`);
      try {
        await this.io.writeFile(temporary, `${JSON.stringify(status)}\n`, { flag: 'wx', mode: 0o600 });
        await this.replace(temporary, join(this.directory, 'status.json'));
      } finally { try { await this.io.unlink(temporary); } catch {} }
    });
  }

  disable(code) {
    this.error = FIXED_ERRORS.has(code) ? code : 'unsupported-format';
    this.tail = this.tail.then(() => this.writeStatus()).catch(() => {});
  }

  gap(code) {
    this.gaps.add(code);
    this.tail = this.tail.then(() => this.writeStatus()).catch(() => { this.error = 'io-error'; });
  }

  enqueue(record) {
    if (this.pending >= this.maxQueue) { this.disable('queue-overflow'); return; }
    this.pending++;
    this.tail = this.tail.then(async () => {
      if (this.error || !this.sourceId) return;
      const line = JSON.stringify({ ...record, sourceId: this.sourceId });
      if (Buffer.byteLength(line, 'utf8') > 32768) { this.error = 'unsupported-format'; await this.writeStatus(); return; }
      await this.withLock(() => this.io.appendFile(join(this.directory, 'usage.jsonl'), `${line}\n`, { mode: 0o600 }));
      this.lastWriteAt = this.now();
      await this.writeStatus();
    }).catch(async () => { this.error = 'io-error'; try { await this.writeStatus(); } catch {} }).finally(() => { this.pending--; });
  }

  observe(session, event) {
    if (this.error || this.closed) return;
    try { this.observeChecked(session, event); } catch (error) { this.disable(error?.message); }
  }

  observeChecked(session, event) {
    if (!event || !OBSERVED.has(event.type)) return;
    if (!session || session.header?.version !== 4 || !text(session.id) || !count(session.inheritedEventCount) || !count(event.seq) || !count(event.time) || !event.data || typeof event.data !== 'object') throw new Error('unsupported-format');
    if (event.seq < session.inheritedEventCount || event.time < this.coverageStart) return;
    let state = this.sessions.get(session);
    if (!state) {
      state = { lastSeq: -1, route: null, attempts: new Map() };
      this.sessions.set(session, state);
    }
    if (event.seq <= state.lastSeq) return;
    state.lastSeq = event.seq;
    const data = event.data;
    if (event.type === 'request/context') {
      if (!text(data.provider) || !text(data.model)) throw new Error('unsupported-format');
      state.route = { provider: data.provider, model: data.model };
      return;
    }
    if (!count(data.turn)) throw new Error('unsupported-format');
    if (event.type === 'turn/end') {
      const kind = data.reason?.kind;
      if (!['completed', 'aborted', 'blocked', 'error', 'max-tokens', 'interrupted', 'forked'].includes(kind)) throw new Error('unsupported-format');
      for (const [key, attempt] of state.attempts) {
        if (attempt.turn !== data.turn) continue;
        if (attempt.record.status !== 'completed') {
          attempt.record.status = kind === 'aborted' ? 'cancelled' : kind === 'error' ? 'failed' : 'unknown';
          this.emit(attempt, event);
        }
        state.attempts.delete(key);
      }
      return;
    }
    if (!count(data.step)) throw new Error('unsupported-format');
    const key = `${data.turn}:${data.step}`;
    if (event.type === 'step/start' || event.type === 'llm/retry-started') {
      const previous = state.attempts.get(key);
      if (previous && event.type === 'step/start') throw new Error('unsupported-format');
      if (previous && previous.record.status !== 'failed') { previous.record.status = 'failed'; this.emit(previous, event); }
      const requestId = `${session.id}:${data.turn}:${data.step}`;
      const record = { schema: 'token-usage-assistant.harness', schemaVersion: 1, sourceId: null, tool: 'deepseek-harness', harnessVersion: HARNESS_VERSION, exporterVersion: EXPORTER_VERSION, sessionId: session.id, requestId, attemptId: `${requestId}:${event.seq}`, revision: event.seq, timestamp: event.time, updatedAt: event.time, provider: state.route?.provider ?? null, model: state.route?.model ?? null, project: text(session.header.cwd), status: 'pending', usage: { ...EMPTY_USAGE }, usageReported: false, coverageStart: this.coverageStart, provenance: 'harness-plugin/provider-reported', accountId: null };
      const attempt = { turn: data.turn, record };
      state.attempts.set(key, attempt);
      this.emit(attempt, event);
      return;
    }
    const attempt = state.attempts.get(key);
    if (!attempt) { if (event.type.startsWith('assistant/')) this.gap('missing-attempt-boundary'); return; }
    if (event.type === 'assistant/message' || event.type === 'assistant/attempt') {
      const metadata = streamMetadata(data.stream);
      const usage = event.type === 'assistant/message' && data.usage !== undefined ? data.usage : metadata.usage;
      if (usage !== undefined) {
        attempt.record.usage = normalizeUsage(usage);
        attempt.record.usageReported = true;
      }
      if (event.type === 'assistant/message') {
        // Access the two routing strings only, never message.content or replayState.
        const route = data.message?.source;
        attempt.record.provider = text(route?.provider) ?? state.route?.provider ?? null;
        attempt.record.model = text(route?.model) ?? state.route?.model ?? null;
        attempt.record.status = data.interrupted === true ? 'cancelled' : 'completed';
      } else {
        attempt.record.provider = state.route?.provider ?? null;
        attempt.record.model = state.route?.model ?? null;
        attempt.record.status = metadata.outcome ?? 'unknown';
      }
      this.emit(attempt, event);
    } else if (event.type === 'llm/retry') {
      attempt.record.status = 'failed';
      this.emit(attempt, event);
    } else if (event.type === 'step/end' && attempt.record.status === 'pending') {
      attempt.record.status = 'unknown';
      this.emit(attempt, event);
    }
  }

  emit(attempt, event) {
    attempt.record.revision = event.seq;
    attempt.record.updatedAt = event.time;
    this.enqueue({ ...attempt.record, usage: { ...attempt.record.usage } });
  }

  async flush() { await this.tail; try { await this.writeStatus(); } catch { this.error = 'io-error'; } }
  async close() { this.closed = true; await this.flush(); }
}
