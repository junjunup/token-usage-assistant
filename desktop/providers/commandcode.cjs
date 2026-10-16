// Command Code (registry entry, T5.3a): read-only usage API via CommandCodeClient (api.cjs).
module.exports = {
  id: 'commandcode',
  capabilities: { quota: true, balance: true, usageSummary: true, actualBilling: false },
  name: 'Command Code',
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
