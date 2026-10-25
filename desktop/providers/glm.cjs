// GLM Coding Plan (registry entry, T5.3a): fixed read-only quota endpoint, domestic and international sites.
const { normalizeGlm } = require('../provider-domain.cjs');
const origins = Object.freeze({ cn: 'https://open.bigmodel.cn', global: 'https://api.z.ai' });
module.exports = {
  id: 'glm',
  capabilities: { quota: true, balance: false, usageSummary: false, actualBilling: false },
  name: 'GLM Coding Plan',
  // T6.1: how far this platform has been checked (live = a real account was observed read-only; contract = only
  // the official interface samples). Not a reconciliation; see PROJECT_HANDOFF for the evidence.
  verification: { level: 'contract', date: '2026-10-15', note: '只用官方接口样例测试过，未用真实账户核对' },
  regions: [
    { id: 'cn', name: '国内 · 智谱' },
    { id: 'global', name: '国际 · Z.ai' },
  ],
  credential: 'apiKey',
  note: '使用所选站点的 Coding Plan Key。显示平台额度百分比和工具额度，额度单位不换算为 Token。',
  clientKind: 'quota',
  origins,
  // GLM expects the raw key, without a Bearer prefix.
  buildRequest: (credential, region) => ({
    url: origins[region] + '/api/monitor/usage/quota/limit',
    method: 'GET',
    headers: { Authorization: credential.apiKey, Accept: 'application/json' },
  }),
  classifyBodyError(body) {
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
    return null;
  },
  normalize: (raw) => normalizeGlm(raw),
  officialUrl: ({ region }) => ({ cn: 'https://bigmodel.cn', global: 'https://z.ai' })[region] || null,
};
