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
| OpenRouter | 这把 Key 的花费上限、预算和已报告花费（USD）；接口同时返回的 Key 名称、用户 / 组织 / 工作区编号等不保存 | `openrouter.ai` |
| 硅基流动 | 总余额、赠金余额、充值余额；接口同时返回的用户编号、名称、邮箱等不保存 | 国内 `api.siliconflow.cn` / 国际 `api.siliconflow.com`（按你选的站点） |
| 阶跃星辰 | 可用余额、账户类型（预付费 / 后付费） | `api.stepfun.com` |
| ZenMux | 订阅的 5 小时与 7 天额度比例和重置时间、套餐档位、账户状态；按量余额（USD）。用你在 ZenMux 控制台创建的 Management API Key，只调用两个只读查询接口 | `zenmux.ai` |
| OpenCode Go | 三个周期的用量百分比 | `opencode.ai` |
| Kimi Code 订阅 | 5 小时、每周与每月额度的百分比和重置时间、会员等级；**非官方接口**（Kimi 没有公开文档，字段来自第三方工具的整理） | 国内 `api.kimi.com` / 国际 `api.kimi.ai`（按你选的站点） |
| Codex 订阅 | 账户与额度窗口 | 不联网；只调用本机官方 Codex 程序的 4 个只读方法 |
| Claude 订阅 | 额度窗口 | 不联网；来自你用生成的启动脚本运行的 Claude Code 状态栏，或（你在应用里点「接入所有会话」并确认后）任何方式打开的 Claude Code 会话的状态栏。开启「Claude Code 状态栏」设置后（默认关闭），本机助手把算好的一行文字（本会话额度和最紧的其他账户，例如「Claude 5h 60% · 最紧 GLM 62%」）回给状态栏显示，只在本机回环地址之间传递 |

**本机编程工具**（只读，只取白名单里的元数据：时间、模型、项目目录、会话标识、Token 计数、请求状态）：

- 发现本机工具（T12.6）：打开「本机工具」列表时，只检查几个工具的默认位置是否存在（如 `~/.codex/sessions`、`~/.gemini/tmp`、`~/.kimi-code/sessions`、`~/.qwen/projects`、`~/.local/share/opencode/opencode.db`），不读取其中任何文件；找到的工具仍要你在系统文件选择框里确认后才会添加。
- Zcode、OpenCode：只读打开它们的数据库，不修改。
- Codex：读取本机 rollout 文件中的用量快照。
- Kimi Code CLI：读取 `~/.kimi-code/sessions/` 下各会话 `wire.jsonl` 里的 `usage.record` 用量记录（每次模型调用的未缓存输入、输出、缓存读写计数、模型名、时间、agent 编号）；同一文件里的对话、工具调用和供应商原始 usage 一律跳过，不解码、不保存。
- Qwen Code：读取 `~/.qwen/projects/<项目>/chats/`（旧版为 `~/.qwen/tmp/`）下会话文件里每条模型回复的用量计数（输入、输出、缓存、思考、总量）、模型名、时间和编号；提示词、回复、思考过程和工具调用一律跳过，不解码、不保存。
- Cline（T13.2）：读取你选择的 Cline 数据目录（通常是 `~/.cline/data`）里 `sessions/<会话>/<会话>.messages.json` 中每轮最后一条回复的用量计数（输入、输出）和模型名；提示词、回复、思考、工具内容不解码。旧版任务（`ui_messages.json`）不读取。
- Kilo Code（T13.2）：只读打开你选择的 `kilo.db`（通常在 `~/.local/share/kilo/`），与 OpenCode 相同的白名单投影。
- Goose、Crush（T13.2）：只读打开你选择的 Goose `sessions.db` 或某个项目的 Crush `.crush/crush.db`，只选每个会话的累计输入、输出、更新时间、模型名（Goose 还有服务商与工作目录）；会话名、描述、配方、对话内容不读取。它们只有会话级汇总，不是请求数。
- Gemini CLI：读取 `~/.gemini/tmp/<项目>/chats/` 下会话文件里每条模型回复的用量计数（输入、输出、缓存、思考、总量）、模型名、时间和编号；同一文件里的提示词、回复、思考过程、工具调用和摘要一律跳过，不解码、不保存。
- Claude Code：只采集你通过生成的启动脚本运行之后的用量事件；本机组件只监听 `127.0.0.1`。
- Claude Code 会话日志（T14.1，可选，由你添加）：读取 `~/.claude/projects/` 下 Claude Code 自己写的会话文件里每次模型回复的用量计数（输入、输出、缓存读写、思考）、模型名、时间、会话编号、消息与请求编号；提示词、回复、思考过程、工具调用、工作目录和分支一律跳过，不解码、不保存。与启动脚本来源同时启用时按请求编号去重。
- 接入所有 Claude Code 会话（T13.1，可选）：只有你在「账户与设置 → 账户连接」点「接入所有会话」并在确认框里同意后，应用才修改 Claude Code 的用户设置 `~/.claude/settings.json`（设置了 `CLAUDE_CONFIG_DIR` 时用那里的）里的 `statusLine` 一项，其他设置原样保留。修改前把原文件备份到上面的 `claude-collector/`；你原来的状态栏命令会继续运行（macOS；Windows 上已有自己的状态栏时不接入）。点「还原」放回原来的 `statusLine`。这样只多采集额度窗口，不加遥测设置；逐请求的 Token 明细来自启动脚本打开的会话，或你另外添加的「Claude Code 会话日志」来源。
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
- 下载更新（只有 Windows 安装版，T12.8）：只有你在「检查更新」里点了「下载并安装」，才从安装包仓库 `junjunup/TokenUsageAssistant` 的发布页（`github.com` 及其下载服务器）读取更新说明文件并下载新版安装包，核对说明文件里的 SHA-512 后存到本机的 `%LOCALAPPDATA%\commandcode-companion-updater`；再点「重启并安装」才运行安装程序（带正常的安装界面）。不发送账户或设备信息，不会自动下载，也不会在退出时自动安装。安装包没有代码签名，校验值和安装包来自同一个发布页，可信程度与你手动从那里下载相同。便携版和 Mac 版只提示，不下载。
- 服务商状态（T14.3，默认关闭）：只有你在「账户与设置 → PREFERENCES」打开「服务商状态」后，应用才每 5 分钟访问一次你已连接平台的公开状态页：Anthropic `status.claude.com`、OpenAI `status.openai.com`、Moonshot `status.moonshot.cn`、MiniMax `status.minimax.io`（只读 `/api/v2/status.json` 里的整体状态）。地址固定在应用里，请求不带任何凭据、Cookie 或账户信息，不跟随重定向；其他平台不访问。关闭后不再访问，也不保留结果。
- 没有统计、遥测或广告。

### 诊断信息

只有你点「导出诊断信息」时才生成，保存前先完整预览：版本、系统、设置、各账户与工具来源的状态，以及最近 500 行日志。不含密钥、对话内容或原始错误文本。是否发给别人由你决定。

### 导出用量明细（CSV）

只有你在「用量分析 → 工具分析」点「导出 CSV」时才生成，保存到你在系统保存框里选的位置。内容是当前时间范围、来源和筛选下的本机工具用量记录：时间、工具、数据源名称、记录单位、状态、服务商、模型、项目路径、会话编号、各项 Token 计数、按你的单价估算的费用和关联的计费账户。不含密钥、提示词、回复或请求编号；缺失的计数留空，不写 0。

### 命令行读取额度

默认关闭。只有你在「账户与设置 → PREFERENCES」打开「命令行读取额度」后，应用才在数据目录的 `cli/` 里保存 `status.json` 与 `status.txt`（全部账户的额度百分比、重置时间、余额金额和更新时间，账户名称为你起的备注），并放一个只打印这两个文件的命令（Mac `tua-status`，Windows `tua-status.cmd` 与 `tua-status.ps1`）。不含密钥或账户身份信息，不开放网络端口；关闭这一项会删除这些文件。

### 怎么删除

- 删除某个连接：应用会删除该连接的密钥、用量快照和采样历史。
- 完全卸载：删除应用，再删除上面的数据目录；用过 Harness 插件的，再删除 `~/.token-usage-assistant/`，并在 Harness 中卸载插件。

---

## English

Token Usage Assistant is a local desktop app. It only **reads** usage and quota from the platform accounts you connect, and **usage metadata** from the local coding tools you choose. There is no server, no telemetry, and it never calls a model. (The interface follows your system language, Chinese or English.)

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
| OpenRouter | this key's spend limit, budgets and reported spend (USD); the key label and user / organization / workspace ids it also returns are not kept | `openrouter.ai` |
| SiliconFlow | total, granted and topped-up balance; the user id, name, email etc. it also returns are not kept | China `api.siliconflow.cn` / international `api.siliconflow.com` (the site you choose) |
| StepFun | available balance, account type (prepaid / postpaid) | `api.stepfun.com` |
| ZenMux | subscription 5-hour and 7-day usage fractions and reset times, plan tier, account status; pay-as-you-go balance (USD). Uses the Management API Key you create in the ZenMux console and calls only two read-only endpoints | `zenmux.ai` |
| OpenCode Go | usage percentages of three periods | `opencode.ai` |
| Kimi Code subscription | percentages and reset times of the 5-hour, weekly and monthly quotas, membership level; an **unofficial endpoint** (Kimi publishes no documentation; the fields come from third-party tools) | China `api.kimi.com` / international `api.kimi.ai` (the site you choose) |
| Codex subscription | account and quota windows | no network; four read-only methods of the official local Codex program |
| Claude subscription | quota windows | no network; from the Claude Code status line when you start it with the generated launcher, or (after you click "接入所有会话" and confirm) in every Claude Code session. With the "Claude Code status line" setting on (off by default), the assistant sends a computed line back for the status line to show (this session's quota and the tightest other account, e.g. "Claude 5h 60% · 最紧 GLM 62%"), over the loopback address only. |

**Local coding tools** — read-only, an allowlist of metadata only (time, model, project folder, session id, token counts, request status):

- Finding local tools (T12.6): when the local tools list opens, the app only checks whether a few default locations exist (such as `~/.codex/sessions`, `~/.gemini/tmp`, `~/.kimi-code/sessions`, `~/.qwen/projects`, `~/.local/share/opencode/opencode.db`) and reads no file in them; a found tool is added only after you confirm it in the system file dialog.
- Zcode, OpenCode: their databases are opened read-only and never modified.
- Codex: usage snapshots in local rollout files.
- Kimi Code CLI: the `usage.record` entries in each session's `wire.jsonl` under `~/.kimi-code/sessions/` (per model call: uncached input, output, cache read / write counts, model name, time, agent id); conversations, tool calls and the provider's raw usage in the same files are skipped, never decoded or kept.
- Qwen Code: for each model reply in the session files under `~/.qwen/projects/<project>/chats/` (older versions: `~/.qwen/tmp/`), its usage counts (input, output, cached, thoughts, total), model name, time and id; prompts, replies, thoughts and tool calls are skipped, never decoded or kept.
- Cline (T13.2): in the Cline data folder you choose (usually `~/.cline/data`), `sessions/<id>/<id>.messages.json`: for the last reply of each turn, its usage counts (input, output) and model; prompts, replies, thinking and tool content are not decoded. Older tasks (`ui_messages.json`) are not read.
- Kilo Code (T13.2): the `kilo.db` you choose (usually in `~/.local/share/kilo/`), opened read-only with the same whitelisted projection as OpenCode.
- Goose, Crush (T13.2): the Goose `sessions.db` or a project's Crush `.crush/crush.db` you choose, opened read-only; only each session's accumulated input, output, update time and model (Goose also provider and working folder). Session names, descriptions, recipes and conversation content are not read. These are session totals, not requests.
- Gemini CLI: for each model reply in the session files under `~/.gemini/tmp/<project>/chats/`, its usage counts (input, output, cached, thoughts, total), model name, time and id; prompts, replies, thoughts, tool calls and summaries in the same files are skipped, never decoded or kept.
- Claude Code: only usage events after you start it with the generated launcher; the local component listens on `127.0.0.1` only.
- Claude Code session logs (T14.1, optional, added by you): for each model reply in the session files Claude Code itself writes under `~/.claude/projects/`, its usage counts (input, output, cache reads / writes, thinking), model name, time, session id and message / request ids; prompts, replies, thinking, tool calls, working directory and branch are skipped, never decoded or kept. When the launcher source is also on, requests are de-duplicated by request id.
- Connecting every Claude Code session (T13.1, optional): only after you click "接入所有会话" under 账户与设置 → 账户连接 and agree in the confirmation does the app change the `statusLine` entry of Claude Code's user settings `~/.claude/settings.json` (or the one in `CLAUDE_CONFIG_DIR`), keeping every other setting. The original file is backed up into `claude-collector/` first; your own status-line command keeps running (macOS; on Windows an existing status line is left alone and nothing is connected). "还原" (restore) puts the previous `statusLine` back. This adds quota windows only, no telemetry settings; per-request token details come from sessions started with the launcher, or from the "Claude Code session logs" source if you add it.
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
- Downloading an update (Windows installed build only, T12.8): only after you click "下载并安装" (download and install) does the app read the update description from the installer repository `junjunup/TokenUsageAssistant` (`github.com` and its download servers), download the new installer, check its SHA-512 and keep it in `%LOCALAPPDATA%\commandcode-companion-updater`; the installer (with its normal window) runs only after a second click. No account or device information is sent, nothing downloads on its own and nothing installs on quit. The installers are not code-signed: the checksum comes from the same release page, the same trust as downloading it there yourself. The portable and Mac builds only tell you.
- Provider status (T14.3, off by default): only after you turn on "服务商状态" under 账户与设置 → PREFERENCES does the app, every 5 minutes, read the public status page of the platforms you connected: Anthropic `status.claude.com`, OpenAI `status.openai.com`, Moonshot `status.moonshot.cn`, MiniMax `status.minimax.io` (only the overall status in `/api/v2/status.json`). The addresses are fixed in the app; requests carry no credentials, cookies or account information and follow no redirects; other platforms are not contacted. Turning it off stops the requests and keeps nothing.
- No analytics, telemetry or ads.

### Diagnostics

Created only when you choose "导出诊断信息" (export diagnostics), with a full preview before saving: version, system, settings, the status of each account and tool source, and the last 500 log lines. No keys, conversation content or raw error text. Sharing it is up to you.

### Usage export (CSV)

Created only when you click "导出 CSV" (export CSV) under 用量分析 → 工具分析, and saved where you choose in the system save dialog. It holds the local tool usage records of the current range, sources and filters: time, tool, source name, record unit, status, provider, model, project path, session id, token counts, the cost estimated from your own prices and the linked billing account. No keys, prompts, replies or request ids; a missing count is an empty cell, never 0.

### Command-line quota

Off by default. Only after you turn on "命令行读取额度" under 账户与设置 → PREFERENCES does the app keep `status.json` and `status.txt` in `cli/` inside its data folder (every account's quota percentages, reset times, balance amounts and update times, with the account names you gave them) and put a command there that only prints these files (macOS `tua-status`, Windows `tua-status.cmd` and `tua-status.ps1`). No keys or account identities, no network port; turning it off deletes these files.

### Deleting data

- Removing a connection deletes its key, usage snapshots and sample history.
- Full removal: delete the app and the data folder above; if you used the Harness plugin, also delete `~/.token-usage-assistant/` and remove the plugin in Harness.
