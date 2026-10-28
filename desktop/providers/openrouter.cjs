// OpenRouter (registry entry, T10.2, D16 ③): read-only GET /api/v1/key with an ordinary API key — this key's spend
// limit, budgets and reported spend (USD). No management-key endpoints, no account balance, no model calls.
const { normalizeOpenRouter } = require('../provider-domain.cjs');
const origins = Object.freeze({ global: 'https://openrouter.ai' });
module.exports = {
  id: 'openrouter',
  capabilities: { quota: true, balance: false, usageSummary: false, actualBilling: false },
  name: 'OpenRouter',
  // T6.1: how far this platform has been checked (live = a real account was observed read-only; contract = only
  // the official interface samples). Not a reconciliation; see PROJECT_HANDOFF for the evidence.
  verification: { level: 'contract', date: '2026-10-28', note: '只用官方接口样例测试过，未用真实账户核对' },
  regions: [{ id: 'global', name: 'OpenRouter' }],
  credential: 'apiKey',
  note: '填写 OpenRouter 的普通 API Key，只读查询这把 Key 的花费上限、预算和已报告花费（USD）；不是账户余额，也不是账单。',
  clientKind: 'quota',
  origins,
  buildRequest: (credential, region) => ({
    url: origins[region] + '/api/v1/key',
    method: 'GET',
    headers: { Authorization: 'Bearer ' + credential.apiKey, Accept: 'application/json' },
  }),
  // A 200 body carrying `error` is a platform-side failure; the body is never shown.
  classifyBodyError: (body) =>
    body.error ? ['upstream', [401, 403, 429].includes(body.error?.code) ? body.error.code : 0] : null,
  normalize: (raw) => normalizeOpenRouter(raw),
  officialUrl: ({ region }) => (region === 'global' ? 'https://openrouter.ai/settings/keys' : null),
};
