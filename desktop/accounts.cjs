const { EventEmitter } = require('node:events');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { LocalStore, fingerprint } = require('./store.cjs');
const { log } = require('./logger.cjs');
const { UsageMonitor } = require('./monitor.cjs');
const { HistoryStore } = require('./history.cjs');
const { HistoryDatabase, createHistory } = require('./history-db.cjs');
const { providerInfo } = require('./provider-catalog.cjs');
const { createClient, ProviderError } = require('./providers.cjs');
const { text } = require('./domain.cjs');
const { pathKey, executableShape } = require('./platform.cjs');
const validId = (id) => typeof id === 'string' && /^(legacy-commandcode|[0-9a-f-]{36})$/.test(id);
function publicError(message) {
  const error = new Error(message);
  error.publicMessage = message;
  return error;
}
function validateConnection(value) {
  const provider = value?.provider || 'commandcode',
    info = providerInfo(provider);
  const region = value?.region || info?.regions[0].id;
  if (!info || !info.regions.some((r) => r.id === region)) throw publicError('请选择有效的平台与地区。');
  const secret = (input, name) => {
    if (
      typeof input !== 'string' ||
      input.trim().length < 8 ||
      input.trim().length > 4096 ||
      // eslint-disable-next-line no-control-regex -- intentionally rejects/strips control characters (input validation and privacy).
      /[\x00-\x20\x7f]/.test(input.trim())
    )
      throw publicError('请输入有效的 ' + name + '。');
    return input.trim();
  };
  let credential;
  if (info.credential === 'local') {
    if (typeof value.home !== 'string' || !path.isAbsolute(value.home) || value.home.length > 32000)
      throw publicError('请选择本机客户端配置目录。');
    credential = { home: path.resolve(value.home) };
    if (provider === 'codex') {
      if (!executableShape(value.executable)) throw publicError('请选择官方 Codex 的可执行程序。');
      credential.executable = path.resolve(value.executable);
      if (typeof value.binding === 'string' && /^[a-f0-9]{64}$/.test(value.binding)) credential.binding = value.binding;
    }
  } else
    credential =
      info.credential === 'aksk'
        ? {
            accessKeyId: secret(value.accessKeyId, 'Access Key ID'),
            secretKey: secret(value.secretKey, 'Secret Access Key'),
          }
        : { apiKey: secret(value.apiKey, 'API Key') };
  const orgId = provider === 'commandcode' && typeof value.orgId === 'string' ? value.orgId.trim() : '';
  if (orgId && !/^[a-zA-Z0-9_-]{1,128}$/.test(orgId)) throw publicError('组织 ID 格式不正确。');
  const label = text(value.label, 60).trim() || info.name;
  return { provider, region, label, orgId, credential };
}
function accountFingerprint(entry) {
  return fingerprint(
    JSON.stringify([
      entry.provider,
      entry.region,
      entry.credential.home ? { home: pathKey(entry.credential.home) } : entry.credential,
    ]),
    entry.orgId,
  );
}
class AccountManager extends EventEmitter {
  constructor({ store, settings, clientFactory = createClient, notify = () => {} }) {
    super();
    Object.assign(this, { store, settings, clientFactory, notify });
    this.entries = [];
    this.runtimes = new Map();
    this.activeId = '';
    this.connecting = false;
    this.issue = '';
    this.disposed = false;
    // One history database for all accounts, keyed by fingerprint; opened on first use (T4.1).
    this.historyDb = new HistoryDatabase(store.file('history.sqlite'));
    const monitor = new UsageMonitor(clientFactory('commandcode', 'global'), { settings });
    this.empty = {
      monitor,
      client: monitor.client,
      history: new HistoryStore(store.file('empty-history.json')),
      entry: { provider: 'commandcode', region: 'global', id: '' },
    };
  }
  get active() {
    return this.runtimes.get(this.activeId) || this.empty;
  }
  publicState() {
    return {
      activeAccountId: this.activeId,
      provider: this.active.entry.provider,
      region: this.active.entry.region,
      capabilities: providerInfo(this.active.entry.provider)?.capabilities,
      connecting: this.connecting,
      credentialIssue: this.issue,
      accounts: this.entries.map((e) => ({
        id: e.id,
        provider: e.provider,
        region: e.region,
        label: e.label,
        orgId: e.orgId,
        status: this.runtimes.get(e.id)?.monitor.state.status || 'stale',
      })),
    };
  }
  emitState() {
    if (!this.disposed) this.emit('change');
  }
  persistEntries(entries = this.entries, activeId = this.activeId) {
    try {
      this.store.saveAccounts({ accounts: entries, activeId });
    } catch {
      throw publicError('系统无法安全保存账户，已有连接保持不变。');
    }
  }
  runtime(entry, initial = null) {
    const scoped =
      entry.id === 'legacy-commandcode'
        ? this.store
        : new LocalStore(this.store.file('accounts/' + entry.id), this.store.safeStorage);
    const hash =
      entry.id === 'legacy-commandcode' && entry.provider === 'commandcode'
        ? fingerprint(entry.credential.apiKey, entry.orgId)
        : accountFingerprint(entry);
    const history = createHistory(this.historyDb, scoped.file('history.json'));
    history.configure(hash);
    const client = this.clientFactory(entry.provider, entry.region);
    const monitor = new UsageMonitor(client, {
      settings: this.settings,
      persist: (data) => {
        scoped.saveCache(hash, data);
        if (entry.provider === 'commandcode') history.append(data);
      },
      notify: (alert) =>
        this.notify({ ...alert, accountLabel: entry.label, provider: entry.provider, accountId: entry.id }),
    });
    monitor.provider = entry.provider;
    monitor.configure(
      entry.provider === 'commandcode' ? entry.credential.apiKey : entry.credential,
      entry.orgId,
      initial ? null : scoped.cache(hash),
    );
    monitor.on('change', () => this.emitState());
    const runtime = { entry, monitor, history, client, scoped, hash };
    if (initial) monitor.receive(initial);
    return runtime;
  }
  load() {
    try {
      const value = this.store.accounts(),
        ids = new Set();
      const entries = value.accounts.map((e) => {
        if (!validId(e.id) || ids.has(e.id)) throw new Error();
        ids.add(e.id);
        return { id: e.id, ...validateConnection({ ...e, ...e.credential }) };
      });
      this.entries = entries;
      for (const entry of entries) this.runtimes.set(entry.id, this.runtime(entry));
      this.activeId = this.runtimes.has(value.activeId) ? value.activeId : entries[0]?.id || '';
    } catch {
      log.warn('accounts', 'load-failed');
      this.issue = '本机账户列表暂不可用，已有加密文件未被覆盖。请恢复备份后重启助手。';
    }
    this.emitState();
  }
  // Re-read the encrypted account list after a failed load (e.g. Keychain access was denied) without a
  // restart. Read-only: the existing encrypted file is never written or replaced here.
  retryLoad() {
    if (!this.issue) return true;
    for (const runtime of this.runtimes.values()) runtime.monitor.dispose();
    this.runtimes.clear();
    this.entries = [];
    this.activeId = '';
    this.issue = '';
    this.load();
    log.info('accounts', 'credential-retry', {
      status: this.issue ? 'failed' : 'recovered',
      count: this.entries.length,
    });
    return !this.issue;
  }
  async connect(value) {
    if (this.issue) throw publicError(this.issue);
    if (this.connecting) throw publicError('正在连接，请稍候。');
    const candidate = validateConnection(value);
    if (value?.accountId && !this.runtimes.has(value.accountId)) throw publicError('要更新的账户已不存在。');
    const duplicate = this.entries.find((e) => accountFingerprint(e) === accountFingerprint(candidate));
    if (value?.accountId && duplicate && duplicate.id !== value.accountId)
      throw publicError('此密钥已保存在另一连接中，请切换到该账户。');
    const target = value?.accountId || duplicate?.id;
    if (!target && this.entries.length >= 20) throw publicError('最多保存 20 个账户，请先移除不再使用的连接。');
    this.connecting = true;
    this.emitState();
    try {
      const client = this.clientFactory(candidate.provider, candidate.region);
      const result = await client.usage(
        candidate.provider === 'commandcode' ? candidate.credential.apiKey : candidate.credential,
        candidate.orgId,
      );
      if (providerInfo(candidate.provider)?.credential === 'local' && !result.parts.credits && result.errors.length)
        throw publicError(result.errors[0].message);
      const fatal = result.errors.find((e) => [401, 403, 429].includes(e.status));
      if (fatal) throw new ProviderError(candidate.provider, fatal.status, fatal.code, fatal.retryAfterMs);
      const capabilities = providerInfo(candidate.provider).capabilities;
      const usable =
        (capabilities.quota && !!result.parts.credits) ||
        (capabilities.balance && !!result.parts.balance) ||
        (capabilities.usageSummary && !!result.parts.summary);
      if (candidate.provider === 'commandcode' ? !result.parts.identity : !usable) {
        const error = result.errors[0];
        throw new ProviderError(
          candidate.provider,
          error?.status || 0,
          error?.code || 'schema',
          error?.retryAfterMs || 0,
        );
      }
      if (this.disposed) throw publicError('应用已停止。');
      if (candidate.provider === 'codex' && result.parts.identity?.accountId)
        candidate.credential.binding = result.parts.identity.accountId;
      const entry = { ...candidate, id: target || crypto.randomUUID() };
      const entries = target ? this.entries.map((e) => (e.id === target ? entry : e)) : [...this.entries, entry];
      this.persistEntries(entries, entry.id);
      this.runtimes.get(entry.id)?.monitor.dispose();
      this.entries = entries;
      this.activeId = entry.id;
      this.runtimes.set(entry.id, this.runtime(entry, result));
      this.emitState();
      return entry.id;
    } finally {
      this.connecting = false;
      this.emitState();
    }
  }
  select(id) {
    if (this.connecting) throw publicError('请等待当前连接完成。');
    if (!this.runtimes.has(id)) throw publicError('账户已不存在。');
    this.persistEntries(this.entries, id);
    this.activeId = id;
    this.emitState();
  }
  remove(id = this.activeId) {
    if (this.connecting) throw publicError('请等待当前连接完成。');
    const runtime = this.runtimes.get(id);
    if (!runtime) throw publicError('账户已不存在。');
    const entries = this.entries.filter((e) => e.id !== id),
      activeId = this.activeId === id ? entries[0]?.id || '' : this.activeId;
    this.persistEntries(entries, activeId);
    runtime.monitor.dispose();
    this.runtimes.delete(id);
    this.entries = entries;
    this.activeId = activeId;
    for (const name of ['snapshot.json', 'history.json'])
      try {
        fs.unlinkSync(runtime.scoped.file(name));
      } catch (e) {
        if (e?.code !== 'ENOENT') log.warn('accounts', 'cache-remove-failed', { errno: e?.code });
      }
    if (runtime.history.purge) runtime.history.purge();
    else runtime.history.clear();
    this.emitState();
  }
  updateSettings(settings) {
    this.settings = settings;
    this.empty.monitor.updateSettings(settings);
    for (const r of this.runtimes.values()) r.monitor.updateSettings(settings);
  }
  async refreshAll() {
    await Promise.all([...this.runtimes.values()].map((r) => r.monitor.refresh()));
  }
  dispose() {
    this.disposed = true;
    this.empty.monitor.dispose();
    for (const r of this.runtimes.values()) r.monitor.dispose();
    this.historyDb.close();
  }
}
module.exports = { AccountManager, validateConnection, accountFingerprint };
