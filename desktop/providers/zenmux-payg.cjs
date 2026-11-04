// ZenMux pay-as-you-go balance (registry entry, T13.3, D20): read-only GET /api/v1/management/payg/balance (official
// Management API, USD credits). Same Management API Key as the subscription entry; balances stay separate from it.
const { normalizeZenMuxBalance } = require('../balance-domain.cjs');
const origins = Object.freeze({ global: 'https://zenmux.ai' });
module.exports = {
  id: 'zenmux-payg',
  capabilities: { quota: false, balance: true, usageSummary: false, actualBilling: false },
  name: 'ZenMux · 按量余额',
  verification: { level: 'contract', date: '2026-11-05', note: '只用官方接口样例测试过，未用真实账户核对' },
  regions: [{ id: 'global', name: 'ZenMux · 美元' }],
  credential: 'apiKey',
  note: '填写 ZenMux 控制台创建的 Management API Key（普通 API Key 不能查询），只读查询按量账户的余额（美元）。余额变化不作为实际消费。',
  clientKind: 'balance',
  origins,
  buildRequest: (credential, region) => ({
    url: origins[region] + '/api/v1/management/payg/balance',
    method: 'GET',
    headers: { Authorization: 'Bearer ' + credential.apiKey, Accept: 'application/json' },
  }),
  classifyBodyError: (body) => (body.success === false || body.error ? ['upstream', 0] : null),
  normalize: (raw) => normalizeZenMuxBalance(raw),
  officialUrl: ({ region }) => (region === 'global' ? 'https://zenmux.ai' : null),
};
