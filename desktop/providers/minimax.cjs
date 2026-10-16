// MiniMax Token Plan (registry entry, T5.3a): fixed read-only remains endpoint, domestic and international sites.
const { normalizeMiniMax } = require('../provider-domain.cjs');
const origins = Object.freeze({ cn: 'https://api.minimaxi.com', global: 'https://api.minimax.io' });
module.exports = {
  id: 'minimax',
  capabilities: { quota: true, balance: false, usageSummary: false, actualBilling: false },
  name: 'MiniMax Token Plan',
  regions: [
    { id: 'cn', name: '国内站' },
    { id: 'global', name: '国际站' },
  ],
  credential: 'apiKey',
  note: '使用 Token / Coding Plan 专属 Key。各模型或共享池分别显示，不相加。',
  clientKind: 'quota',
  origins,
  buildRequest: (credential, region) => ({
    url: origins[region] + '/v1/token_plan/remains',
    method: 'GET',
    headers: { Authorization: 'Bearer ' + credential.apiKey, Accept: 'application/json' },
  }),
  classifyBodyError(body) {
    if (
      body.base_resp?.status_code === undefined ||
      body.base_resp.status_code === null ||
      body.base_resp.status_code === '' ||
      typeof body.base_resp.status_code === 'boolean'
    )
      return ['schema', 0];
    const code = Number(body.base_resp.status_code);
    if (code !== 0) return ['upstream', [1004, 2049].includes(code) ? 401 : code === 1002 ? 429 : 0];
    return null;
  },
  normalize: (raw, now) => normalizeMiniMax(raw, now),
  officialUrl: ({ region }) =>
    ({
      cn: 'https://platform.minimax.cn/subscribe/token-plan',
      global: 'https://platform.minimax.io/subscribe/token-plan',
    })[region] || null,
};
