# 项目交接：当前状态快照

> 更新：2026-10-16。本文只写**当前**状态；版本历史见 [CHANGELOG.md](CHANGELOG.md)，旧交接原文见 [docs/history/PROJECT_HANDOFF-through-1.8.0-beta.5.md](docs/history/PROJECT_HANDOFF-through-1.8.0-beta.5.md)。
> 规则见 [AGENTS.md](AGENTS.md)；进行中的工作见 [IMPROVEMENT_PLAN.md](IMPROVEMENT_PLAN.md)；Mac 灵动岛设计见 [docs/island-1.9.0-design/HANDOFF.md](docs/island-1.9.0-design/HANDOFF.md)。

## 1. 当前版本与环境

- 版本：`1.8.0-beta.6`（`package.json`）。阶段 3（T3.1–T3.4）已完成，按 D3 升为 beta.6；阶段 4 结束时升为 beta.7。
- 开发机：用户的 Apple Silicon Mac（macOS 15.7.9，Node 24.21.0，pnpm 11.19.0）。项目路径：`~/Documents/commandcode-companion`。
- 版本控制：Git，私有仓库 https://github.com/junjunup/commandcode-companion（`main`），最新标签 `v1.8.0-beta.6`（上一个 `v1.8.0-beta.5`）。CI（`ci.yml`）在每次推送时运行；打包、校验、升级验证由 Release 工作流完成（见 [docs/RELEASING.md](docs/RELEASING.md)）。阶段 1–3（T1.1–T3.4）已完成；阶段 4 的 T4.0 性能基线已完成（[docs/perf-baseline.md](docs/perf-baseline.md)，真实数据下没有任何一项超过阈值）。
- 发布产物：放在仓库外的 `~/Documents/TokenUsageAssistant-releases/`。beta.6 的四种安装包由 CI 产出（`release-v1.8.0-beta.6/`，报告在 `docs/verification-1.8.0-beta.6/`）；私有仓库中的 Release 已发布为 prerelease；Publish 演练已通过，但用户决定暂不公开发布（公开仓库仍没有任何 Release）；beta.5 及更早的 Windows 双包在旧 Windows 机器上。T2.3 起，四种安装包可以由 CI 的 Release 工作流产出（见 [docs/RELEASING.md](docs/RELEASING.md)）；公开安装包仓库为 https://github.com/junjunup/TokenUsageAssistant（只放安装包），由手动触发的 Publish 工作流发布，尚未发布过任何版本。发布用的 secret `PUBLIC_RELEASE_TOKEN`（fine-grained，只授权该公开仓库的 Contents 读写）由用户于 2026-10-15 设置，**2027-01-13 到期**，到期前需要重新生成并用 `gh secret set PUBLIC_RELEASE_TOKEN -R junjunup/commandcode-companion` 覆盖。
- 测试基线：`pnpm run test:desktop` 共 265 项，262 通过 / 0 失败 / 3 跳过（Harness 运行时未安装）。ESLint：0 个错误、36 个警告（T4.5b 后；React hooks 的禁用已全部移除，其余 13 处逐行禁用都注明了原因）。

## 2. 各能力证据等级

①合成契约测试；②打包原生 smoke（隔离样例）；③真实账户或真机验收。

| 能力 | 等级 | 说明 |
|---|---|---|
| Command Code 额度 | ①②，部分 ③ | Windows 上观察过真实账户快照；未与官网逐项核账 |
| GLM / MiniMax / 火山 | ①② | 用户没有这些平台的订阅，只做了官方契约样例验证 |
| DeepSeek 按量余额 | ①② | 未在真实账户上测试 |
| OpenCode Go 额度 | ①② | 未在真实 Go 账户上测试 |
| Codex 订阅额度 | ①②，部分 ③ | Windows 上做过真实 ChatGPT Pro 只读查询；Mac 上未测（beta.2 修复后待复测） |
| Claude 订阅额度 / 组件 | ①② | 用户没有 Claude 账户 |
| Zcode 工具用量 | ①②，部分 ③ | Windows 上用真实数据库验证过元数据聚合 |
| OpenCode / Harness / Codex rollout / Claude 导出 | ①② | Harness 官方运行时测试需单独安装（本机跳过） |
| 账户关联与核对 | ①② | 未做真实账户核账；当前数据无法给出真实差值 |
| Mac 打包版 | ② | `codesign` 通过，打包后 smoke ok，`spctl` rejected（预期）；真机验收未完成 |
| Windows 打包版 | ②（beta.5 时） | 实际 NSIS 覆盖安装、重启自启动未测 |

用户的账户情况：有 ChatGPT Pro（Codex）、Command Code + Zcode；没有 Claude、GLM、MiniMax、火山的订阅。

## 3. 模块结构

| 模块 | 职责 |
|---|---|
| `desktop/main.cjs`、`preload.cjs` | Electron 主进程：窗口、托盘、受限 IPC、原生文件选择器、smoke 模式；preload 暴露受限桥接 |
| `desktop/platform.cjs` | Windows / Mac 平台差异（数据目录、启动器、窗口行为） |
| `desktop/branding.cjs` | 窗口图标、任务栏信息 |
| `desktop/widget-bounds.cjs` | 悬浮窗展开/收起时的位置计算 |
| `desktop/store.cjs` | 加密本地存储（DPAPI / Keychain）、`atomicWrite`、设置 |
| `desktop/logger.cjs` | 本机诊断日志（`logs/app.log`，JSON Lines，白名单字段 + 脱敏，1 MB 轮转保留 3 份；T3.2） |
| `desktop/accounts.cjs`、`monitor.cjs`、`history-db.cjs`、`history.cjs` | 多账户管理、单账户轮询、额度历史（T4.1 起存 `history.sqlite`；`history.cjs` 是数据库打不开时的 JSON 兜底，也用于迁移） |
| `desktop/api.cjs` | Command Code 客户端 |
| `desktop/providers.cjs`、`provider-catalog.cjs`、`provider-domain.cjs` | GLM / MiniMax / 火山 / DeepSeek / OpenCode Go 客户端、平台目录、额度归一化 |
| `desktop/balance-domain.cjs` | DeepSeek 余额归一化与金额格式 |
| `desktop/domain.cjs` | 通用额度状态与重置描述 |
| `desktop/subscriptions.cjs`、`subscription-status.cjs` | Codex / Claude 订阅额度归一化与连接状态 |
| `desktop/codex-rpc.cjs`、`codex-connect.cjs`、`codex-reader.cjs` | Codex 只读 app-server RPC、配置发现与连接、rollout 本机快照读取 |
| `desktop/claude-collector.cjs`、`claude-statusline.cjs`、`claude-launcher.cjs`（+ `.ps1`） | Claude 本机 OTLP / statusLine 采集组件与启动器 |
| `desktop/metadata-json.cjs` | 白名单 JSON 元数据投影 |
| `desktop/tool-sources.cjs`、`tool-worker.cjs` | 工具来源管理（zcode / harness / codex / claude-code / opencode）、单活动 worker、取消与超时 |
| `desktop/zcode-reader.cjs`、`zcode-worker.cjs`、`opencode-reader.cjs`、`harness-reader.cjs` | 各工具来源的只读读取 |
| `desktop/tool-analytics.cjs`、`analytics-core.cjs`、`analytics-service.cjs` | 统一工具记录、聚合、账户分析与工具分析分路 |
| `desktop/association-rules.cjs`、`associations.cjs` | 关联规则与比较（纯函数）；关联持久化与身份校验 |
| `desktop/*-fixture.cjs`、`*-native-smoke.cjs`、`smoke-fixture.cjs` | smoke 模式用的合成数据和原生自检（会打进包；T5.4 计划拆出） |
| `src/DesktopApp.jsx` 等 | 渲染进程界面；`desktop-preview.js` / `preview-analytics.js` / `tools-preview.js` 提供浏览器预览数据 |
| `src/generated/` | 由 `scripts/prepare-analytics-preview.mjs` 从 `desktop/` 纯模块生成（不入库） |
| `integrations/deepseek-harness/` | 可选 Harness 统计插件，独立交付 |

## 4. 存储文件（userData 下）

| 文件 | 内容 |
|---|---|
| `settings.json` | 偏好和窗口位置 |
| `accounts.encrypted.json` | 账户列表（加密） |
| `accounts/<id>/credentials.encrypted.json`、`snapshot.json`、`history.json` | 单个账户的凭据（加密）、最近快照；`history.json` 自 T4.1 起只读（迁移来源，保留用于回滚） |
| `history.sqlite`（及 `-wal`/`-shm`） | 所有账户的额度历史，按账户指纹区分；删除账户时一并删除其记录 |
| `tool-sources.json`、`tool-source-status.json` | 工具来源配置、最近成功时间 |
| `tool-usage.sqlite` | 助手自己的工具元数据索引（不含正文） |
| `local-source.json`、`local-pricing.json` | 1.3 旧 Zcode 来源（保留用于回退）、本机单价 |
| `account-links.json` | 账户组和关联规则（不含凭据） |
| `claude-collector/` | Claude 组件配置、导出（`usage.jsonl`）、状态、会话映射、启动器 |
| `logs/app.log`（及 `.1`、`.2`） | 诊断日志：只有模块、错误分类和白名单字段（阶段、状态码、errno、平台、来源类型、耗时、退出码、计数、版本号），不含错误原文、路径、标签或密钥 |

目录：Windows 为原 Electron userData；Mac 打包版为 `~/Library/Application Support/TokenUsageAssistant`，Keychain 条目 `TokenUsageAssistant Safe Storage`；Mac 开发版（T3.1 起）为 `TokenUsageAssistant-Dev` 目录和 `TokenUsageAssistant-Dev Safe Storage` 条目；Mac 上的 `--smoke-test` 用隔离目录和独立的 `TokenUsageAssistant-Smoke Safe Storage` 条目。

## 5. 未完成的验收项

- 各平台的真实账户核账：GLM、MiniMax、火山、DeepSeek、OpenCode Go、Claude（需要用户开通并在应用内配置）。
- Mac 真机验收（逐项清单见 [docs/MAC-ACCEPTANCE-CHECKLIST.md](docs/MAC-ACCEPTANCE-CHECKLIST.md)，由用户在真机执行）：DMG 安装与首次打开、Keychain 授权（包括覆盖升级后）、菜单栏托盘、悬浮窗（所有桌面空间、全屏之上）、睡眠唤醒刷新、登录项、真实 Codex 连接、Zcode / OpenCode 同步、通知权限、空闲资源占用、窗口位置保留。
- Windows：NSIS 覆盖安装升级、重启后自启动、真实工具的持续使用。
- 两小时稳定性测试：未完成，用户已叫停，不再进行。

## 6. 下一步

按 [IMPROVEMENT_PLAN.md](IMPROVEMENT_PLAN.md) 第 3 节的任务总览和推荐顺序执行；每个任务完成后更新该文件的执行记录。
