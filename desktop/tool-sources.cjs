const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');
const { Worker } = require('node:worker_threads');
const { atomicWrite, readJson } = require('./store.cjs');
const { log } = require('./logger.cjs');
const { rangeFor } = require('./analytics-core.cjs');
const { pathKey } = require('./platform.cjs');
// Kinds, default labels, inspection and directory/file choice come from desktop/tool-kinds/ (T5.3b).
const { TOOL_KINDS, toolKind } = require('./tool-kinds/index.cjs');
const KINDS = new Set(TOOL_KINDS.map((k) => k.kind));
const isDirectory = (kind) => toolKind(kind)?.picker.type === 'directory';
function publicError(message) {
  return Object.assign(new Error(message), { publicMessage: message });
}
function canonical(file, directory = false) {
  if (typeof file !== 'string' || file.length > 32000 || !path.isAbsolute(file))
    throw publicError('请选择有效的本机用量文件。');
  const resolved = fs.realpathSync(file),
    stat = fs.statSync(resolved);
  if (directory ? !stat.isDirectory() : !stat.isFile())
    throw publicError(directory ? '请选择 Codex 配置目录。' : '请选择用量文件。');
  return { file: resolved, identity: stat.ino ? `${stat.dev}:${stat.ino}` : pathKey(resolved) };
}
class ToolSources extends EventEmitter {
  constructor({ store, legacyFile, now = Date.now, timeoutMs = 15000 }) {
    super();
    this.store = store;
    this.now = now;
    this.timeoutMs = timeoutMs;
    this.entries = [];
    this.revision = 0;
    this.runtime = new Map();
    this.active = null;
    this.issue = '';
    this.closed = false;
    this.runToken = 0;
    this.pendingId = null;
    this.configFile = store.file('tool-sources.json');
    this.indexFile = store.file('tool-usage.sqlite');
    if (fs.existsSync(this.configFile)) {
      const cfg = readJson(this.configFile);
      if (
        cfg?.schemaVersion !== 1 ||
        !Array.isArray(cfg.sources) ||
        cfg.sources.length > 20 ||
        cfg.sources.some(
          (s) =>
            !s ||
            typeof s.id !== 'string' ||
            !/^(legacy-zcode|[0-9a-f-]{36})$/.test(s.id) ||
            !KINDS.has(s.kind) ||
            typeof s.file !== 'string' ||
            typeof s.label !== 'string' ||
            typeof s.enabled !== 'boolean',
        ) ||
        new Set(cfg.sources.map((s) => s.id)).size !== cfg.sources.length
      ) {
        this.issue = '工具数据源配置无法读取，原文件已保留。恢复配置后重新启动。';
        return;
      }
      this.entries = cfg.sources.map(({ id, kind, label, file, enabled, installationId, identity, createdAt }) => ({
        id,
        kind,
        label,
        file,
        enabled,
        installationId: installationId || null,
        identity: identity || null,
        createdAt,
      }));
    } else {
      // Retain the 1.3.0 source file unchanged so rollback can recover it.
      if (legacyFile) {
        let identity = null;
        try {
          identity = canonical(legacyFile).identity;
        } catch {
          // Probe: the legacy file may be missing; the source is kept without an identity, as before.
        }
        this.entries = [
          {
            id: 'legacy-zcode',
            kind: 'zcode',
            label: 'Zcode',
            file: legacyFile,
            enabled: true,
            installationId: null,
            identity,
            createdAt: now(),
          },
        ];
      }
      this.persist();
    }
    const previous = readJson(store.file('tool-source-status.json'), {});
    for (const source of this.entries) {
      const saved = previous[source.id];
      if (saved && Number.isFinite(saved.lastSuccessAt))
        this.runtime.set(source.id, {
          status: 'idle',
          lastSuccessAt: saved.lastSuccessAt,
          observedStartAt: Number.isFinite(saved.observedStartAt) ? saved.observedStartAt : null,
          observedEndAt: Number.isFinite(saved.observedEndAt) ? saved.observedEndAt : null,
        });
    }
  }
  list() {
    return this.entries.map((s) => ({
      ...s,
      ...this.runtime.get(s.id),
      status: s.enabled ? this.runtime.get(s.id)?.status || 'idle' : 'disabled',
      lastSuccessAt: this.runtime.get(s.id)?.lastSuccessAt || null,
    }));
  }
  persist() {
    atomicWrite(this.configFile, { schemaVersion: 1, sources: this.entries });
  }
  ensureWritable() {
    if (this.issue) throw publicError(this.issue);
  }
  changed() {
    this.revision++;
    this.cancel();
    this.emit('change');
  }
  require(id) {
    const s = this.entries.find((s) => s.id === id);
    if (!s) throw publicError('工具数据源不存在。');
    return s;
  }
  inspect(kind, file, exceptId = null) {
    if (!KINDS.has(kind)) throw publicError('暂不支持此工具。');
    let item;
    try {
      item = canonical(file, isDirectory(kind));
    } catch (e) {
      throw e.publicMessage ? e : publicError('用量文件无法打开，请重新选择。');
    }
    const { installationId } = toolKind(kind).inspect(item);
    for (const s of this.entries) {
      if (s.id === exceptId) continue;
      let sameFile = pathKey(s.file) === pathKey(item.file) || s.identity === item.identity;
      try {
        sameFile ||= canonical(s.file, isDirectory(s.kind)).identity === item.identity;
      } catch {
        // Probe: an existing source file may be gone; it then simply cannot be the same file.
      }
      if (sameFile || (installationId && s.installationId === installationId))
        throw publicError('该工具来源已添加；副本也不需要重复添加。');
    }
    return { ...item, installationId };
  }
  add({ kind, file, label }) {
    this.ensureWritable();
    if (this.entries.length >= 20) throw publicError('最多添加 20 个工具数据源。');
    const item = this.inspect(kind, file);
    const value = {
      id: crypto.randomUUID(),
      kind,
      label: this.label(label, kind),
      ...item,
      enabled: true,
      createdAt: this.now(),
    };
    this.entries.push(value);
    try {
      this.persist();
    } catch (e) {
      this.entries.pop();
      throw e;
    }
    this.changed();
    return value;
  }
  label(value, kind) {
    if (value === undefined || value === '') return toolKind(kind)?.defaultLabel;
    if (typeof value !== 'string' || value.trim().length < 1 || value.length > 120)
      throw publicError('来源名称应为 1–120 个字符。');
    return value.trim();
  }
  update(id, patch) {
    this.ensureWritable();
    const source = this.require(id);
    if (
      !patch ||
      Object.keys(patch).some((k) => !['enabled', 'label'].includes(k)) ||
      ('enabled' in patch && typeof patch.enabled !== 'boolean')
    )
      throw publicError('数据源设置无效。');
    const previous = { ...source };
    if ('label' in patch) source.label = this.label(patch.label, source.kind);
    if ('enabled' in patch) source.enabled = patch.enabled;
    try {
      this.persist();
    } catch (e) {
      Object.assign(source, previous);
      throw e;
    }
    this.changed();
    return source;
  }
  relocate(id, file) {
    this.ensureWritable();
    const source = this.require(id),
      item = this.inspect(source.kind, file, id);
    if (source.installationId && item.installationId !== source.installationId)
      throw publicError('所选文件来自另一套 Harness 安装，请添加为新来源。');
    const previous = { ...source };
    Object.assign(source, item);
    try {
      this.persist();
    } catch (e) {
      Object.assign(source, previous);
      throw e;
    }
    this.runtime.delete(id);
    this.changed();
    return source;
  }
  async remove(id) {
    this.ensureWritable();
    this.require(id);
    await this.cancel();
    const previous = this.entries;
    this.entries = this.entries.filter((s) => s.id !== id);
    try {
      this.persist();
    } catch (e) {
      this.entries = previous;
      throw e;
    }
    this.runtime.delete(id);
    this.revision++;
    this.emit('change');
    // The index is assistant-owned. Cleanup runs off the UI thread and is idempotent.
    await this.run({ operation: 'remove', sourceId: id }, 'remove-' + id);
    return true;
  }
  async stop(active) {
    if (!active) return;
    active.finish({ source: 'tools', status: 'cancelled', summary: null, message: '分析已取消。' });
    await active.worker.terminate();
  }
  async cancel(requestId) {
    if (requestId && this.active?.requestId !== requestId && this.pendingId !== requestId) return false;
    this.runToken++;
    this.pendingId = null;
    await this.stop(this.active);
    return true;
  }
  async run(data, requestId) {
    const token = ++this.runToken;
    this.pendingId = requestId;
    await this.stop(this.active);
    if (this.closed || token !== this.runToken) return { source: 'tools', status: 'cancelled', summary: null };
    this.pendingId = null;
    return new Promise((resolve) => {
      let done = false;
      const worker = new Worker(path.join(__dirname, 'tool-worker.cjs'), {
        workerData: { ...data, indexFile: this.indexFile },
      });
      const started = Date.now();
      const active = {
        worker,
        requestId,
        finish: (result) => {
          if (done) return;
          done = true;
          // Per-source timings travel in an internal field and are removed before the result is used.
          const timings = Array.isArray(result?.timings) ? result.timings : [];
          if (result && 'timings' in result) delete result.timings;
          for (const item of timings)
            log.info('tool-sources', 'source', {
              kind: item.kind,
              status: item.status,
              count: item.count,
              durationMs: item.durationMs,
            });
          log[['ready', 'stale', 'cancelled'].includes(result?.status) ? 'info' : 'warn']('tool-sources', 'run', {
            stage: data.operation,
            status: result?.status,
            durationMs: Date.now() - started,
          });
          clearTimeout(timer);
          if (this.active === active) this.active = null;
          resolve(result);
        },
      };
      const timer = setTimeout(() => {
        active.finish({
          source: 'tools',
          status: 'timeout',
          summary: null,
          message: '分析超过 15 秒，已停止；可缩小范围或重新同步。',
        });
        worker.terminate();
      }, this.timeoutMs);
      this.active = active;
      worker.once('message', active.finish);
      worker.once('error', () =>
        active.finish({
          source: 'tools',
          status: 'error',
          summary: null,
          message: '本机分析未完成，原始工具记录不受影响。',
        }),
      );
      worker.once('exit', () =>
        active.finish({ source: 'tools', status: 'error', summary: null, message: '分析进程已退出，请重试。' }),
      );
    });
  }
  async query(query = {}, prices = {}, internal = {}) {
    const associationContext = this.associations?.context(),
      groupId = query.billingGroupId || '',
      group = associationContext?.groups.find((g) => g.id === groupId && g.valid);
    if (typeof groupId !== 'string' || (groupId && groupId !== 'unlinked' && !group))
      throw publicError('计费账户关联已失效，请重新选择或确认。');
    const range = internal.range || rangeFor(query.range || 'today', this.now(), group?.period?.start);
    if (!range.start)
      return {
        source: 'tools',
        status: 'unavailable',
        range,
        summary: null,
        message: '工具记录尚未关联到明确账期，本账期范围不可用。',
      };
    if (this.issue) return { source: 'tools', status: 'error', range, summary: null, message: this.issue };
    const ids = query.sourceIds || [];
    if (
      !Array.isArray(ids) ||
      ids.length > 20 ||
      ids.some((id) => typeof id !== 'string' || !this.entries.some((s) => s.id === id))
    )
      throw publicError('工具来源选择已失效，请重新选择。');
    const linkedSources = group
      ? new Set(associationContext.rules.filter((r) => r.groupId === group.id && r.valid).map((r) => r.sourceId))
      : null;
    const sources = this.entries.filter(
      (s) => s.enabled && (!ids.length || ids.includes(s.id)) && (!linkedSources || linkedSources.has(s.id)),
    );
    if (!sources.length)
      return {
        source: 'tools',
        status: 'unconfigured',
        range,
        summary: null,
        sourceReports: [],
        message: group ? '此账户没有已启用且关联有效的工具数据源。' : '请添加并启用工具数据源。',
      };
    const filters = { billingGroupId: groupId };
    for (const key of ['model', 'project', 'session']) {
      if (query[key] !== undefined && (typeof query[key] !== 'string' || query[key].length > 10000))
        throw publicError('筛选值无效。');
      filters[key] = query[key] || '';
    }
    const generation = this.revision,
      requestId = query.requestId || crypto.randomUUID();
    const result = await this.run(
      { operation: 'query', sources, range, filters, prices, associationRules: associationContext?.rules || [] },
      requestId,
    );
    if (associationContext && associationContext.signature !== this.associations.context().signature)
      return { source: 'tools', status: 'cancelled', range, summary: null, message: '账户关联已变化，请重新分析。' };
    if (generation !== this.revision)
      return { source: 'tools', status: 'cancelled', range, summary: null, message: '数据源已变化，请重新分析。' };
    for (const report of result.sourceReports || []) {
      const previous = this.runtime.get(report.id);
      this.runtime.set(report.id, {
        ...report,
        lastSuccessAt: report.status === 'ready' ? this.now() : previous?.lastSuccessAt || null,
        observedStartAt: report.coverage?.start || null,
        observedEndAt: report.coverage?.end || null,
      });
    }
    const timestamps = Object.fromEntries(
      this.entries.map((source) => {
        const saved = this.runtime.get(source.id);
        return [
          source.id,
          {
            lastSuccessAt: saved?.lastSuccessAt || null,
            observedStartAt: saved?.observedStartAt || null,
            observedEndAt: saved?.observedEndAt || null,
          },
        ];
      }),
    );
    try {
      atomicWrite(this.store.file('tool-source-status.json'), timestamps);
    } catch (e) {
      log.warn('tool-sources', 'status-write-failed', { errno: e?.code });
    }
    this.emit('status');
    return {
      ...result,
      source: 'tools',
      range,
      accountId: result.accountId || null,
      credits: null,
      prediction: null,
      association: result.association
        ? {
            ...result.association,
            issues: (associationContext?.rules || [])
              .filter((r) => !r.valid && sources.some((s) => s.id === r.sourceId))
              .map((r) => ({ id: r.id, message: r.message })),
            configurationIssue: associationContext?.issue || '',
          }
        : null,
    };
  }
  async sync(id, prices = {}) {
    this.require(id);
    return this.query({ sourceIds: [id], range: '7d' }, prices);
  }
  dispose() {
    this.closed = true;
    return this.cancel();
  }
}
module.exports = { ToolSources, canonical, publicError };
