# 新平台调研（T9.9，D14：只调研，不实现）

> 2026-10-27，只读调研：只看官方文档与公开资料，**没有用任何凭据调用接口**，没有登录任何控制台。字段含义以官方文档为准；文档没写清楚的地方如实标「未说明」，实现前要用用户本人的真实返回核对（③）。

## 判断标准

沿用 AGENTS §2、§4 和已接入平台（DeepSeek `GET /user/balance`、MiniMax `/v1/token_plan/remains` 等）的标准：

1. **官方文档化的只读接口**：第三方逆向出来的接口不算。
2. **鉴权最小**：普通 API Key 即可；需要管理员密钥或云账号 AccessKey 的，凭据权限远超「看用量」，默认不做。
3. **不消耗额度**：查询本身不计费、不调用模型。
4. **字段语义清楚**：币种、单位、缺失与零的区分都写清楚，能满足「缺失显示「—」」「USD 与 CNY 分开」「余额差不当作消费」等红线。
5. **区域差异**：国内站与国际站域名、币种、密钥互不通用时，要能按区域选择（与 GLM、MiniMax 一致）。

## 结论一览

| 平台 | 官方只读接口 | 鉴权 | 返回内容 | 结论 |
|---|---|---|---|---|
| **Kimi 开放平台（Moonshot）** | `GET /v1/users/me/balance`；国内 `api.moonshot.cn`，国际 `api.moonshot.ai` | 普通 API Key（Bearer） | `available_balance`、`voucher_balance`、`cash_balance`（国内 CNY，国际 USD）；`cash_balance` 可为负（欠费），此时可用余额等于代金券余额 | **推荐第一个做**：形状与 DeepSeek 余额几乎一样，可复用余额卡片；两个区域的密钥互不通用，需区域选择 |
| **OpenRouter** | `GET https://openrouter.ai/api/v1/key` | 普通 API Key（Bearer） | 这把 Key 的花费上限 `limit` / `limit_remaining` / `limit_reset`（null 表示不限 / 不重置），已用 `usage`、`usage_daily`、`usage_weekly`、`usage_monthly`（UTC 日 / 周一起的周 / 月），`budgets[]`（`limit_usd`、`spend_usd`、`remaining_usd`、`reset_interval`、`resets_at`），免费模型每日请求数 | **推荐第二个做**：字段最完整，有明确的重置周期；注意它是**这把 Key 的**上限与用量，不是账户余额（账户余额接口需要管理密钥，本次没核实，不做）；`limit` 为 null 时显示「不限」，不能当 0 |
| **硅基流动（SiliconFlow）** | `GET /v1/user/info`；国内 `api.siliconflow.cn`，国际 `api.siliconflow.com` | 普通 API Key（Bearer） | `balance`、`chargeBalance`、`totalBalance`（**字符串**），文档没写三者含义和币种；同时返回 `id`、`email` 等身份字段（`name`、`image`、`email` 文档标为弃用） | **可以做，但要先核实**：字段含义和币种文档未说明，需要用户本人的真实返回确认后才能定口径；身份字段一律不保存、不记录（只按白名单取余额） |
| **阿里云百炼 / 通义千问** | API Key 没有余额或用量接口；账户余额只能通过 BSS OpenAPI `QueryAccountBalance`（`AvailableAmount`、`AvailableCashAmount`、`CreditAmount`） | 阿里云 **AccessKey**（RAM 用户 + `AliyunBSSReadOnlyAccess` 或 `bss:DescribeAcccount`），要做 AK/SK 签名 | 整个阿里云账户的余额，不区分百炼；Coding Plan（`sk-sp-` 专属 Key）**没有找到**官方额度查询接口 | **暂不建议**：凭据是云账号级的 AccessKey，余额也不是百炼专属；Coding Plan 额度没有官方接口 |
| **Kimi Code（订阅）** | 没有官方文档；第三方项目使用 `GET https://api.kimi.com/coding/v1/usages`（5 小时窗口与周额度） | — | 字段名只来自第三方示例 | **暂不做**：不是官方文档化接口；官方说明里套餐与周额度规则近期还在变（新套餐不再受周额度限制）。记为观察项，官方公开文档后再评估 |
| **Anthropic / OpenAI 组织用量** | Anthropic `GET /v1/organizations/usage_report/messages`、`/v1/organizations/cost_report`；OpenAI `/v1/organization/usage/*`、`/v1/organization/costs` | **管理员密钥**（Anthropic `sk-ant-admin01-…`，只能由组织管理员创建，用于组织管理接口；OpenAI 可设为只读，但只有组织所有者能创建） | 按日的 Token 用量与 USD 费用 | **暂不建议**：凭据权限远超看用量（本次没有找到把 Anthropic 管理员密钥限制为只读的方法）；个人账户不能用；OpenAI 社区有人报告费用接口返回 404。若以后要做，只考虑 OpenAI 的只读受限密钥，并单独评估 |
| **阶跃星辰、百度千帆** | 本次**没有找到**官方余额 / 用量接口文档 | — | — | 暂无结论，不做 |

已接入的平台（Command Code、GLM、MiniMax、火山、DeepSeek、OpenCode Go、Codex、Claude）不在本次范围。

## 推荐顺序

1. **Kimi 开放平台余额**：工作量最小（参照 DeepSeek 余额：固定 HTTPS、Bearer、不跟随重定向；国内 CNY / 国际 USD 分开，不换汇；`available_balance ≤ 0` 显示为余额耗尽而不是额度充足）。
2. **OpenRouter Key 用量与上限**：新的形状（Key 级上限 + 日 / 周 / 月用量 + 多个预算），要设计怎么展示「不限」与多个预算；`usage_*` 是这把 Key 的已报告花费，不是账单。
3. **硅基流动余额**：拿到真实返回、确认三个余额字段的含义与币种后再做。

每个平台实现前都要：用户在本机配置自己的 Key（不经过聊天）；按 AGENTS §6 的格式写契约要点；隐私说明（`docs/PRIVACY.md`）同步加上新的联网目标。是否做、何时做由用户决定，实现另行排期。

## 依据

- Kimi 开放平台余额：[platform.kimi.ai/docs/api/balance](https://platform.kimi.ai/docs/api/balance)、[platform.kimi.com/docs/api/balance](https://platform.kimi.com/docs/api/balance)、[Kimi 帮助：余额与用量](https://www.kimi.com/help/kimi-api/api-balance-and-usage)
- Kimi Code 套餐规则：[membership](https://www.kimi.com/code/docs/en/kimi-code/membership.html)、[error reference](https://www.kimi.com/en/help/kimi-code/error-reference)；第三方用法：[LaneSun/kimi-code-usage](https://github.com/LaneSun/kimi-code-usage)、[CodexBar kimi.md](https://raw.githubusercontent.com/steipete/CodexBar/main/docs/kimi.md)
- OpenRouter：[docs/limits](https://openrouter.ai/docs/limits)、[API reference: limits](https://openrouter.ai/docs/api/reference/limits)、[Management API keys](https://openrouter.ai/docs/guides/overview/auth/management-api-keys)
- 硅基流动：[get-user-info（国际）](https://docs.siliconflow.com/en/api-reference/userinfo/get-user-info.md)、[get-user-info（国内）](https://docs.siliconflow.cn/cn/api-reference/userinfo/get-user-info)
- 阿里云：[QueryAccountBalance](https://help.aliyun.com/document_detail/87997.html)、[BSS OpenAPI 的 RAM 授权](https://help.aliyun.com/zh/user-center/developer-reference/api-bssopenapi-2017-12-14-ram)、[AliyunBSSReadOnlyAccess](https://help.aliyun.com/zh/ram/developer-reference/aliyunbssreadonlyaccess)；Coding Plan 说明（第三方文章）：[developer.aliyun.com/article/1726011](https://developer.aliyun.com/article/1726011)
- Anthropic：[Usage and Cost API](https://docs.claude.com/en/api/usage-cost-api)、[get cost report](https://docs.anthropic.com/id/api/admin-api/usage-cost/get-cost-report)
- OpenAI：[Usage API cookbook](https://developers.openai.com/cookbook/examples/completions_usage_api)、[社区：costs 返回 404](https://community.openai.com/t/v1-organization-costs-returning-404/1365618)、只读受限密钥的配置见 [Harness 集成说明](https://developer.harness.io/cloud-cost-management/integrations/ai-providers/openai.md)
