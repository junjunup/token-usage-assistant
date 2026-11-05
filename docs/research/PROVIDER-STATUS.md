# 服务商官方状态页（T14.3，D21 ③）

2026-11-05 调研：逐个请求各平台的状态页地址，看有没有不需要凭据、可机读的整体状态接口（Atlassian Statuspage 兼容的 `/api/v2/status.json`）。

| 平台（助手里的条目） | 状态页 | 可机读接口 | 结论 |
| --- | --- | --- | --- |
| Claude（Anthropic） | `https://status.claude.com`（`status.anthropic.com` 301 到这里） | `/api/v2/status.json` 200 | 接入 |
| Codex（OpenAI） | `https://status.openai.com` | `/api/v2/status.json` 200 | 接入 |
| Kimi 开放平台（Moonshot） | `https://status.moonshot.cn` | `/api/v2/status.json` 200 | 接入（`status.moonshot.ai` 连不上，国内 / 国际都用 `.cn`） |
| MiniMax | `https://status.minimax.io` | `/api/v2/status.json` 200 | 接入 |
| DeepSeek | `status.deepseek.com` | 连接超时；`/api/v2/summary.json` 404 | 不接 |
| OpenRouter | `status.openrouter.ai` | 网页可开，`/api/v2/status.json` 403 | 不接 |
| Command Code | `status.commandcode.ai` | 网页可开，没有 `/api/v2` | 不接 |
| OpenCode | `status.opencode.ai` | 网页可开，`/api/v2` 404 | 不接 |
| GLM（智谱 / Z.ai） | `status.bigmodel.cn` 301 到首页；`status.z.ai` 连不上 | — | 不接 |
| 火山、硅基流动、阶跃星辰、ZenMux | 没有找到可用的状态页接口 | — | 不接 |

只读 `status.indicator`（`none` / `minor` / `major` / `critical` / `maintenance`），界面文字由助手自己给出，不显示服务端的英文描述；其他取值视为格式不兼容（显示「—」）。Kimi Code 订阅不走开放平台，不显示 Moonshot 的状态。

实测（2026-11-05，Electron `net.fetch`，经本机代理）：四个接口都能读到；Claude 第一次请求超时一次（保留上次结果的路径），MiniMax 约 9 秒，超时定为 15 秒。
