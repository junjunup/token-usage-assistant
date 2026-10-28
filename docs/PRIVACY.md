# 隐私说明 / Privacy

[中文](#中文) · [English](#english)

## 中文

Token 用量助手是本机桌面工具：只**读取**你已连接的平台账户的用量与额度，以及你选择的本机编程工具的**用量元数据**。它没有服务器，不收集遥测，不调用任何模型。

### 读什么

**平台账户**（只读接口，固定官方地址，你在应用里自己填写密钥）：

| 平台 | 读取内容 | 访问地址 |
|---|---|---|
| Command Code | 用量与额度 | `api.commandcode.ai` |
| GLM（智谱 / Z.ai） | 套餐额度窗口 | `open.bigmodel.cn` / `api.z.ai` |
| MiniMax | 套餐剩余额度 | `api.minimaxi.com` / `api.minimax.io` |
| 火山方舟 | AFP 套餐用量（北京区） | `ark.cn-beijing.volcengineapi.com` |
| DeepSeek | 账户余额 | `api.deepseek.com` |
| Kimi 开放平台 | 可用余额、代金券余额、现金余额 | 国内 `api.moonshot.cn` / 国际 `api.moonshot.ai`（按你选的站点） |
| OpenCode Go | 三个周期的用量百分比 | `opencode.ai` |
| Codex 订阅 | 账户与额度窗口 | 不联网；只调用本机官方 Codex 程序的 4 个只读方法 |
| Claude 订阅 | 额度窗口 | 不联网；来自你用生成的启动脚本运行的 Claude Code 状态栏 |

**本机编程工具**（只读，只取白名单里的元数据：时间、模型、项目目录、会话标识、Token 计数、请求状态）：

- Zcode、OpenCode：只读打开它们的数据库，不修改。
- Codex：读取本机 rollout 文件中的用量快照。
- Claude Code：只采集你通过生成的启动脚本运行之后的用量事件；本机组件只监听 `127.0.0.1`。
- DeepSeek Harness：可选插件，只导出启用之后的用量元数据。

### 不读什么

对话正文、提示词、模型回复、工具调用的参数和结果、原始请求内容、原始错误信息，以及除你在应用里填写的密钥以外的任何凭据。应用不会调用模型、不会购买或修改账户、不会消耗你的额度，也不会改动第三方工具的数据或全局配置。

### 数据存在哪

全部保存在本机，不上传：

- macOS：`~/Library/Application Support/TokenUsageAssistant/`；Windows：系统应用数据目录（`%APPDATA%`）下本应用的文件夹。
- 其中：`accounts.encrypted.json`（密钥，用 macOS 钥匙串 / Windows DPAPI 加密）、`settings.json`（设置）、`history.sqlite`（账户用量采样）、`tool-usage.sqlite` 与 `tool-sources.json`（工具元数据索引与来源设置）、`logs/`（运行日志，不含密钥和对话内容）、`claude-collector/`（Claude 采集组件的本机配置）。
- DeepSeek Harness 插件的导出：`~/.token-usage-assistant/harness/`。
- 为了在工具升级后提示「数据字段有变化」，应用会记录 Codex 与 Claude Code 用量记录里**用量计数的字段名**（例如 `input_tokens`），不记录任何值；含有内容、凭据含义的名字一律不记。它们和来源状态一起保存在上面的目录里，也会出现在诊断信息中。

### 联网

- 只访问你已连接平台的上述官方地址。
- 检查更新：启动时和每 24 小时访问一次 GitHub 的公开版本列表（`api.github.com`），不发送账户或设备信息；可在「账户与设置」里关闭。
- 没有统计、遥测或广告。

### 诊断信息

只有你点「导出诊断信息」时才生成，保存前先完整预览：版本、系统、设置、各账户与工具来源的状态，以及最近 500 行日志。不含密钥、对话内容或原始错误文本。是否发给别人由你决定。

### 怎么删除

- 删除某个连接：应用会删除该连接的密钥、用量快照和采样历史。
- 完全卸载：删除应用，再删除上面的数据目录；用过 Harness 插件的，再删除 `~/.token-usage-assistant/`，并在 Harness 中卸载插件。

---

## English

Token Usage Assistant is a local desktop app. It only **reads** usage and quota from the platform accounts you connect, and **usage metadata** from the local coding tools you choose. There is no server, no telemetry, and it never calls a model. (The app's interface is currently Chinese only.)

### What it reads

**Platform accounts** — read-only endpoints at fixed official addresses; you enter the keys in the app yourself:

| Platform | What | Address |
|---|---|---|
| Command Code | usage and quota | `api.commandcode.ai` |
| GLM (Zhipu / Z.ai) | plan quota windows | `open.bigmodel.cn` / `api.z.ai` |
| MiniMax | remaining plan quota | `api.minimaxi.com` / `api.minimax.io` |
| Volcengine Ark | AFP plan usage (Beijing) | `ark.cn-beijing.volcengineapi.com` |
| DeepSeek | account balance | `api.deepseek.com` |
| Kimi open platform | available, voucher and cash balance | China `api.moonshot.cn` / international `api.moonshot.ai` (the site you choose) |
| OpenCode Go | usage percentages of three periods | `opencode.ai` |
| Codex subscription | account and quota windows | no network; four read-only methods of the official local Codex program |
| Claude subscription | quota windows | no network; from the Claude Code status line when you start it with the generated launcher |

**Local coding tools** — read-only, an allowlist of metadata only (time, model, project folder, session id, token counts, request status):

- Zcode, OpenCode: their databases are opened read-only and never modified.
- Codex: usage snapshots in local rollout files.
- Claude Code: only usage events after you start it with the generated launcher; the local component listens on `127.0.0.1` only.
- DeepSeek Harness: an optional plugin exports usage metadata from the time it is enabled.

### What it never reads

Conversation text, prompts, model replies, tool arguments and results, raw requests, raw error messages, and any credential other than the keys you enter in the app. It never calls a model, buys anything, changes an account, spends your quota, or changes another tool's data or global settings.

### Where data is stored

Only on your computer:

- macOS: `~/Library/Application Support/TokenUsageAssistant/`; Windows: the app's folder under `%APPDATA%`.
- `accounts.encrypted.json` (keys, encrypted with the macOS Keychain / Windows DPAPI), `settings.json`, `history.sqlite` (account usage samples), `tool-usage.sqlite` and `tool-sources.json` (tool metadata index and source settings), `logs/` (no keys or conversation content), `claude-collector/` (local Claude component settings).
- DeepSeek Harness plugin exports: `~/.token-usage-assistant/harness/`.
- To show "data fields changed" after a tool update, the app keeps the **names of usage counters** in Codex and Claude Code records (e.g. `input_tokens`), never their values; names that suggest content or credentials are never kept. They are stored with the source status in the folder above and appear in diagnostics.

### Network

- Only the official addresses above, for the platforms you connect.
- Update check: at start and every 24 hours, GitHub's public release list (`api.github.com`), sending no account or device information; it can be turned off in settings.
- No analytics, telemetry or ads.

### Diagnostics

Created only when you choose "导出诊断信息" (export diagnostics), with a full preview before saving: version, system, settings, the status of each account and tool source, and the last 500 log lines. No keys, conversation content or raw error text. Sharing it is up to you.

### Deleting data

- Removing a connection deletes its key, usage snapshots and sample history.
- Full removal: delete the app and the data folder above; if you used the Harness plugin, also delete `~/.token-usage-assistant/` and remove the plugin in Harness.
