# 项目交接：当前状态快照

> 更新：2026-10-18。本文只写**当前**状态；版本历史见 [CHANGELOG.md](CHANGELOG.md)，旧交接原文见 [docs/history/PROJECT_HANDOFF-through-1.8.0-beta.5.md](docs/history/PROJECT_HANDOFF-through-1.8.0-beta.5.md)。
> 规则见 [AGENTS.md](AGENTS.md)；进行中的工作见 [IMPROVEMENT_PLAN.md](IMPROVEMENT_PLAN.md)；Mac 菜单栏状态与灵动岛设计见 [docs/island-1.9.0-design/HANDOFF.md](docs/island-1.9.0-design/HANDOFF.md)。

## 1. 当前版本与环境

- 版本：`1.9.0-beta.2`（`package.json`）。包含 T7.9–T7.12、T4.7 与 Mac 安装包的 Electron / Chromium 许可证文件。2026-10-23 打标签 `v1.9.0-beta.2`（→ `237987f`）并发布：源码仓库 Release 与安装包仓库 Release 均为 prerelease。
- 开发机：用户的 Apple Silicon Mac（macOS 15.7.9，Node 24.21.0，pnpm 11.19.0）。项目路径：`~/Documents/commandcode-companion`。
- 版本控制：Git，源码仓库 https://github.com/junjunup/token-usage-assistant（`main`；2026-10-18 由 commandcode-companion 改名并公开，MIT，见 D11），最新标签 `v1.9.0-beta.2`（上一个 `v1.8.0-beta.8`）。CI（`ci.yml`）在每次推送时运行；打包、校验、升级验证由 Release 工作流完成（见 [docs/RELEASING.md](docs/RELEASING.md)）。阶段 1–5 已完成（性能基线见 [docs/perf-baseline.md](docs/perf-baseline.md)）。
- 发布产物：放在仓库外的 `~/Documents/TokenUsageAssistant-releases/`。beta.8 的四种安装包由 CI 产出（`release-v1.8.0-beta.8/`，报告在 `docs/verification-1.8.0-beta.8/`），已在私有仓库发布为 prerelease，并于 2026-10-16 公开发布到 https://github.com/junjunup/TokenUsageAssistant/releases/tag/v1.8.0-beta.8；beta.7 的四种安装包（`release-v1.8.0-beta.7/`）在私有仓库中已发布为 prerelease，并于 2026-10-16 **公开发布**到 https://github.com/junjunup/TokenUsageAssistant/releases/tag/v1.8.0-beta.7（4 个安装包 + `SHA256SUMS.txt`）；beta.6 只在私有仓库发布为 prerelease，没有公开；beta.5 及更早的 Windows 双包在旧 Windows 机器上。T2.3 起，四种安装包可以由 CI 的 Release 工作流产出（见 [docs/RELEASING.md](docs/RELEASING.md)）；公开安装包仓库为 https://github.com/junjunup/TokenUsageAssistant（只放安装包），由手动触发的 Publish 工作流发布，目前公开的最新版本是 1.8.0-beta.8（之前公开过 beta.7）。发布用的 secret `PUBLIC_RELEASE_TOKEN`（fine-grained，只授权该公开仓库的 Contents 读写）由用户于 2026-10-15 设置，**2027-01-13 到期**，到期前需要重新生成并用 `gh secret set PUBLIC_RELEASE_TOKEN -R junjunup/commandcode-companion` 覆盖。
- 测试基线：`pnpm run test:desktop` 共 338 项，335 通过 / 0 失败 / 3 跳过（Harness 运行时未安装）。ESLint：0 个错误、35 个警告；`pnpm run typecheck`（T5.5，TypeScript 7.0.2）通过（T4.5b 后；React hooks 的禁用已全部移除，其余 13 处逐行禁用都注明了原因）。

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
| Mac 菜单栏图标 / 弹出面板 / 设置（1.9.0-beta.1） | ① + 开发机 POC + ② | 原生 smoke 覆盖图标、面板与设置联动；2026-10-18 Claude 在本机做了部分 ③（第 12、14、15 项通过，第 16、17 项部分完成，见验收清单）；浅色 / 深色切换与告警色、系统截图 / 录屏 / 会议共享、锁屏、外接屏、多桌面空间、全屏中点图标待用户真机 |
| Windows 打包版 | ②（beta.5 时） | 实际 NSIS 覆盖安装、重启自启动未测 |

可用于真实账户验收的平台：Codex（ChatGPT 订阅）、Command Code、Zcode；Claude、GLM、MiniMax、火山目前只有契约样例。

## 3. 模块结构

| 模块 | 职责 |
|---|---|
| `desktop/main.cjs`、`preload.cjs` | Electron 主进程：窗口、托盘、受限 IPC、原生文件选择器；smoke 模式只通过 `desktop/smoke/index.cjs` 接入（T5.4）；preload 暴露受限桥接 |
| `desktop/platform.cjs` | Windows / Mac 平台差异（数据目录、启动器、窗口行为） |
| `desktop/branding.cjs` | 窗口图标、任务栏信息 |
| `desktop/widget-bounds.cjs` | 悬浮窗展开/收起时的位置计算 |
| `desktop/store.cjs` | 加密本地存储（DPAPI / Keychain）、`atomicWrite`、设置 |
| `desktop/logger.cjs` | 本机诊断日志（`logs/app.log`，JSON Lines，白名单字段 + 脱敏，1 MB 轮转保留 3 份；T3.2） |
| `desktop/accounts.cjs`、`monitor.cjs`、`history-db.cjs`、`history.cjs` | 多账户管理、单账户轮询、额度历史（T4.1 起存 `history.sqlite`；`history.cjs` 是数据库打不开时的 JSON 兜底，也用于迁移） |
| `desktop/api.cjs` | Command Code 客户端 |
| `desktop/providers.cjs`、`provider-catalog.cjs`、`provider-domain.cjs` | GLM / MiniMax / 火山 / DeepSeek / OpenCode Go 客户端、平台目录、额度归一化 |
| `desktop/providers/`（`index.cjs` 与每个平台一个文件） | 平台注册表（T5.3a）：元数据、请求构造、响应体错误分类、归一化、官方页面；`provider-catalog.cjs`、`providers.cjs` 和 `main.cjs` 的官方页面都由它派生 |
| `desktop/tool-kinds/`（`index.cjs` 与每种工具一个文件） | 工具来源种类注册表（T5.3b）：默认名称、原生选择器、`inspect`、`scan`、是否做重叠检查；`tool-sources.cjs`、`tool-worker.cjs` 和 `main.cjs` 的选择器都由它派生 |
| `desktop/menubar-status.cjs` | 菜单栏状态投影（T7.4，纯模块、严格类型检查）：从各账户的数据决定菜单栏图标显示哪个账户 / 窗口、文字和告警色；同一账户内额度窗口优先、金额兜底（T7.9） |
| `desktop/menubar-panel.cjs` | 菜单栏面板视图模型（T7.6，纯模块、严格类型检查；也生成到 `src/generated/` 供浏览器预览） |
| `desktop/menubar-popover.cjs`、`src/Panel.jsx`、`src/panel.css` | Mac 菜单栏弹出面板（T7.6）：窗口定位与收起；渲染面 `?surface=panel`，只能调用 5 个面板专用 IPC |
| `desktop/menubar-icon.cjs`、`desktop/menubar-render/` | Mac 菜单栏动态图标（T7.5）：隐藏渲染页用 canvas 画刻度环 + 数值，主进程设为托盘图标；检测图标是否被系统藏到刘海后面 |
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
| `desktop/smoke/`（`index.cjs`、`*-native-smoke.cjs`、`smoke-fixture.cjs`、`tool-fixture.cjs`、`opencode-fixture.cjs`）；`desktop/analytics-fixture.cjs`、`provider-fixture.cjs` | smoke 模式的流程、原生自检和合成数据（都会打进包，因为原生 smoke 测的就是真实的包）；后两个 fixture 同时用于浏览器预览的生成，所以留在 `desktop/` |
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

- 进行中：菜单栏首版（T7.3–T7.8，计划作为 1.9.0-beta.1，设计见 [docs/island-1.9.0-design/HANDOFF.md](docs/island-1.9.0-design/HANDOFF.md)）。T7.3–T7.8 已合并：Mac 菜单栏图标改为动态显示，左键弹出用量面板、右键为原菜单，设置里有「菜单栏图标与面板」子组；1.9.0-beta.1 已发布到 [安装包仓库](https://github.com/junjunup/TokenUsageAssistant/releases/tag/v1.9.0-beta.1)；真机验收：第 3 项已由用户填写；第 12、14、15 项已由 Claude 实测通过，第 13 项和第 16、17 项的剩余部分待用户。T7.9（同一账户内额度窗口优先、金额兜底）已合并，随下一个测试版发布，本机 Mac 测试包 `-dev.8964ec3`；T7.10（真机验收发现的 3 处小问题）已合并，本机 Mac 测试包 `-dev.22dab4c`；T7.11（面板账户标签与图标一致）已合并，本机 Mac 测试包 `-dev.2a0dbcf`（已装在本机并真机确认）；T7.12（图标绘制超时与回退）已合并，本机 Mac 测试包 `-dev.5b8db55`。以上与 T4.7 一起作为 1.9.0-beta.2 已发布到 [安装包仓库](https://github.com/junjunup/TokenUsageAssistant/releases/tag/v1.9.0-beta.2)。
- GitHub Actions：源码仓库 2026-10-18 公开后恢复运行（此前私有仓库因计费限制无法启动作业）。Release 工作流的 Artifacts 只保留 7 天。T7.5–T7.7 的 Windows 安装包随 T7.8 的 Release 补齐。
