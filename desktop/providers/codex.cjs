// ChatGPT Codex (registry entry, T5.3a): local Codex app-server subscription quota; no API key.
module.exports = {
  id: 'codex',
  capabilities: { quota: true, balance: false, usageSummary: false, actualBilling: false },
  name: 'ChatGPT · Codex',
  regions: [{ id: 'local', name: '本机 Codex 登录' }],
  credential: 'local',
  note: '读取官方 Codex 客户端的 ChatGPT 订阅额度。请先在 Codex 中登录；无需填写 API Key。网页聊天额度不在本次接口范围。',
  clientKind: 'subscription',
  officialUrl: () => 'https://chatgpt.com/codex/settings/usage',
};
