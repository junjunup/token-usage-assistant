// Kimi open platform (registry entry, T10.1, D16): read-only GET /v1/users/me/balance. China site in CNY,
// international site in USD; the two sites' keys are separate. Balances stay separate from quota and billing.
const { normalizeKimi } = require('../balance-domain.cjs');
const origins = Object.freeze({ cn: 'https://api.moonshot.cn', global: 'https://api.moonshot.ai' });
const currency = Object.freeze({ cn: 'CNY', global: 'USD' });
module.exports = {
  id: 'kimi',
  capabilities: { quota: false, balance: true, usageSummary: false, actualBilling: false },
  name: 'Kimi 开放平台 · 按量余额',
  // T6.1: how far this platform has been checked (live = a real account was observed read-only; contract = only
  // the official interface samples). Not a reconciliation; see PROJECT_HANDOFF for the evidence.
  verification: { level: 'contract', date: '2026-10-28', note: '只用官方接口样例测试过，未用真实账户核对' },
  regions: [
    { id: 'cn', name: '国内 · 人民币' },
    { id: 'global', name: '国际 · 美元' },
  ],
  credential: 'apiKey',
  note: '填写所选站点的 Kimi 开放平台 API Key（国内与国际的 Key 互不通用），只读查询可用余额。余额变化不作为实际消费。',
  clientKind: 'balance',
  origins,
  buildRequest: (credential, region) => ({
    url: origins[region] + '/v1/users/me/balance',
    method: 'GET',
    headers: { Authorization: 'Bearer ' + credential.apiKey, Accept: 'application/json' },
  }),
  // HTTP 200 with a non-zero code or status false is a platform-side failure; the body is never shown.
  classifyBodyError: (body) => (body.code !== 0 || body.status === false || body.error ? ['upstream', 0] : null),
  normalize: (raw, _now, region) => normalizeKimi(raw, currency[region]),
  officialUrl: ({ region }) =>
    ({ cn: 'https://platform.kimi.com', global: 'https://platform.kimi.ai' })[region] || null,
};
