// Claude Code (registry entry, T5.3a): local collector for subscription windows and usage events; no API key.
module.exports = {
  id: 'claude',
  capabilities: { quota: true, balance: false, usageSummary: false, actualBilling: false },
  name: 'Claude · Claude Code',
  // T6.1: how far this platform has been checked (live = a real account was observed read-only; contract = only
  // the official interface samples). Not a reconciliation; see PROJECT_HANDOFF for the evidence.
  verification: {
    level: 'live',
    date: '2026-10-19',
    note: 'Mac 上用真实账户确认 5 小时 / 每周额度能同步；未与官网核账',
  },
  regions: [{ id: 'local', name: '本机统计组件' }],
  credential: 'local',
  note: '生成可选本地采集组件，接收 Claude Code 订阅窗口和用量事件。关闭工具后保留带时间戳的最近观察值，无需 API Key。',
  clientKind: 'subscription',
  officialUrl: () => 'https://claude.ai/settings/usage',
};
