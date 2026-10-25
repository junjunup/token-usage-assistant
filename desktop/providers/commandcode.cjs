// Command Code (registry entry, T5.3a): read-only usage API via CommandCodeClient (api.cjs).
module.exports = {
  id: 'commandcode',
  capabilities: { quota: true, balance: true, usageSummary: true, actualBilling: false },
  name: 'Command Code',
  // T6.1: how far this platform has been checked (live = a real account was observed read-only; contract = only
  // the official interface samples). Not a reconciliation; see PROJECT_HANDOFF for the evidence.
  verification: {
    level: 'live',
    date: '2026-10-25',
    note: '用真实账户只读查看过额度（Windows 与 Mac）；未与官网逐项核账',
  },
  regions: [{ id: 'global', name: '官方平台' }],
  credential: 'apiKey',
  note: '查询账户额度、账期与用量；组织 ID 可选。',
  clientKind: 'commandcode',
  // The usage page needs the account login; anything else opens the site root.
  officialUrl: ({ identity, target }) =>
    target === 'usage' && /^[a-zA-Z0-9_-]+$/.test(identity?.login || '')
      ? 'https://commandcode.ai/' + encodeURIComponent(identity.login) + '/settings/usage'
      : 'https://commandcode.ai',
};
