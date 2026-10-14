const crypto = require('node:crypto');
const { retryAfter } = require('./domain.cjs');
const { ApiError, CommandCodeClient } = require('./api.cjs');
const { providerInfo } = require('./provider-catalog.cjs');
const { normalizeGlm, normalizeMiniMax, normalizeVolcengine, normalizeOpenCodeGo } = require('./provider-domain.cjs');
const { normalizeDeepSeek } = require('./balance-domain.cjs');
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
const ORIGINS = Object.freeze({
  'opencode-go': { global: 'https://opencode.ai' },
  deepseek: { global: 'https://api.deepseek.com' },
  glm: { cn: 'https://open.bigmodel.cn', global: 'https://api.z.ai' },
  minimax: { cn: 'https://api.minimaxi.com', global: 'https://api.minimax.io' },
  volcengine: { 'cn-beijing': 'https://ark.cn-beijing.volcengineapi.com' },
});
const hash = (s) => crypto.createHash('sha256').update(s).digest('hex');
const hmac = (key, value) => crypto.createHmac('sha256', key).update(value).digest();
function signVolcengine(credential, now = Date.now()) {
  const host = 'ark.cn-beijing.volcengineapi.com',
    query = 'Action=GetAFPUsage&Version=2024-01-01',
    body = '{}';
  const date = new Date(now).toISOString().replace(/[:-]|\.\d{3}/g, ''),
    day = date.slice(0, 8);
  const payload = hash(body),
    signed = 'content-type;host;x-content-sha256;x-date';
  const canonical =
    'POST\n/\n' +
    query +
    '\ncontent-type:application/json\nhost:' +
    host +
    '\nx-content-sha256:' +
    payload +
    '\nx-date:' +
    date +
    '\n\n' +
    signed +
    '\n' +
    payload;
  const scope = day + '/cn-beijing/ark/request';
  const signingKey = hmac(hmac(hmac(hmac(credential.secretKey, day), 'cn-beijing'), 'ark'), 'request');
  const signature = hmac(signingKey, 'HMAC-SHA256\n' + date + '\n' + scope + '\n' + hash(canonical)).toString('hex');
  return {
    url: 'https://' + host + '/?' + query,
    method: 'POST',
    body,
    headers: {
      'Content-Type': 'application/json',
      'X-Date': date,
      'X-Content-Sha256': payload,
      Authorization:
        'HMAC-SHA256 Credential=' +
        credential.accessKeyId +
        '/' +
        scope +
        ', SignedHeaders=' +
        signed +
        ', Signature=' +
        signature,
    },
  };
}
// HTTP 200 may still contain a vendor-specific failure. Never expose server bodies.
function bodyError(provider, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return ['schema', 0];
  if (provider === 'opencode-go' && (body.error || body.type === 'error'))
    return body.error?.type === 'EntitlementError'
      ? ['entitlement', 403]
      : body.error?.type === 'AuthError'
        ? ['upstream', 401]
        : ['upstream', 0];
  if (provider === 'glm') {
    if (
      body.success === false ||
      (body.code !== undefined && ![0, 200, '0', '200'].includes(body.code)) ||
      body.error
    ) {
      const code = String(body.error?.code || body.code || '');
      return [
        'upstream',
        ['401', '1000', '1001', '1002', '1003', '1004'].includes(code) ? 401 : ['429', '1302'].includes(code) ? 429 : 0,
      ];
    }
  }
  if (provider === 'minimax') {
    if (
      body.base_resp?.status_code === undefined ||
      body.base_resp.status_code === null ||
      body.base_resp.status_code === '' ||
      typeof body.base_resp.status_code === 'boolean'
    )
      return ['schema', 0];
    const code = Number(body.base_resp.status_code);
    if (code !== 0) return ['upstream', [1004, 2049].includes(code) ? 401 : code === 1002 ? 429 : 0];
  }
  if (provider === 'volcengine' && body.ResponseMetadata?.Error) {
    const code = String(body.ResponseMetadata.Error.Code || '');
    return [
      'upstream',
      /InvalidAccessKey|SignatureDoesNotMatch|InvalidToken|ExpiredToken/.test(code)
        ? 401
        : /AccessDenied|Forbidden|Unauthorized/.test(code)
          ? 403
          : /Throttl|LimitExceeded/.test(code)
            ? 429
            : 0,
    ];
  }
  return null;
}
class QuotaClient {
  constructor(provider, region, fetchImpl = globalThis.fetch, { timeout = 15000, now = Date.now } = {}) {
    if (!ORIGINS[provider]?.[region]) throw new Error('Unsupported provider region');
    Object.assign(this, { provider, region, fetch: fetchImpl, timeout, now });
  }
  async request(credential) {
    const p = this.provider;
    const req =
      p === 'volcengine'
        ? signVolcengine(credential, this.now())
        : {
            url:
              ORIGINS[p][this.region] +
              (p === 'opencode-go'
                ? '/zen/go/v1/usage'
                : p === 'deepseek'
                  ? '/user/balance'
                  : p === 'glm'
                    ? '/api/monitor/usage/quota/limit'
                    : '/v1/token_plan/remains'),
            method: 'GET',
            headers: {
              Authorization: p === 'glm' ? credential.apiKey : 'Bearer ' + credential.apiKey,
              Accept: 'application/json',
            },
          };
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), this.timeout);
    try {
      const { url, ...options } = req;
      const response = await this.fetch(url, { ...options, redirect: 'error', signal: controller.signal });
      const goForbidden = p === 'opencode-go' && response.status === 403;
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
      if (e instanceof ProviderError) throw e;
      throw new ProviderError(p);
    } finally {
      clearTimeout(timer);
    }
  }
  async usage(credential) {
    try {
      const raw = await this.request(credential);
      let credits;
      try {
        credits =
          this.provider === 'opencode-go'
            ? normalizeOpenCodeGo(raw)
            : this.provider === 'glm'
              ? normalizeGlm(raw)
              : this.provider === 'minimax'
                ? normalizeMiniMax(raw, this.now())
                : normalizeVolcengine(raw);
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
  if (['codex', 'claude'].includes(provider)) {
    const client = new (require('./subscriptions.cjs').SubscriptionClient)(provider);
    client.capabilities = providerInfo(provider)?.capabilities;
    return client;
  }
  const client =
    provider === 'commandcode'
      ? new CommandCodeClient(fetchImpl)
      : provider === 'deepseek'
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
        balance = normalizeDeepSeek(raw);
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
