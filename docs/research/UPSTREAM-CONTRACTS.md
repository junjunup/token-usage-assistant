# 上游工具的稳定读取途径与契约初稿（T9.12，D15）

> 2026-10-27，只读调研：没有登录任何工具，没有调用模型，没有读取对话内容（本机 rollout 只统计字段名与版本号）。下载的官方包只解压、比对类型定义；用来导出协议定义的 Codex 程序使用临时的隔离 `CODEX_HOME`。

## 结论一览

| 工具 | 我们读的数据 | 能否自动比对 | 依据 | 建议 |
|---|---|---|---|---|
| Codex 额度窗口 | app-server `account/rateLimits/read` 的 `rateLimits.primary` / `secondary`（`usedPercent`、`windowDurationMins`、`resetsAt`） | **能** | 官方程序 `codex app-server generate-json-schema --out <目录>` 离线导出完整协议定义（0.159.2：39 个文件、651 个类型），其中 `RateLimitSnapshot`、`RateLimitWindow` 正好包含这些字段，`usedPercent` 为必填 | T9.15：CI 下载新版官方包导出定义，比对这几个类型 |
| Codex 本机用量（rollout） | `event_msg` / `token_count` 的 `info.total_token_usage` 与 `last_token_usage`（`input_tokens`、`cached_input_tokens`、`cache_write_input_tokens`、`output_tokens`、`reasoning_output_tokens`、`total_tokens`），`session_meta` 的 `id`、`cwd`、`cli_version` | **不能直接比对**：rollout 是内部保存格式，不在协议定义里 | 协议里的 `TokenUsageBreakdown`（`inputTokens`、`cachedInputTokens`、`cacheWriteInputTokens`、`outputTokens`、`reasoningOutputTokens`、`totalTokens`）与 rollout 字段一一对应，字段含义有官方定义；本机最近 40 个 rollout 全是 0.159.2，`token_count` 的字段与读取端期望**完全一致**（只有我们不用的 `model_context_window` 有时为 null） | 契约按结构判断（T9.13）+ 结构指纹（T9.14）；CI 比对 `TokenUsageBreakdown` 作为含义没变的旁证 |
| Claude 额度窗口 | 状态栏输入 JSON 的 `rate_limits.five_hour` / `seven_day`（`used_percentage`、`resets_at` 为秒级时间戳） | **不能** | `@anthropic-ai/claude-code` npm 包只是 204 KB 的安装壳（实际程序是按平台下载的二进制），`sdk-tools.d.ts` 里没有状态栏类型；`@anthropic-ai/claude-agent-sdk` 的 `sdk.d.ts` 只在注释里提到 `StatusLineCommandInput`，另有一个 `SDKControlGetUsageResponse`（字段是 `utilization` 与 ISO 时间字符串，形状不同，而且要在已登录的会话里才能取到） | 只能靠契约 + 结构指纹；官方文档页可以每周取一次相关段落做变化提醒（可选） |
| Claude 本机用量（OTLP） | `api_request` / `api_error` 事件的 `input_tokens`、`output_tokens`、`cache_read_tokens`、`cache_creation_tokens`、`model`、`session.id` 等白名单属性 | **不能** | 遥测事件只有文档说明，没有可机读定义 | 同上 |
| DeepSeek Harness | 导出插件写的 JSONL（插件是我们自己的） | **能** | 官方运行时可离线安装并跑契约测试；本次用 0.2.1-rc.3 运行时直接跑现有的两项运行时测试，**全部通过** | T9.15：新版本出现时 CI 自动装官方运行时跑测试 |

## 顺带发现

- Codex 协议里有一个**账户级用量查询**（`GetAccountTokenUsage`：每日用量桶 + 汇总）。它可能比 rollout 更稳定，但需要另行确认是否只读、是否算在我们的方法白名单里（目前白名单只有 4 个只读方法），**不在本阶段使用**，记为以后的候选。
- Codex 协议里还有**消耗额度重置次数**的接口（`ConsumeAccountRateLimitResetCredit`）。这会改变账户状态，**永远不能调用**；现有白名单已经排除，T9.13 的契约测试里加一条断言防止误加。
- 本机装的 Codex CLI 是 ChatGPT.app 自带的 0.159.2（`/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex`）；npm 上最新是 0.164.0。现在 0.159.2 的数据被标「版本未验证」，原因只是版本号不在 0.155.x，结构完全一样——这正是 D15 要去掉的噪音。

## 契约初稿（交给 T9.13 实现）

每个来源分三层：**核心字段**缺了就无法计数，整条记录按「格式不兼容」处理；**可选字段**缺了显示「—」，来源状态为「部分字段缺失」；**语义约束**违反时整条记录拒绝。

### Codex rollout（`token_count`）
- 核心：`last_token_usage.input_tokens`、`output_tokens`、`total_tokens`（非负整数）；`total_token_usage` 同样三项；会话标识。
- 可选：`cached_input_tokens`、`cache_write_input_tokens`、`reasoning_output_tokens`；`cwd`（项目）；`model`。
- 约束：累计 `total_tokens` 不回退（现有规则）；`cached_input_tokens ≤ input_tokens`；`reasoning_output_tokens ≤ output_tokens`；`total_tokens ≥ output_tokens`。（`input_tokens` 是否已包含缓存读写，以读取端现有口径为准，T9.13 实现时用现有测试样例确认，不改口径。）

### Codex 额度（`rateLimits`）
- 核心：至少一个窗口有 `usedPercent`（0–100）。
- 可选：`windowDurationMins`（决定窗口名称，缺失时只显示「额度窗口」）、`resetsAt`（缺失显示「重置时间暂未返回」）。
- 约束：`usedPercent` 在 0–100；`resetsAt` 为正的秒级时间戳。

### Claude 状态栏（`rate_limits`）
- 核心：`five_hour` 与 `seven_day` 至少一个存在，且 `used_percentage` 在 0–100。
- 可选：另一个窗口；`resets_at`。
- 约束：`resets_at` 为正的秒级时间戳；不使用 `context_window` 等非额度字段。

### Claude OTLP（`api_request` / `api_error`）
- 核心：事件名、`session.id`、时间；`api_request` 的 `input_tokens`、`output_tokens`。
- 可选：`cache_read_tokens`、`cache_creation_tokens`、`model`、`request_id`。
- 约束：计数非负；`api_error` 不要求用量字段。

### DeepSeek Harness（导出 JSONL）
- 维持现状：导出器在插件端已经逐事件严格校验，读取端按 JSONL 协议 v1 校验；T9.13 只把状态改成三档、去掉按版本号的标签。

## 对 T9.13–T9.15 的影响

- T9.13 可以按上面的初稿实现；「部分字段缺失」主要会出现在 Codex 和 Claude 的可选计数（缓存、推理）上。
- T9.14 的字段名指纹对 Claude（没有任何可机读定义）最有价值。
- T9.15：Harness、Codex 额度可以做成自动检查；Codex rollout 只能比对协议里的 `TokenUsageBreakdown` 作为旁证；Claude 只能（可选）监控官方文档页的变化。

## 自动兼容性检查（T9.15 已实现）

每周的「Upstream versions」工作流（`.github/workflows/upstream.yml`）在版本检查（T9.1）之后运行 `scripts/upstream-compat.cjs`：最新版本超出代码里已复核列表的工具，在临时目录安装官方包（`--ignore-scripts`，不登录、不调用模型、不使用任何密钥），检查后删除临时目录。报告只写进任务摘要，只含方法名、字段名和测试计数，不含上游的原始输出。

| 工具 | 检查方式 | 不兼容时 |
|---|---|---|
| Codex | 隔离的 `CODEX_HOME` 下运行 `codex app-server generate-json-schema`，核对 4 个只读方法（`initialize`、`initialized`、`account/read`、`account/rateLimits/read`）、`GetAccountRateLimitsResponse` / `RateLimitSnapshot` / `RateLimitWindow`（`usedPercent` 必填）、`Account` 的 chatgpt 类型，以及 `TokenUsageBreakdown` 的 6 个计数（rollout 字段含义的旁证；rollout 本身不在协议里） | 列出缺少的方法 / 类型 / 字段，任务失败（GitHub 会通知仓库所有者） |
| DeepSeek Harness | 安装官方 `@deepseek-ai/dsh`，用它自带的 SessionStore 与 Cordis 跑 `tests/harness-plugin.test.cjs` 的 3 项运行时测试（环境变量 `TUA_HARNESS_CANDIDATE_VERSION`、`TUA_HARNESS_CANDIDATE_RUNTIME`） | 列出通过 / 失败数，任务失败 |
| Claude Code | 做不了：状态栏与 OTLP 事件没有官方可机读定义 | 报告写明「无法自动检查」，靠读取端契约（T9.13）与字段名指纹（T9.14） |

安装或导出失败记为「无法检查」，不算兼容，也不让任务失败。手动运行时可以在工作流输入里指定要检查的 Codex / Harness 版本（不受已复核列表限制）。

2026-10-27 首次运行：本机与 GitHub（Ubuntu）上 Codex 0.164.0 均兼容，Harness 0.2.1-rc.4 的 3 项运行时测试均全部通过（对照：已复核的 0.2.1-rc.2 同样通过）。CI 上第一次运行时 Harness 的 CLI 测试失败，原因是工作流没装 pnpm（官方 CLI 安装插件需要），已补上；缺 pnpm 时脚本记为「无法检查」，不再误报为不兼容。
