// OpenCode Go (registry entry, T5.3a): fixed HTTPS usage endpoint, Bearer auth, three server-reported percentages.
const { normalizeOpenCodeGo } = require('../provider-domain.cjs');
const origins = Object.freeze({ global: 'https://opencode.ai' });
module.exports = {
  id: 'opencode-go',
  capabilities: { quota: true, balance: false, usageSummary: false, actualBilling: false },
  name: 'OpenCode · Go',
  // T6.1: how far this platform has been checked (live = a real account was observed read-only; contract = only
  // the official interface samples). Not a reconciliation; see PROJECT_HANDOFF for the evidence.
  verification: { level: 'contract', date: '2026-10-15', note: '只用官方接口样例测试过，未用真实账户核对' },
  regions: [{ id: 'global', name: '官方平台' }],
  credential: 'apiKey',
  note: '使用订阅成员的 OpenCode API Key，查询 Go 三个周期的官方额度。Zen 余额、Black 套餐及续费日期尚不由此接口提供；本机 Token 在工具分析中查看。',
  clientKind: 'quota',
  origins,
  // HTTP 403 still carries a JSON body that tells an entitlement problem apart from other refusals.
  forbiddenBody: true,
  buildRequest: (credential, region) => ({
    url: origins[region] + '/zen/go/v1/usage',
    method: 'GET',
    headers: { Authorization: 'Bearer ' + credential.apiKey, Accept: 'application/json' },
  }),
  classifyBodyError(body) {
    if (body.error || body.type === 'error')
      return body.error?.type === 'EntitlementError'
        ? ['entitlement', 403]
        : body.error?.type === 'AuthError'
          ? ['upstream', 401]
          : ['upstream', 0];
    return null;
  },
  normalize: (raw) => normalizeOpenCodeGo(raw),
  officialUrl: () => 'https://opencode.ai/auth',
};
