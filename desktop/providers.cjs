const { retryAfter } = require('./domain.cjs');
const { log } = require('./logger.cjs');
const { ApiError, CommandCodeClient } = require('./api.cjs');
const { providerInfo } = require('./provider-catalog.cjs');
// Per-platform requests, body errors and normalization come from the registry (desktop/providers/, T5.3a).
const { REGISTRY, providerDefinition } = require('./providers/index.cjs');
class ProviderError extends ApiError {
  constructor(provider, status = 0, code = '', delay = 0) {
    super(status, delay, code);
    const name = providerInfo(provider)?.name || '平台';
    this.message =
      status === 401
        ? name + ' 密钥无效或已失效，请重新连接。'
        : provider === 'opencode-go' && code === 'entitlement'
          ? name + ' 此密钥对应的成员没有可查询的 Go 订阅，请在官方控制台核对成员与工作区。'
          : status === 403
            ? name + ' 查询权限不足，请检查密钥权限与所选地区。'
            : status === 429
              ? name + ' 查询过于频繁，已暂停自动刷新。'
              : status === 402
                ? name + ' 报告余额不足；本次未返回余额金额，请到官方平台核对。'
                : code === 'schema'
                  ? name + ' 返回的数据字段暂无法识别，已保留上次数据。'
                  : status >= 500
                    ? name + ' 服务暂时不可用。'
                    : code === 'upstream'
                      ? name +
                        (provider === 'deepseek'
                          ? ' 未能返回余额，请检查官方平台账户状态。'
                          : ' 未能提供套餐额度，请检查套餐、密钥类型及地区。')
                      : name + ' 连接失败，请检查网络或代理。';
  }
}
const ORIGINS = Object.freeze(Object.fromEntries(REGISTRY.filter((p) => p.origins).map((p) => [p.id, p.origins])));
const { signVolcengine } = providerDefinition('volcengine');
// HTTP 200 may still contain a vendor-specific failure. Never expose server bodies.
function bodyError(provider, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return ['schema', 0];
  return providerDefinition(provider)?.classifyBodyError?.(body) || null;
}
class QuotaClient {
  constructor(provider, region, fetchImpl = globalThis.fetch, { timeout = 15000, now = Date.now } = {}) {
    if (!ORIGINS[provider]?.[region]) throw new Error('Unsupported provider region');
    Object.assign(this, { provider, region, fetch: fetchImpl, timeout, now });
  }
  async request(credential) {
    const p = this.provider,
      definition = providerDefinition(p);
    const req = definition.buildRequest(credential, this.region, this.now());
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), this.timeout),
      started = Date.now();
    try {
      const { url, ...options } = req;
      const response = await this.fetch(url, { ...options, redirect: 'error', signal: controller.signal });
      const goForbidden = !!definition.forbiddenBody && response.status === 403;
      if (!response.ok && !goForbidden)
        throw new ProviderError(p, response.status, '', retryAfter(response.headers.get('retry-after')));
      if (Number(response.headers.get('content-length')) > 2_000_000) throw new ProviderError(p, 0, 'schema');
      let body;
      if (response.body?.getReader) {
        const reader = response.body.getReader(),
          chunks = [];
        let size = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 2_000_000) {
            await reader.cancel();
            throw new ProviderError(p, 0, 'schema');
          }
          chunks.push(Buffer.from(value));
        }
        body = Buffer.concat(chunks).toString('utf8');
      } else {
        body = await response.text();
        if (body.length > 2_000_000) throw new ProviderError(p, 0, 'schema');
      }
      let parsed;
      try {
        parsed = JSON.parse(body);
      } catch {
        throw new ProviderError(p, goForbidden ? 403 : 0, 'schema');
      }
      if (goForbidden) throw new ProviderError(p, 403, parsed?.error?.type === 'EntitlementError' ? 'entitlement' : '');
      const failure = bodyError(p, parsed);
      if (failure) throw new ProviderError(p, failure[1], failure[0], retryAfter(response.headers.get('retry-after')));
      return parsed;
    } catch (e) {
      const failure = e instanceof ProviderError ? e : new ProviderError(p);
      log.warn('providers', failure.status ? 'http' : /^[a-z]+$/.test(failure.code) ? failure.code : 'network', {
        provider: p,
        status: failure.status,
        durationMs: Date.now() - started,
      });
      throw failure;
    } finally {
      clearTimeout(timer);
    }
  }
  async usage(credential) {
    try {
      const raw = await this.request(credential);
      let credits;
      try {
        credits = providerDefinition(this.provider).normalize(raw, this.now());
      } catch {
        throw new ProviderError(this.provider, 0, 'schema');
      }
      return { parts: { credits }, errors: [] };
    } catch (e) {
      return {
        parts: {},
        errors: [
          {
            endpoint: 'credits',
            status: e.status || 0,
            code: e.code || 'network',
            retryAfterMs: e.retryAfterMs || 0,
            message: e.message,
          },
        ],
      };
    }
  }
}
function createClient(provider, region, fetchImpl) {
  const kind = providerDefinition(provider)?.clientKind;
  if (kind === 'subscription') {
    const client = new (require('./subscriptions.cjs').SubscriptionClient)(provider);
    client.capabilities = providerInfo(provider)?.capabilities;
    return client;
  }
  const client =
    kind === 'commandcode'
      ? new CommandCodeClient(fetchImpl)
      : kind === 'balance'
        ? new BalanceClient(provider, region, fetchImpl)
        : new QuotaClient(provider, region, fetchImpl);
  client.capabilities = providerInfo(provider)?.capabilities;
  return client;
}
class BalanceClient extends QuotaClient {
  async usage(credential) {
    try {
      const raw = await this.request(credential);
      let balance;
      try {
        balance = providerDefinition(this.provider).normalize(raw, this.now());
      } catch {
        throw new ProviderError(this.provider, 0, 'schema');
      }
      return { parts: { balance }, errors: [] };
    } catch (e) {
      return {
        parts: {},
        errors: [
          {
            endpoint: 'balance',
            status: e.status || 0,
            code: e.code || 'network',
            retryAfterMs: e.retryAfterMs || 0,
            message: e.message,
          },
        ],
      };
    }
  }
}
module.exports = { QuotaClient, BalanceClient, ProviderError, createClient, ORIGINS, signVolcengine };
