// StepFun (registry entry, T13.3, D20): read-only GET /v1/accounts (official API reference), China site only: the
// reference names no currency and the international site's currency is not documented. Step Plan quota has no
// query API (console only), so only the pay-as-you-go balance is shown.
const { normalizeStepFun } = require('../balance-domain.cjs');
const origins = Object.freeze({ cn: 'https://api.stepfun.com' });
module.exports = {
  id: 'stepfun',
  capabilities: { quota: false, balance: true, usageSummary: false, actualBilling: false },
  name: '阶跃星辰 · 按量余额',
  verification: { level: 'contract', date: '2026-11-05', note: '只用官方接口样例测试过，未用真实账户核对' },
  regions: [{ id: 'cn', name: '国内 · 人民币' }],
  credential: 'apiKey',
  note: '填写阶跃星辰开放平台的 API Key，只读查询按量账户的可用余额。Step Plan 套餐额度没有查询接口，这里不显示。余额变化不作为实际消费。',
  clientKind: 'balance',
  origins,
  buildRequest: (credential, region) => ({
    url: origins[region] + '/v1/accounts',
    method: 'GET',
    headers: { Authorization: 'Bearer ' + credential.apiKey, Accept: 'application/json' },
  }),
  classifyBodyError: (body) => (body.error ? ['upstream', 0] : null),
  normalize: (raw) => normalizeStepFun(raw),
  officialUrl: ({ region }) => (region === 'cn' ? 'https://platform.stepfun.com' : null),
};
