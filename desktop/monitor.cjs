const { EventEmitter } = require('node:events');
const { nextDelay, AlertTracker, monthlyQuota } = require('./domain.cjs');
class UsageMonitor extends EventEmitter {
  constructor(client, { settings, persist = () => {}, notify = () => {}, now = Date.now } = {}) {
    super();
    this.client = client;
    this.settings = settings;
    this.persist = persist;
    this.notify = notify;
    this.now = now;
    this.generation = 0;
    this.key = '';
    this.timer = null;
    this.pending = null;
    this.failures = 0;
    this.alerts = new AlertTracker();
    this.rateLimitUntil = 0;
    this.state = { parts: {}, updatedAt: {}, errors: [], fetching: false, status: 'unconfigured', nextRefreshAt: null };
  }
  snapshot() {
    return structuredClone(this.state);
  }
  emitState() {
    this.emit('change', this.snapshot());
  }
  configure(key, orgId = '', cached = null) {
    this.generation++;
    clearTimeout(this.timer);
    this.pending = null;
    this.failures = 0;
    this.rateLimitUntil = 0;
    this.key = key;
    this.orgId = orgId;
    this.alerts = new AlertTracker(cached?.alerts);
    this.state = {
      parts: cached?.parts || {},
      updatedAt: cached?.updatedAt || {},
      errors: [],
      fetching: false,
      status: key ? 'stale' : 'unconfigured',
      nextRefreshAt: null,
    };
    this.emitState();
  }
  updateSettings(settings) {
    this.settings = settings;
    if (this.key && !this.pending)
      this.schedule(
        this.state.status === 'auth-error'
          ? null
          : Math.max(settings.refreshSeconds * 1000, this.rateLimitUntil - this.now()),
      );
  }
  receive(result) {
    const now = this.now();
    if (result.clearParts) {
      this.state.parts = {};
      this.state.updatedAt = {};
      this.alerts = new AlertTracker();
    }
    if (
      result.parts.identity &&
      this.state.parts.identity &&
      result.parts.identity.accountId !== this.state.parts.identity.accountId
    ) {
      this.state.parts = {};
      this.state.updatedAt = {};
      this.alerts = new AlertTracker();
    }
    for (const [kind, value] of Object.entries(result.parts)) {
      this.state.parts[kind] = value;
      this.state.updatedAt[kind] = result.observedAt === undefined ? now : result.observedAt;
    }
    this.state.errors = result.errors;
    const hasData = !!this.state.parts.credits || !!this.state.parts.summary || !!this.state.parts.balance,
      received = !!result.parts.credits || !!result.parts.summary || !!result.parts.balance;
    this.state.status = result.errors.some((e) => [401, 403].includes(e.status))
      ? 'auth-error'
      : result.errors.length
        ? received
          ? 'partial'
          : 'offline'
        : hasData
          ? 'connected'
          : 'offline';
    if (result.stale && !result.errors.length) this.state.status = 'stale';
    this.failures = result.errors.length ? this.failures + 1 : 0;
    this.rateLimitUntil = Math.max(
      0,
      ...result.errors.filter((e) => e.status === 429).map((e) => now + Math.max(e.retryAfterMs || 0, 30000)),
    );
    if (result.parts.credits && !result.stale)
      for (const alert of this.alerts.check(result.parts.credits, this.settings, monthlyQuota(this.state)))
        this.notify(alert);
    try {
      this.persist({ parts: this.state.parts, updatedAt: this.state.updatedAt, alerts: this.alerts.levels });
    } catch {}
    this.schedule(nextDelay(result.errors, this.failures, this.settings.refreshSeconds));
  }
  schedule(delay) {
    clearTimeout(this.timer);
    this.state.nextRefreshAt = delay === null || !this.key ? null : this.now() + delay;
    if (delay !== null && this.key) this.timer = setTimeout(() => this.refresh(), Math.min(delay, 2147483647));
  }
  refresh() {
    if (!this.key || this.pending) return this.pending || Promise.resolve(this.snapshot());
    if (this.now() < this.rateLimitUntil) {
      this.schedule(this.rateLimitUntil - this.now());
      this.emitState();
      return Promise.resolve(this.snapshot());
    }
    const generation = this.generation;
    clearTimeout(this.timer);
    this.state.fetching = true;
    this.state.nextRefreshAt = null;
    this.emitState();
    const operation = (async () => {
      try {
        const result = await this.client.usage(this.key, this.orgId);
        if (generation !== this.generation) return this.snapshot();
        this.receive(result);
      } catch {
        if (generation === this.generation) {
          this.state.status = 'offline';
          this.state.errors = [
            { endpoint: 'connection', status: 0, code: 'network', message: '网络暂时不可用，显示上次成功数据。' },
          ];
          this.failures++;
          this.schedule(nextDelay(this.state.errors, this.failures, this.settings.refreshSeconds));
        }
      } finally {
        if (generation === this.generation) {
          this.state.fetching = false;
          this.pending = null;
          this.emitState();
        }
      }
      return this.snapshot();
    })();
    this.pending = operation;
    return operation;
  }
  dispose() {
    this.generation++;
    clearTimeout(this.timer);
    this.pending = null;
    this.key = '';
  }
}
module.exports = { UsageMonitor };
