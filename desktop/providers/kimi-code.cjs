// Kimi Code subscription (registry entry, T12.2, D19 ②): GET /coding/v1/usages with the Kimi Code API key the user
// enters here. The endpoint has no official documentation (it is the one the Kimi Code CLI and several third-party
// tools read), so the platform is labelled as unofficial and read by structure only. Separate from the Kimi open
// platform balance (kimi.cjs): the keys are not interchangeable.
const { normalizeKimiCode } = require('../provider-domain.cjs');
const origins = Object.freeze({ cn: 'https://api.kimi.com', global: 'https://api.kimi.ai' });
module.exports = {
  id: 'kimi-code',
  capabilities: { quota: true, balance: false, usageSummary: false, actualBilling: false },
  name: 'Kimi Code · 订阅',
  // T6.1 levels; contract here means samples only, and those samples come from third-party tools, not Kimi.
  verification: {
    level: 'contract',
    date: '2026-11-03',
    note: '非官方接口，只用第三方工具整理的样例测试过，未用真实账户核对',
  },
  regions: [
    { id: 'cn', name: '国内 · kimi.com' },
    { id: 'global', name: '国际 · kimi.ai' },
  ],
  credential: 'apiKey',
  note: '填写 Kimi Code 控制台里创建的 API Key（不是开放平台的 Key），查询 5 小时、每周与每月额度。非官方接口：Kimi 没有公开它的文档，格式变化时会显示「格式不兼容」。',
  clientKind: 'quota',
  origins,
  buildRequest: (credential, region) => ({
    url: origins[region] + '/coding/v1/usages',
    method: 'GET',
    headers: { Authorization: 'Bearer ' + credential.apiKey, Accept: 'application/json' },
  }),
  classifyBodyError: (body) => (body.error ? ['upstream', 0] : null),
  normalize: (raw) => normalizeKimiCode(raw),
  officialUrl: ({ region }) =>
    ({ cn: 'https://www.kimi.com/code/console', global: 'https://www.kimi.ai/code/console' })[region] || null,
};
