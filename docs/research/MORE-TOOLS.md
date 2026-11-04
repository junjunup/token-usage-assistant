# 更多本机工具调研（T13.2，2026-11-03 / 11-05）

依据：各工具官方仓库源码（经 GitHub API 读取）、tokscale / CodeBurn 的数据位置说明。没有在本机装这些工具实测。

| 工具 | 活跃度 | 本机数据 | 用量粒度 | 结论 |
|---|---|---|---|---|
| Cline（VS Code，71k★） | 活跃 | 旧：`<VS Code globalStorage>/saoudrizwan.claude-dev/tasks/<id>/ui_messages.json`，`say: "api_req_started"` 的 `text` 是 JSON 字符串：`tokensIn` / `tokensOut` / `cacheWrites` / `cacheReads` / `cost`（`ClineApiReqInfo`，`apps/vscode/src/shared/ExtensionMessage.ts`），同一字符串里还有 `request`（提示内容）。新：迁移到 SDK 存储 `~/.cline/data`（`sdk/packages/core/src/session/`，`sessions.index.json` 等），用量字段位置未确认 | 逐请求（旧格式） | 可做，但正处在存储迁移中；新格式要再读 SDK 源码 |
| Roo Code | **仓库 2026-05 归档** | 同 Cline 旧格式，`rooveterinaryinc.roo-cline/tasks/` | 逐请求 | 与 Cline 旧格式共用读取器即可，零额外成本 |
| Kilo Code（27.8k★） | 活跃 | 新版改为 OpenCode 系：`~/.local/share/kilo/kilo.db`（SQLite）；旧 `kilocode.kilo-code/tasks/ui_messages.json` 只在迁移代码里 | 待确认（很可能与 OpenCode 相同，可复用 OpenCode 读取器） | 可做，先确认 kilo.db 是否与 OpenCode 结构一致 |
| Goose（56k★，Apache-2.0） | 活跃 | `~/.local/share/goose/sessions/sessions.db`（Windows `%APPDATA%\Block\goose\data\sessions\sessions.db`），`sessions` 表 `accumulated_input/output/cache_read/cache_write/total_tokens`、`accumulated_cost`、`provider_name`、`created_at` / `updated_at`（`crates/goose/src/session/session_manager.rs`） | **只有会话级累计** | 可做；每个会话一行汇总 |
| Crush（28.9k★） | 活跃 | 每个项目一个 `.crush/crush.db`，项目清单在 `~/.local/share/crush/projects.json`；`sessions` 表 `prompt_tokens` / `completion_tokens` / `cost` / `created_at`，`parent_session_id` 为子会话（`internal/db/sql/stats.sql`） | **只有会话级累计** | 可做；要先读项目清单再逐个打开数据库 |
| GitHub Copilot CLI | 活跃，闭源 | `~/.copilot/session-store.db` 或自配 OTEL 文件 | 未知 | 没有可读的官方源码，不做 |
| Grok Build | 未确认开源 | `~/.grok/sessions/*/*/updates.jsonl` | 未知 | 暂不做 |
| MiniMax Code | — | 本机没有会话日志（tokscale 靠捕获 `--output-format stream-json`） | — | 读不到，不做 |
| Cursor | — | 用量只在云端接口，本机 `state.vscdb` 只有登录令牌 | — | 读不到（读令牌违反红线），不做 |

## 结论（2026-11-05 实现）

- **Cline**：只读 SDK 存储（`~/.cline/data/sessions/<id>/<id>.messages.json`，官方 `sdk/packages/core/docs/messages-contract-v1.md`）。每轮最后一条助手消息的 `metrics`（`inputTokens`、`outputTokens`、`cacheReadTokens`、`cacheWriteTokens`、`cost`）与 `modelInfo`；`inputTokens` 是「服务商报告的输入」（`sdk/packages/llms/src/providers/stream.ts`），是否含缓存因服务商而异，所以缓存不计入。旧版 `ui_messages.json` 不读：计数在 `api_req_started` 的 `text` 字符串里，同一字符串含提示内容。
- **Kilo Code**：`kilo.db` 与 OpenCode 同结构（`packages/core/src/session/sql.ts` 的 session / message / part / session_message 表），复用 OpenCode 读取器。
- **Goose / Crush**：会话级汇总（用户 2026-11-05 同意，D20 ④）。Crush 只取 `parent_session_id IS NULL` 的会话（与 Crush 自己的统计一致）；每个项目的数据库由用户逐个选择，不顺着 `projects.json` 读别处。
- **Roo Code**：仓库已归档、只有旧格式，不做。
