// Safe metadata shared with the renderer. Credentials and request signing stay in main.
const PROVIDERS = Object.freeze([
  { id:'opencode-go',capabilities:{quota:true,balance:false,usageSummary:false,actualBilling:false},name:'OpenCode · Go',regions:[{id:'global',name:'官方平台'}],credential:'apiKey',note:'使用订阅成员的 OpenCode API Key，查询 Go 三个周期的官方额度。Zen 余额、Black 套餐及续费日期尚不由此接口提供；本机 Token 在工具分析中查看。' },
  { id:'deepseek',capabilities:{quota:false,balance:true,usageSummary:false,actualBilling:false},name:'DeepSeek · 官方按量',regions:[{id:'global',name:'官方 API 平台'}],credential:'apiKey',note:'填写 DeepSeek 官方 API Key，只读查询账户余额。各币种分别显示，余额变化不作为实际消费；Token 和费用估算在独立工具分析中查看。' },
  { id:'codex',capabilities:{quota:true,balance:false,usageSummary:false,actualBilling:false},name:'ChatGPT · Codex',regions:[{id:'local',name:'本机 Codex 登录'}],credential:'local',note:'读取官方 Codex 客户端的 ChatGPT 订阅额度。请先在 Codex 中登录；无需填写 API Key。网页聊天额度不在本次接口范围。' },
  { id:'claude',capabilities:{quota:true,balance:false,usageSummary:false,actualBilling:false},name:'Claude · Claude Code',regions:[{id:'local',name:'本机统计组件'}],credential:'local',note:'生成可选本地采集组件，接收 Claude Code 订阅窗口和用量事件。关闭工具后保留带时间戳的最近观察值，无需 API Key。' },
  { id: 'commandcode', capabilities: { quota:true, balance:true, usageSummary:true, actualBilling:false }, name: 'Command Code', regions: [{ id: 'global', name: '官方平台' }], credential: 'apiKey', note: '查询账户额度、账期与用量；组织 ID 可选。' },
  { id: 'glm', capabilities: { quota:true, balance:false, usageSummary:false, actualBilling:false }, name: 'GLM Coding Plan', regions: [{ id: 'cn', name: '国内 · 智谱' }, { id: 'global', name: '国际 · Z.ai' }], credential: 'apiKey', note: '使用所选站点的 Coding Plan Key。显示平台额度百分比和工具额度，额度单位不换算为 Token。' },
  { id: 'minimax', capabilities: { quota:true, balance:false, usageSummary:false, actualBilling:false }, name: 'MiniMax Token Plan', regions: [{ id: 'cn', name: '国内站' }, { id: 'global', name: '国际站' }], credential: 'apiKey', note: '使用 Token / Coding Plan 专属 Key。各模型或共享池分别显示，不相加。' },
  { id: 'volcengine', capabilities: { quota:true, balance:false, usageSummary:false, actualBilling:false }, name: '火山 Agent Plan', regions: [{ id: 'cn-beijing', name: '国内 · 北京' }], credential: 'aksk', note: '个人版 Agent Plan；填写有 GetAFPUsage 查询权限的 Access Key ID 和 Secret Access Key。模型 API Key 不适用。' },
]);
function providerInfo(id) { return PROVIDERS.find(p => p.id === id) || null; }
module.exports = { PROVIDERS, providerInfo };
