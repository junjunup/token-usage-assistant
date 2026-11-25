// T21.2 (D28 ②): Kimi open platform organization balance with an Admin API key — GET
// /v1/admin/organizations/account (official Admin API, beta, for verified organizations). An Admin key with only the
// billing:read scope reads the balance; the official docs say Admin keys cannot call any inference endpoint. China
// site in CNY, international site in USD, as for the regular key (T10.1). Amounts are integers in milli-cents.
const { normalizeKimiAdmin } = require('../balance-domain.cjs');
const origins = Object.freeze({ cn: 'https://api.moonshot.cn', global: 'https://api.moonshot.ai' });
const currency = Object.freeze({ cn: 'CNY', global: 'USD' });
module.exports = {
  id: 'kimi-admin',
  capabilities: { quota: false, balance: true, usageSummary: false, actualBilling: false },
  name: 'Kimi 开放平台 · 组织余额（Admin Key）',
  verification: { level: 'contract', date: '2026-11-25', note: '只按官方接口结构说明测试过，未用真实账户核对' },
  regions: [
    { id: 'cn', name: '国内 · 人民币' },
    { id: 'global', name: '国际 · 美元' },
  ],
  credential: 'apiKey',
  note: '填写所选站点的 Kimi 开放平台 Admin API Key（组织管理里创建，只需 billing:read 权限；组织需先完成认证），只读查询组织的可用余额。余额变化不作为实际消费。',
  clientKind: 'balance',
  origins,
  buildRequest: (credential, region) => ({
    url: origins[region] + '/v1/admin/organizations/account',
    method: 'GET',
    headers: { Authorization: 'Bearer ' + credential.apiKey, Accept: 'application/json' },
  }),
  // The Admin API answers failures as { error: { type, code, message, request_id } }; the message is never shown.
  classifyBodyError: (body) => (body && typeof body === 'object' && body.error ? ['upstream', 0] : null),
  normalize: (raw, _now, region) => normalizeKimiAdmin(raw, currency[region]),
  officialUrl: ({ region }) =>
    ({ cn: 'https://platform.kimi.com', global: 'https://platform.kimi.ai' })[region] || null,
};
