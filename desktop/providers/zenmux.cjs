// ZenMux subscription (registry entry, T13.3, D20): read-only GET /api/v1/management/subscription/detail (official
// Management API). It needs a Management API Key, which the user creates in the ZenMux console; only this GET is
// called. The pay-as-you-go balance is a separate platform entry (zenmux-payg.cjs), like Kimi Code / Kimi.
const { normalizeZenMux } = require('../provider-domain.cjs');
const origins = Object.freeze({ global: 'https://zenmux.ai' });
module.exports = {
  id: 'zenmux',
  capabilities: { quota: true, balance: false, usageSummary: false, actualBilling: false },
  name: 'ZenMux · 订阅',
  verification: { level: 'contract', date: '2026-11-05', note: '只用官方接口样例测试过，未用真实账户核对' },
  regions: [{ id: 'global', name: 'ZenMux' }],
  credential: 'apiKey',
  note: '填写 ZenMux 控制台创建的 Management API Key（普通 API Key 不能查询），只读查询订阅的 5 小时与 7 天额度。',
  clientKind: 'quota',
  origins,
  buildRequest: (credential, region) => ({
    url: origins[region] + '/api/v1/management/subscription/detail',
    method: 'GET',
    headers: { Authorization: 'Bearer ' + credential.apiKey, Accept: 'application/json' },
  }),
  classifyBodyError: (body) => (body.success === false || body.error ? ['upstream', 0] : null),
  normalize: (raw) => normalizeZenMux(raw),
  officialUrl: ({ region }) => (region === 'global' ? 'https://zenmux.ai' : null),
};
