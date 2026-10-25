const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { Worker } = require('node:worker_threads');
const { readJson, atomicWrite } = require('./store.cjs');
const { log } = require('./logger.cjs');
const { rangeFor, accountBins, forecast, validatePrice } = require('./analytics-core.cjs');
class AnalyticsService {
  constructor({ store, monitor, history, client, now = Date.now, localReader = null, tools = null }) {
    this.tools = tools;
    this.store = store;
    this.monitor = monitor;
    this.history = history;
    this.client = client;
    this.now = now;
    this.localReader = localReader;
    this.cache = new Map();
    this.pending = new Map();
    this.revision = 0;
    this.cooldown = 0;
    const p = readJson(store.file('local-pricing.json'), {});
    this.prices = {};
    for (const [key, v] of Object.entries(p)) {
      try {
        this.prices[key] = validatePrice(v);
      } catch {
        // An invalid stored price entry is skipped, as before.
        log.warn('analytics', 'invalid-price-skipped');
      }
    }
    const cfg = readJson(store.file('local-source.json'), {});
    const roots = (process.env.ZCODE_HOME || path.join(os.homedir(), '.zcode'))
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
    this.file =
      typeof cfg.file === 'string'
        ? cfg.file
        : roots.map((r) => path.join(r, 'cli', 'db', 'db.sqlite')).find((f) => fs.existsSync(f)) ||
          path.join(roots[0] || os.homedir(), 'cli', 'db', 'db.sqlite');
  }
  resetAccount() {
    this.revision++;
    this.cache.clear();
    this.pending.clear();
    this.cooldown = 0;
  }
  setFile(file) {
    this.file = file;
    atomicWrite(this.store.file('local-source.json'), { file });
    this.revision++;
    this.cache.clear();
    this.pending.clear();
  }
  savePrice(key, value) {
    if (typeof key !== 'string' || key.length > 10000) throw new Error('模型标识无效');
    const price = validatePrice(value);
    this.prices[key] = price;
    atomicWrite(this.store.file('local-pricing.json'), this.prices);
    this.revision++;
    this.cache.clear();
    this.pending.clear();
    return price;
  }
  async local(range, filters) {
    if (this.localReader) return this.localReader(this.file, range, filters, this.prices);
    return new Promise((resolve) => {
      let settled = false;
      const worker = new Worker(path.join(__dirname, 'zcode-worker.cjs'), {
        workerData: { file: this.file, range, filters, prices: this.prices },
      });
      const finish = (v) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(v);
      };
      const error = () => ({ source: 'local', status: 'error', range, message: '本机用量读取超时或失败，请重试。' });
      const timer = setTimeout(() => {
        worker.terminate();
        finish(error());
      }, 15000);
      worker.once('message', finish);
      worker.once('error', () => finish(error()));
      worker.once('exit', (code) => {
        if (!settled) finish(error());
      });
    });
  }
  async get(query = {}) {
    if (query.source === 'reconciliation') {
      if (!this.associations) throw new Error('覆盖范围报告尚未就绪');
      return this.associations.reconcile(query, this.prices);
    }
    if (this.tools && query.source === 'tools') return this.tools.query(query, this.prices);
    if (this.tools && query.source === 'local') {
      const source = this.tools.entries.find((s) => s.kind === 'zcode' && s.enabled);
      if (!source)
        return {
          source: 'local',
          range: rangeFor(query.range || 'today', this.now()),
          status: 'missing',
          summary: null,
          message: '请添加并启用 Zcode 数据源。',
        };
      let session = query.session;
      if (session && !session.startsWith('["')) session = JSON.stringify([source.id, session]);
      return {
        ...(await this.tools.query({ ...query, sourceIds: [source.id], session }, this.prices)),
        source: 'local',
        sourceFile: source.file,
      };
    }
    const source = query.source || 'account',
      rangeId = query.range || 'today';
    if (!['account', 'local'].includes(source) || !['today', '7d', 'billing'].includes(rangeId))
      throw new Error('分析范围无效');
    const filters = {};
    for (const key of ['model', 'project', 'session']) {
      if (query[key] !== undefined && (typeof query[key] !== 'string' || query[key].length > 2000))
        throw new Error('筛选值无效');
      filters[key] = query[key] || '';
    }
    const now = this.now(),
      data = this.monitor.snapshot(),
      range = rangeFor(rangeId, now, source === 'account' ? data.parts.subscription?.start : null),
      prediction =
        source === 'account' ? forecast(this.history.records, now, this.monitor.settings.refreshSeconds) : null;
    const common = {
      range,
      source,
      prediction,
      credits: source === 'account' ? data.parts.credits || null : null,
      creditUpdatedAt: source === 'account' ? data.updatedAt.credits || null : null,
    };
    if (source === 'account' && this.monitor.provider && this.monitor.provider !== 'commandcode')
      return {
        ...common,
        prediction: null,
        status: 'unavailable',
        summary: null,
        message:
          this.client.capabilities?.balance && !this.client.capabilities?.quota
            ? '此连接仅提供账户余额，未提供 Token 或账单汇总。余额变化不是实际消费，请在总览查看余额或切换到独立工具分析。'
            : '此连接提供套餐额度；未提供此时段的 Token 或账单汇总。请在总览查看额度，或切换到独立工具分析。',
      };
    if (!range.start) return { ...common, status: 'unavailable', message: range.reason };
    const generation = this.revision,
      cacheKey = JSON.stringify([
        source,
        range.id,
        range.start,
        filters,
        source === 'local' ? this.file : this.history.hash,
        source === 'account' && rangeId === 'billing' ? data.updatedAt.summary : 0,
      ]),
      saved = this.cache.get(cacheKey);
    if (saved && now - saved.savedAt < 30000 && !(source === 'local' && query.force))
      return { ...saved.result, ...common };
    if (this.pending.has(cacheKey)) return this.pending.get(cacheKey);
    const operation = (async () => {
      let result;
      if (source === 'local') result = { ...common, ...(await this.local(range, filters)), sourceFile: this.file };
      else {
        const bins = accountBins(
          this.history.records,
          range,
          Math.max(180000, this.monitor.settings.refreshSeconds * 3000),
        );
        const base = {
          ...common,
          bins,
          models: [],
          projects: [],
          sessions: [],
          options: { models: [], projects: [] },
          historyStart: this.history.records[0]?.t || null,
          sampled: true,
        };
        if (!this.monitor.key)
          result = { ...base, status: 'unconfigured', message: '连接 Command Code 账户后查看账户统计。' };
        else if (
          rangeId === 'billing' &&
          data.parts.summary &&
          (data.parts.summary.scope !== 'billing' || data.parts.summary.periodStart !== range.start)
        )
          result = {
            ...base,
            status: 'unavailable',
            summary: null,
            message: '接口尚未确认本账期汇总，等待下一次同步。',
          };
        else if (rangeId === 'billing')
          result = {
            ...base,
            summary: data.parts.summary || null,
            updatedAt: data.updatedAt.summary || null,
            status: data.parts.summary
              ? data.errors.some((e) => e.endpoint === 'summary' || e.endpoint === 'identity') ||
                ['offline', 'auth-error', 'stale'].includes(data.status)
                ? 'stale'
                : 'ready'
              : 'unavailable',
            message: data.parts.summary ? '' : '等待账户汇总同步。',
          };
        else if (data.status === 'auth-error')
          result = { ...base, status: 'error', message: '账户需要重新连接，自动查询已暂停。' };
        else if (now < Math.max(this.cooldown, this.monitor.rateLimitUntil))
          result = {
            ...base,
            ...(saved?.result || {}),
            ...common,
            status: 'stale',
            message: '服务端要求暂缓查询，稍后自动更新。',
            retryAt: Math.max(this.cooldown, this.monitor.rateLimitUntil),
          };
        else {
          try {
            const summary = await this.client.summary(
              this.monitor.key,
              this.monitor.orgId || data.parts.identity?.orgId || '',
              range.start,
            );
            result = {
              ...base,
              summary: { ...summary, scope: 'range', periodEnd: now },
              updatedAt: now,
              status: 'ready',
            };
          } catch (e) {
            if (e.status === 429) {
              this.cooldown = now + Math.max(30000, e.retryAfterMs || 0);
              this.monitor.rateLimitUntil = Math.max(this.monitor.rateLimitUntil, this.cooldown);
            }
            result = {
              ...base,
              ...(saved?.result || {}),
              ...common,
              status: 'stale',
              message: e.message || '账户统计暂时不可用，已保留此范围上次的数据。',
            };
          }
        }
      }
      if (generation !== this.revision)
        return { ...common, status: 'unavailable', message: '数据源或设置已变化，请重新加载分析。', summary: null };
      if (this.cache.size > 30) this.cache.delete(this.cache.keys().next().value);
      this.cache.set(cacheKey, { savedAt: now, result });
      return result;
    })();
    this.pending.set(cacheKey, operation);
    try {
      return await operation;
    } finally {
      if (this.pending.get(cacheKey) === operation) this.pending.delete(cacheKey);
    }
  }
}
module.exports = { AnalyticsService };
