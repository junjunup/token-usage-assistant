const { ENDPOINTS, normalizeIdentity, normalizeCredits, normalizeSubscription, normalizeSummary, retryAfter } = require('./domain.cjs');
const ORIGIN = 'https://api.commandcode.ai';
class ApiError extends Error {
  constructor(status, retryAfterMs = 0, code = '') { super(status === 401 ? 'API Key 无效或已失效，请重新连接。' : status === 403 ? '当前密钥没有此账户或组织的访问权限。' : status === 429 ? '查询过于频繁，已按服务端要求暂停刷新。' : status >= 500 ? 'Command Code 服务暂时不可用。' : code === 'schema' ? '接口字段发生变化，此项数据暂不可用。' : '无法连接到 Command Code，请检查网络或代理。'); this.status = status; this.retryAfterMs = retryAfterMs; this.code = code || String(status); }
}
class CommandCodeClient {
  constructor(fetchImpl = globalThis.fetch, { timeout = 15000 } = {}) { this.fetch = fetchImpl; this.timeout = timeout; }
  async request(kind, key, params = {}) {
    if (!ENDPOINTS[kind]) throw new Error('不支持的接口');
    const url = new URL(ENDPOINTS[kind], ORIGIN);
    for (const p of ['orgId', 'since']) if (params[p]) url.searchParams.set(p, params[p]);
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), this.timeout);
    try {
      const response = await this.fetch(url.toString(), { method: 'GET', headers: { Authorization: `Bearer ${key}`, Accept: 'application/json', 'User-Agent': 'cli' }, redirect: 'error', signal: controller.signal });
      if (!response.ok) throw new ApiError(response.status, retryAfter(response.headers.get('retry-after')));
      if (Number(response.headers.get('content-length')) > 4_000_000) throw new ApiError(0, 0, 'schema');
      const body = await response.text();
      if (body.length > 4_000_000) throw new ApiError(0, 0, 'schema');
      try { const parsed = JSON.parse(body); if (parsed?.success === false) throw new Error(); return parsed; } catch { throw new ApiError(0, 0, 'schema'); }
    } catch (error) { if (error instanceof ApiError) throw error; throw new ApiError(0); } finally { clearTimeout(timer); }
  }
  async identity(key, orgId = '') { try { return normalizeIdentity(await this.request('identity', key, { orgId })); } catch (e) { if (e instanceof ApiError) throw e; throw new ApiError(0, 0, 'schema'); } }
  async summary(key, orgId, since) { try { return normalizeSummary(await this.request('summary',key,{orgId,since:new Date(since).toISOString()}),since); } catch(e) { if(e instanceof ApiError)throw e;throw new ApiError(0,0,'schema'); } }
  async usage(key, orgId = '') {
    const parts = {}, errors = [];
    const record = (endpoint, e) => errors.push({ endpoint, status: e instanceof ApiError ? e.status : 0, code: e instanceof ApiError ? e.code : 'schema', retryAfterMs: e.retryAfterMs || 0, message: e instanceof ApiError ? e.message : '接口字段发生变化，此项数据暂不可用。' });
    try { parts.identity = await this.identity(key, orgId); } catch (e) { record('identity', e); return { parts, errors }; }
    const scope = orgId || parts.identity.orgId;
    if (orgId && parts.identity.orgId !== orgId) { record('identity', new ApiError(403)); return { parts: {}, errors }; }
    await Promise.all(['credits','subscription'].map(async kind => { try { const v = await this.request(kind, key, { orgId: scope }); parts[kind] = kind === 'credits' ? normalizeCredits(v) : normalizeSubscription(v); } catch (e) { record(kind, e); } }));
    // A missing/failed subscription must never turn all-time totals into billing-period totals.
    const sub = parts.subscription, start = sub?.start || null, end = sub?.end || null;
    try { parts.summary = normalizeSummary(await this.request('summary', key, { orgId: scope, since: start ? new Date(start).toISOString() : '' }), start, end); } catch (e) { record('summary', e); }
    return { parts, errors };
  }
}
module.exports = { CommandCodeClient, ApiError, ORIGIN };
