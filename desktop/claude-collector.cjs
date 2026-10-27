const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { atomicWrite, readJson } = require('./store.cjs');
const { log } = require('./logger.cjs');
const { normalizeSubscriptionRecord } = require('./tool-analytics.cjs');
const { normalizeClaude } = require('./subscriptions.cjs');
const { launcherName, shellQuote } = require('./platform.cjs');
const {
  claudeUsageViolation,
  missingOptional,
  SOURCE_OPTIONAL,
  partialNote,
  fieldNames,
  usageFieldNames,
} = require('./upstream-contracts.cjs');
const clean = (v, max = 2048) =>
  // eslint-disable-next-line no-control-regex -- intentionally rejects/strips control characters (input validation and privacy).
  typeof v === 'string' && v.length && v.length <= max && !/[\x00-\x1f]/.test(v) ? v : null;
const count = (v) => {
  const n = typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : v;
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
};
// Locally verified Claude Code versions (2.1.251+ within 2.1.x). OTLP events from other versions are accepted only
// when their structure matches (T5.1) and are reported as unverified. Since T8.4 the status-line quota follows the
// same rule: an unverified version must report at least one known window with valid fields, or it is rejected.
// T9.13 (D15): informational since then — the upstream check compares new releases against it; reading follows the
// structure contract for every version.
const supported = (v) => typeof v === 'string' && /^2\.1\.\d+$/.test(v) && Number(v.split('.')[2]) >= 251;
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const ATTRIBUTES = new Set([
  'event.name',
  'event.timestamp',
  'event.sequence',
  'session.id',
  'app.version',
  'service.version',
  'request_id',
  'client_request_id',
  'model',
  'input_tokens',
  'output_tokens',
  'cache_read_tokens',
  'cache_creation_tokens',
]);
function attrs(list) {
  const out = Object.create(null);
  for (const a of list || []) {
    if (ATTRIBUTES.has(a?.key))
      out[a.key] = a.value?.stringValue ?? a.value?.intValue ?? a.value?.doubleValue ?? a.value?.boolValue;
  }
  return out;
}
function parseOtel(body, sourceId, sessions = {}, now = Date.now()) {
  if (!Array.isArray(body?.resourceLogs)) throw new Error('otlp schema');
  const rows = [],
    fieldSet = new Set();
  let unsupported = 0;
  for (const resource of body.resourceLogs) {
    const r = attrs(resource.resource?.attributes);
    for (const scope of resource.scopeLogs || [])
      for (const log of scope.logRecords || []) {
        const a = { ...r, ...attrs(log.attributes) },
          name = a['event.name'];
        if (!['api_request', 'api_error', 'claude_code.api_request', 'claude_code.api_error'].includes(name)) continue;
        // T9.14: usage-counter attribute names (never values) of request events, as the field-name fingerprint.
        if (!name.endsWith('api_error')) for (const item of log.attributes || []) fieldSet.add(item?.key);
        const session = clean(a['session.id'], 200),
          meta = sessions[session];
        // The version is not checked (D15): the structure contract below decides.
        const timestamp = Date.parse(a['event.timestamp']),
          requestId = clean(a.request_id, 300) || clean(a.client_request_id, 300);
        if (!session || !Number.isFinite(timestamp) || timestamp > now + 60000 || timestamp <= 0) {
          unsupported++;
          continue;
        }
        // Use upstream request IDs. Timestamp + process event sequence is a fallback, never sequence alone.
        const identity =
          requestId ||
          crypto
            .createHash('sha256')
            .update(JSON.stringify([session, timestamp, a['event.sequence'], name, a.model]))
            .digest('hex');
        const error = name.endsWith('api_error');
        const fresh = count(a.input_tokens),
          read = count(a.cache_read_tokens),
          write = count(a.cache_creation_tokens),
          output = count(a.output_tokens),
          input = [fresh, read, write].every((v) => v !== null) ? fresh + read + write : null;
        // T9.13: a request must report input and output (core); cache counters are optional and shown as "—".
        if (!error && claudeUsageViolation({ input: fresh, output, read, write })) {
          unsupported++;
          continue;
        }
        const row = normalizeSubscriptionRecord(
          {
            tool: 'claude-code',
            requestId: identity,
            attemptId: session + ':' + identity,
            sessionId: session,
            timestamp,
            model: clean(a.model, 200),
            project: meta?.project,
            status: error ? 'failed' : 'completed',
            usage: { input, read, write, output, total: input !== null && output !== null ? input + output : null },
          },
          sourceId,
        );
        rows.push(row);
      }
  }
  return { rows, unsupported, fields: usageFieldNames(fieldSet) };
}
class ClaudeCollector {
  constructor(home) {
    this.home = home;
    this.server = null;
    this.issue = '';
    // T8.5: set when the saved port could not be used and another one was taken; cleared by the first usage event
    // on the new port. Quota recovers by itself (the status-line helper reads collector.json on every run).
    this.portChange = null;
    this.sessions = Object.create(null);
    this.config = null;
  }
  prepare() {
    fs.mkdirSync(this.home, { recursive: true, mode: 0o700 });
    const file = path.join(this.home, 'collector.json');
    let cfg = readJson(file);
    if (
      fs.existsSync(file) &&
      (!cfg ||
        cfg.schemaVersion !== 1 ||
        !Number.isInteger(cfg.port) ||
        cfg.port < 1024 ||
        cfg.port > 65535 ||
        !/^[a-f0-9]{64}$/.test(cfg.token) ||
        !clean(cfg.sourceId, 100))
    )
      throw new Error('Collector configuration invalid; original retained');
    if (!cfg) {
      cfg = {
        schemaVersion: 1,
        sourceId: crypto.randomUUID(),
        token: crypto.randomBytes(32).toString('hex'),
        port: 49152 + crypto.randomInt(16000),
      };
      atomicWrite(file, cfg);
    }
    this.config = cfg;
    const mf = path.join(this.home, 'source.json');
    if (!fs.existsSync(mf))
      atomicWrite(mf, {
        schema: 'token-usage-assistant.claude-source',
        schemaVersion: 1,
        sourceId: cfg.sourceId,
        createdAt: Date.now(),
      });
    const usage = path.join(this.home, 'usage.jsonl');
    if (!fs.existsSync(usage)) fs.writeFileSync(usage, '', { mode: 0o600 });
    return cfg;
  }
  async start() {
    if (this.server) return;
    const cfg = this.config || this.prepare();
    const server = http.createServer((req, res) => {
      const fail = (code) => {
        res.writeHead(code);
        res.end();
      };
      if (
        req.method !== 'POST' ||
        req.headers.origin ||
        !['127.0.0.1:' + cfg.port, 'localhost:' + cfg.port].includes(req.headers.host) ||
        req.headers['x-tua-token'] !== cfg.token
      )
        return fail(403);
      if (
        !['/v1/logs', '/quota'].includes(req.url) ||
        !/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')
      )
        return fail(415);
      let bytes = 0,
        chunks = [];
      req.on('data', (chunk) => {
        bytes += chunk.length;
        if (bytes > 4_000_000) {
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });
      req.on('error', () => {});
      req.on('end', () => {
        try {
          const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          chunks = [];
          if (req.url === '/quota') this.receiveQuota(input);
          else {
            this.portChange = null;
            const parsed = parseOtel(input, cfg.sourceId, this.sessions);
            if (parsed.rows.length)
              fs.appendFileSync(
                path.join(this.home, 'usage.jsonl'),
                parsed.rows
                  .map((row) =>
                    JSON.stringify({
                      schema: 'token-usage-assistant.claude-record',
                      schemaVersion: 1,
                      sourceId: cfg.sourceId,
                      record: row,
                    }),
                  )
                  .join('\n') + '\n',
              );
            this.health(parsed.unsupported ? 'unsupported-events' : 'ready', parsed.fields);
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end('{}');
        } catch {
          this.health('invalid-events');
          fail(400);
        }
      });
    });
    server.requestTimeout = 5000;
    server.headersTimeout = 5000;
    server.maxConnections = 8;
    try {
      await this.listen(server, cfg);
    } catch (e) {
      this.health('stopped');
      throw e;
    }
    server.on('error', () => {
      this.issue = '本地采集端口暂不可用。';
    });
    this.server = server;
    this.health('ready');
  }
  health(state, fields = null) {
    try {
      const file = path.join(this.home, 'status.json'),
        prior = readJson(file),
        // T9.14: the latest request-event attribute names; kept until a batch with request events replaces them.
        names = fields?.length ? fields : fieldNames(Array.isArray(prior?.fields) ? prior.fields : []),
        gaps = Array.isArray(prior?.gaps)
          ? prior.gaps.filter((x) => ['unsupported-events', 'invalid-events'].includes(x))
          : [];
      if (['unsupported-events', 'invalid-events'].includes(state) && !gaps.includes(state)) gaps.push(state);
      atomicWrite(file, {
        schemaVersion: 1,
        state,
        gaps,
        at: Date.now(),
        ...(names.length ? { fields: names } : {}),
      });
    } catch {
      log.warn('claude-collector', 'status-write-failed');
    }
  }
  // Listen on the saved port. If the system refuses it (EACCES: e.g. a Windows reserved port range) or it is taken
  // (EADDRINUSE), try a few other random ports, then let the system choose; the new port is saved (T8.5).
  async listen(server, cfg, randomPort = () => 49152 + crypto.randomInt(16000)) {
    const attempt = (port) =>
      new Promise((resolve, reject) => {
        const onError = (e) => {
          server.removeListener('listening', onListening);
          reject(e);
        };
        const onListening = () => {
          server.removeListener('error', onError);
          resolve(server.address().port);
        };
        server.once('error', onError);
        server.once('listening', onListening);
        server.listen(port, '127.0.0.1');
      });
    const from = cfg.port;
    let lastError;
    for (const port of [from, randomPort(), randomPort(), randomPort(), 0]) {
      try {
        const bound = await attempt(port);
        if (bound !== from) {
          cfg.port = bound;
          atomicWrite(path.join(this.home, 'collector.json'), cfg);
          this.portChange = { from, to: bound };
          log.info('claude-collector', 'port-changed', { errno: lastError?.code });
        }
        return bound;
      } catch (e) {
        lastError = e;
        if (!['EACCES', 'EADDRINUSE'].includes(e?.code)) throw e;
      }
    }
    throw lastError;
  }
  receiveQuota(input) {
    if (typeof input?.version !== 'string' || !VERSION.test(input.version) || !clean(input.sessionId, 200))
      throw new Error('version');
    // T9.13 (D15), for every version: no windows (absent or empty) means the session reports no plan quota and clears
    // the stored windows, as before; windows that are present but none of them known are incompatible (renamed) and
    // leave the stored quota untouched. Field shapes are checked by normalizeClaude below.
    const w = input.windows;
    if (w != null && (typeof w !== 'object' || Array.isArray(w))) throw new Error('schema');
    const present = w ? Object.keys(w).filter((k) => w[k] != null) : [];
    if (present.length && !present.some((k) => k === 'five_hour' || k === 'seven_day')) throw new Error('schema');
    const project = clean(input.project);
    this.sessions[input.sessionId] = { project, version: input.version };
    // Retain only a bounded metadata map for current sessions.
    const keys = Object.keys(this.sessions);
    if (keys.length > 500) delete this.sessions[keys[0]];
    atomicWrite(path.join(this.home, 'sessions.json'), this.sessions);
    const raw = { schema: 'token-usage-assistant.claude-quota', schemaVersion: 1, observedAt: Date.now(), windows: {} };
    for (const k of ['five_hour', 'seven_day']) {
      const w = input.windows?.[k];
      if (w != null) raw.windows[k] = { used_percentage: w.used_percentage, resets_at: w.resets_at };
    }
    normalizeClaude(raw);
    const file = path.join(this.home, 'quota.json'),
      old = readJson(file);
    // Status-line repaint is not a fresh platform query. Unchanged values keep their original timestamp.
    if (JSON.stringify(old?.windows) === JSON.stringify(raw.windows)) raw.observedAt = old.observedAt;
    atomicWrite(file, raw);
    this.health('ready');
  }
  close() {
    this.server?.close();
    this.server = null;
    this.health('stopped');
  }
  generateLauncher(platform = process.platform, runtime = process.execPath) {
    const cfg = this.config || this.prepare(),
      helper = path.join(this.home, platform === 'darwin' ? 'StatusLine.cjs' : 'StatusLine.ps1');
    let command;
    if (platform === 'darwin') {
      for (const [from, to] of [
        ['claude-statusline.cjs', 'StatusLine.cjs'],
        ['claude-launcher.cjs', 'Launch-Claude.cjs'],
        ['metadata-json.cjs', 'metadata-json.cjs'],
      ]) {
        const target = path.join(this.home, to);
        fs.copyFileSync(path.join(__dirname, from), target);
        fs.chmodSync(target, 0o600);
      }
      command = '/usr/bin/env ELECTRON_RUN_AS_NODE=1 ' + shellQuote(runtime) + ' ' + shellQuote(helper);
      const launch =
        '#!/bin/sh\n# Run this file from your project directory in Terminal.\nexec /usr/bin/env ELECTRON_RUN_AS_NODE=1 ' +
        shellQuote(runtime) +
        ' ' +
        shellQuote(path.join(this.home, 'Launch-Claude.cjs')) +
        ' "$@"\n';
      const file = path.join(this.home, launcherName(platform));
      fs.writeFileSync(file, launch, { mode: 0o700 });
      fs.chmodSync(file, 0o700);
    } else {
      fs.copyFileSync(path.join(__dirname, 'claude-statusline.ps1'), helper);
      fs.copyFileSync(path.join(__dirname, 'claude-launcher.ps1'), path.join(this.home, launcherName(platform)));
      command = 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "' + helper + '"';
    }
    const settings = {
      env: {
        CLAUDE_CODE_ENABLE_TELEMETRY: '1',
        OTEL_LOGS_EXPORTER: 'otlp',
        OTEL_METRICS_EXPORTER: 'none',
        OTEL_TRACES_EXPORTER: 'none',
        OTEL_EXPORTER_OTLP_LOGS_PROTOCOL: 'http/json',
        OTEL_EXPORTER_OTLP_LOGS_ENDPOINT: `http://127.0.0.1:${cfg.port}/v1/logs`,
        OTEL_EXPORTER_OTLP_LOGS_HEADERS: 'x-tua-token=' + cfg.token,
        OTEL_METRICS_INCLUDE_VERSION: 'true',
        OTEL_LOG_USER_PROMPTS: '0',
        OTEL_LOG_ASSISTANT_RESPONSES: '0',
        OTEL_LOG_TOOL_DETAILS: '0',
        OTEL_LOG_TOOL_CONTENT: '0',
        OTEL_LOG_RAW_API_BODIES: '0',
      },
      statusLine: { type: 'command', command },
    };
    atomicWrite(path.join(this.home, 'claude-settings.json'), settings);
    fs.writeFileSync(
      path.join(this.home, '使用说明.txt'),
      '在项目目录打开终端，运行本文件夹中的 ' +
        launcherName(platform) +
        '。需要 Claude Code 2.1.251+（2.1.x），先用官方 /login 登录。助手必须保持运行。\r\n配置仅用于此启动会话，不修改已有 Claude settings.json；此会话使用助手状态栏。原自定义状态栏仍保留在原配置中。\r\n仅本机采集启用后的 Token、模型、项目、会话和订阅窗口。不补历史、不读取会话正文。关闭助手时可能丢失用量事件，统计不保证完整。\r\n已有自定义遥测的用户请勿同时用此启动配置，避免改变该会话的遥测出口。\r\n',
    );
    return this.home;
  }
}
function readClaudeManifest(file) {
  const m = readJson(path.join(path.dirname(file), 'source.json'));
  if (m?.schema !== 'token-usage-assistant.claude-source' || m.schemaVersion !== 1 || !clean(m.sourceId, 100))
    throw new Error('unsupported');
  return m;
}
function scanClaude(db, source, range) {
  if (!fs.existsSync(source.file)) return { rows: [], status: 'missing', message: 'Claude 用量导出文件不存在。' };
  const m = readClaudeManifest(source.file);
  if (source.installationId && source.installationId !== m.sourceId) throw new Error('identity');
  const { projectJSON } = require('./metadata-json.cjs');
  const { lines } = require('./codex-reader.cjs');
  const map = new Map(),
    sessions = readJson(path.join(path.dirname(source.file), 'sessions.json'), {});
  let truncated = false;
  for (const line of lines(source.file)) {
    if (!line.trim()) continue;
    const wire = projectJSON(line, {
      schema: true,
      schemaVersion: true,
      sourceId: true,
      record: {
        tool: true,
        requestId: true,
        attemptId: true,
        sessionId: true,
        at: true,
        updatedAt: true,
        revision: true,
        model: true,
        project: true,
        status: true,
        input: true,
        output: true,
        read: true,
        write: true,
        total: true,
        reasoning: true,
      },
    });
    if (
      wire.schema !== 'token-usage-assistant.claude-record' ||
      wire.schemaVersion !== 1 ||
      wire.sourceId !== m.sourceId
    )
      throw new Error('schema');
    const r = wire.record;
    const record = normalizeSubscriptionRecord(
      {
        ...r,
        project: r.project === '未关联项目' ? sessions[r.sessionId]?.project : r.project,
        timestamp: r.at,
        usage: r,
      },
      source.id,
    );
    if (record.at < range.start - (range.end - range.start) || record.at > range.end) continue;
    const old = map.get(record.attemptId);
    if (!old || record.usageReported || !old.usageReported) map.set(record.attemptId, record);
    if (map.size > 100000) {
      truncated = true;
      break;
    }
  }
  const health = readJson(path.join(path.dirname(source.file), 'status.json')),
    rows = [...map.values()].slice(0, 100000),
    missing = missingOptional(rows, SOURCE_OPTIONAL.claude);
  return {
    rows,
    status: health?.state === 'ready' && !health.gaps?.length ? 'ready' : 'stale',
    truncated,
    ...(missing.length ? { contract: 'partial', missing } : {}),
    ...(Array.isArray(health?.fields) && health.fields.length ? { fields: fieldNames(health.fields) } : {}),
    message:
      (health?.gaps?.length ? '存在格式不兼容的事件，已排除，采集有缺口。' : '') +
      partialNote(missing) +
      '只覆盖助手运行期间收到的用量事件',
    messageDetail: '需本机组件已启用。未报告的中间重试、离线及网页聊天不在覆盖范围内。',
  };
}
module.exports = { ClaudeCollector, parseOtel, supported, scanClaude, readClaudeManifest };
