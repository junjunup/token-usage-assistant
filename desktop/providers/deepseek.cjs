// DeepSeek (registry entry, T5.3a): read-only GET /user/balance; balances stay separate from quota and billing.
const { normalizeDeepSeek } = require('../balance-domain.cjs');
const origins = Object.freeze({ global: 'https://api.deepseek.com' });
module.exports = {
  id: 'deepseek',
  capabilities: { quota: false, balance: true, usageSummary: false, actualBilling: false },
  name: 'DeepSeek · 官方按量',
  regions: [{ id: 'global', name: '官方 API 平台' }],
  credential: 'apiKey',
  note: '填写 DeepSeek 官方 API Key，只读查询账户余额。各币种分别显示，余额变化不作为实际消费；Token 和费用估算在独立工具分析中查看。',
  clientKind: 'balance',
  origins,
  buildRequest: (credential, region) => ({
    url: origins[region] + '/user/balance',
    method: 'GET',
    headers: { Authorization: 'Bearer ' + credential.apiKey, Accept: 'application/json' },
  }),
  classifyBodyError: () => null,
  normalize: (raw) => normalizeDeepSeek(raw),
  officialUrl: () => 'https://platform.deepseek.com/usage',
};
