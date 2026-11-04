// SiliconFlow (registry entry, T13.3, D20): read-only GET /v1/user/info (official API reference). China site in CNY,
// international site in USD; the two sites' keys are separate. The reference does not explain the three balance
// fields, so their reading follows its example (see balance-domain.cjs) and the platform says so.
const { normalizeSiliconFlow } = require('../balance-domain.cjs');
const origins = Object.freeze({ cn: 'https://api.siliconflow.cn', global: 'https://api.siliconflow.com' });
const currency = Object.freeze({ cn: 'CNY', global: 'USD' });
module.exports = {
  id: 'siliconflow',
  capabilities: { quota: false, balance: true, usageSummary: false, actualBilling: false },
  name: '硅基流动 · 按量余额',
  verification: { level: 'contract', date: '2026-11-05', note: '只用官方接口样例测试过，未用真实账户核对' },
  regions: [
    { id: 'cn', name: '国内 · 人民币' },
    { id: 'global', name: '国际 · 美元' },
  ],
  credential: 'apiKey',
  note: '填写所选站点的硅基流动 API Key（国内与国际的 Key 互不通用），只读查询账户余额。赠送与充值两项的含义按官方示例推断。余额变化不作为实际消费。',
  clientKind: 'balance',
  origins,
  buildRequest: (credential, region) => ({
    url: origins[region] + '/v1/user/info',
    method: 'GET',
    headers: { Authorization: 'Bearer ' + credential.apiKey, Accept: 'application/json' },
  }),
  classifyBodyError: (body) => (body.code !== 20000 || body.status === false ? ['upstream', 0] : null),
  normalize: (raw, _now, region) => normalizeSiliconFlow(raw, currency[region]),
  officialUrl: ({ region }) =>
    ({ cn: 'https://cloud.siliconflow.cn', global: 'https://cloud.siliconflow.com' })[region] || null,
};
