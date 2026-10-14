# Command Code Token 用量监测桌面助手：接口与前置条件

> 状态：前置调研材料（未进入视觉设计或开发）  
> 整理日期：2026-09-23  
> 目标：为后续本地桌面助手准备数据接口、网络端口、认证和安全要求。

## 1. 当前使用场景与边界

- 预设场景：用户通过 Zcode 调用 Command Code 的模型 API，桌面助手读取同一 Command Code 账户的套餐、额度和汇总用量。
- 需要确认 Zcode 配置的 `Base URL` 指向 Command Code，并且使用该 Command Code 账户的 API Key。若调用经过其他代理、使用其他供应商密钥，Command Code 看板就不会完整反映那部分用量。
- 账户用量接口提供的是账户/组织维度的数据；目前没有依据保证能把用量精确归属到 Zcode、某台电脑或某个客户端。
- 首版可准备的数据口径：5 小时和每周窗口、剩余额度、套餐及账期、账期内总请求数、输入/输出 Token 汇总和总费用。
- 不预设能取得稳定的逐请求历史、分时/分模型图表或 Zcode 单独用量。它们需要单独核实接口能力。

## 2. 候选接口

Command Code 的公开 Provider API 文档列出模型请求接口，但没有把下面的 `/alpha/*` 账户用量接口列入公开 Provider API 契约。公开资料显示 Command Code CLI 的 `/usage` 功能以及第三方只读客户端使用了这些接口。故 `/alpha/*` 应视为**可用性有依据、但尚未公开承诺稳定性的第一方接口**；后续接入时应实测并允许字段变化。

| 用途 | 方法与地址 | 认证 | 用途及注意事项 |
|---|---|---|---|
| 当前账户 / 组织 | `GET https://api.commandcode.ai/alpha/whoami` | `Authorization: Bearer <API_KEY>` | 识别当前 Key 所属身份；若账户有组织，应确认查询范围。 |
| 额度及滚动窗口 | `GET https://api.commandcode.ai/alpha/billing/credits` | 同上 | 读取月度/购买/免费额度，以及 `windowLimits.fiveHour`、`windowLimits.weekly` 的 `used`、`cap` 和 `resetAt`。具体响应字段需在接入时验证。 |
| 套餐和账期 | `GET https://api.commandcode.ai/alpha/billing/subscriptions` | 同上 | 确认套餐 ID、订阅状态、账期开始和结束时间。 |
| 账期汇总 | `GET https://api.commandcode.ai/alpha/usage/summary` | 同上 | 候选汇总接口。公开的 CLI 客户端资料映射了总请求、费用、输入/输出 Token、成功率等字段；字段名、默认账期和 `since=<RFC3339>` 参数仍需实测确认。 |
| 模型目录（可选） | `GET https://api.commandcode.ai/provider/v1/models` | 公开目录，不需 Key | 用于显示/映射模型名称；用量监测基础功能不依赖它。 |

### 不作为首选的数据来源

- Command Code Studio 网页地址：`https://commandcode.ai/junjunup/settings/usage`，需要网页登录。
- 网站自身的 `/internal/*` 接口属于网页应用内部接口，通常依赖浏览器 Session Cookie；未列入公开 Provider API 文档，不建议把复制浏览器 Cookie 或抓取登录态作为桌面助手的主要认证方式。
- `/provider/v1/chat/completions`、`/provider/v1/responses`、`/provider/v1/messages` 是**发起模型请求**的接口，不是读取账户仪表盘的用量查询接口。监测助手不需要代替 Zcode 发请求。

## 3. 认证和密钥前置条件

1. 需要一个 Command Code API Key。官方说明可在 Command Code Studio 的 API Keys 页面管理 Key；使用 Provider API 时，同一 Key 用于 API 身份验证。
2. 若 Zcode 已配置 Command Code Key，后续可以由用户在本机安全地提供给监测助手；不要把 Key 粘贴进聊天、Markdown、源码、`.env` 提交记录或日志。
3. 桌面应用应使用操作系统凭据库（Windows Credential Manager、macOS Keychain 或 Linux Secret Service）保存 Key。界面中只显示掩码；日志必须过滤 `Authorization` Header。
4. 该 Key 可能同时允许模型调用并产生计费，不能因为用量查询是只读就按低敏感凭据处理。不得通过读取或导出浏览器 Cookie 来替代 API Key。
5. 不要在助手中保存 Command Code 账号密码。网页登录/生成 Key 由用户本人在官方页面完成。

## 4. 网络、域名和端口

| 方向 | 主机 | 端口 | 必需性 | 说明 |
|---|---|---:|---|---|
| 出站 HTTPS | `api.commandcode.ai` | TCP 443 | 必需 | 所有候选账户接口和可选模型目录。需要 DNS 解析和正常 TLS 证书验证。 |
| 出站 HTTPS | `commandcode.ai` | TCP 443 | 仅账户设置时 | 用户登录 Studio、查看/创建 API Key；运行期数据轮询不需要登录网页。 |
| 入站 / LAN | 无 | 无固定端口 | 不需要 | 监测助手只需发起出站请求，不需要公网端口映射、路由器端口转发或局域网监听。 |
| 本机回环 | `127.0.0.1` | 暂不定 | 视后续技术实现 | 若桌面 UI 与本机后端分进程并需要 HTTP 桥接，届时再选本机回环端口；优先使用动态空闲端口或桌面应用 IPC，并限制仅回环访问。现在无需开放/预留固定端口。 |

如所在网络使用代理或防火墙，只需允许应用向上述域名发起 TCP 443 出站连接。无需配置 Command Code API 的入站回调。

## 5. Token 和额度口径

- Command Code 的短周期上限以额度/费用衡量，不是固定 Token 数；相同 Token 数在不同模型、缓存读写比例和输入/输出构成下可能对应不同费用。
- 建议分别呈现“Token 汇总”和“额度窗口”：前者显示输入、输出及合计 Token；后者显示 5 小时/每周已用额度、上限与重置时间。
- 月度“剩余额度”不能直接等同于“剩余 Token”。除非取得当前套餐、模型价格及缓存计价口径，不应把费用余额换算成精确 Token 余额。
- 若接口只返回账期累积汇总，可由助手定期保存本地快照并计算新增量；应用关闭期间的细粒度变化不能仅靠快照还原。首次安装前的历史粒度也不能假设存在。

## 6. 建议的运行参数（待开发阶段验证）

- 轮询起点：每 60 秒刷新一次。该值是本地应用的初始建议，不是 Command Code 公布的 SLA 或限流承诺。
- 收到 `429` 时遵循 `Retry-After`（若返回）；网络错误或 `5xx` 使用逐步退避，不将失败伪装成零用量。
- 对每个接口单独处理缺字段/错误；保留最近一次成功数据并标注更新时间和数据来源。
- 本地历史仅保存展示所需的用量数字、时间戳、套餐/账期标识；无需保存 Prompt、补全内容或完整 API 请求体。

## 7. 开始实现前的检查清单

- [ ] 核实 Zcode 的 `Base URL` 和 Key 是否属于当前 Command Code 账户。
- [ ] 明确个人账户还是组织/团队账户，以及监测目标是个人还是组织汇总。
- [ ] 用户在本机安全输入/选择 API Key；不通过聊天收集密钥。
- [ ] 对 `/alpha/whoami`、`/alpha/billing/credits`、`/alpha/billing/subscriptions`、`/alpha/usage/summary` 执行只读验证，记录实际 HTTP 状态、字段结构、账期范围和是否需 `orgId`。
- [ ] 验证汇总 Token 数与网页 Usage 看板的一致性，并记录同步延迟、时间区和重置时间单位。
- [ ] 确认是否需要逐请求、分模型历史；若需要，再评估官方导出或稳定接口，不直接依赖私有网页 Cookie 接口。
- [ ] 仅在桌面端与本地后端的实现方案确定后，决定 IPC 或 `127.0.0.1` 动态端口，不开放到局域网。

## 8. 参考资料

### 官方资料

- [Command Code Provider API](https://commandcode.ai/docs/provider) — 公开模型 API、Bearer Key 认证、官方接口地址。
- [Command Code Studio](https://commandcode.ai/docs/studio) — Studio、API Keys 和 Usage 页面说明。
- [Pricing & Limits](https://commandcode.ai/docs/resources/pricing-limits) — 额度按费用衡量、5 小时/每周滚动窗口等说明。
- [Command Code CLI 使用文档：Slash Commands](https://commandcode.ai/docs/reference/slash-commands) — CLI `/usage` 命令说明。
- [Command Code 官方 CLI 仓库](https://github.com/CommandCodeAI/command-code) — 官方客户端代码与问题跟踪。

### 接口发现参考（非官方 API 契约）

- [公开 CLI 客户端接口映射](https://pkg.go.dev/github.com/xhd2015/agent-pro/agent/commandcode) — 将 `/alpha/whoami`、`/alpha/billing/credits`、`/alpha/billing/subscriptions`、`/alpha/usage/summary` 标为 CLI 使用的只读接口，并列出汇总响应映射。仅作预研参考，不能替代官方兼容性承诺。
- [官方仓库中的网页用量接口问题记录](https://github.com/CommandCodeAI/command-code/issues/546) — 提及 Studio 页面使用的 `/internal/usage`；此处仅用于识别内部接口，不表示该接口受到公开支持。

---


## 9. 本机只读验证结果（2026-09-23）

已使用 Zcode 本机配置中指向 `api.commandcode.ai` 的 Key，对以下端点进行只读 GET 验证。凭据值、账户身份和具体金额/Token 数没有写入文档或命令输出。

| 接口 | 结果 | 已确认的响应内容 |
|---|---:|---|
| `/alpha/whoami` | HTTP 200 | `success=true`；账户身份字段存在（已隐藏具体值）。 |
| `/alpha/billing/credits` | HTTP 200 | 月度/购买/免费额度字段，以及 5 小时和每周窗口的 `used`、`cap`、`resetAt` 字段均存在。 |
| `/alpha/billing/subscriptions` | HTTP 200 | 订阅状态、`planId`、账期开始/结束字段存在。 |
| `/alpha/usage/summary` | HTTP 200 | `totalCount`、`totalCost`、`totalTokensIn`、`totalTokensOut`、`totalTokens`、`periodBasis` 等汇总字段存在。 |

**结论：当前本机 Zcode 配置可以直接读取 Command Code 的账户用量与 Token 汇总，无需依赖网页登录 Cookie。** 本次只执行 GET 查询，没有调用模型生成接口或修改账户设置。接口属于 `/alpha/*` 非公开稳定契约，后续仍应对响应字段变化做兼容处理。

**本文件只完成接口与环境前置调研，不包含界面方案、交互稿、代码或安装包。**

