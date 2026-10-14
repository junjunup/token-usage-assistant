# Token 用量助手：开发交接 1.8.0-beta.5

## 2026-09-30 Mac 改走本机 .app + DMG 打包

按 `docs/MAC-APP-PLAN-1.8.0-beta.5.md` 完成原位修复：Mac 交付不再使用手工拼装 ZIP、Start/Check/Repair 脚本链，改由本机 electron-builder 产出真实 `Token 用量助手.app` + DMG/ZIP（arm64，ad-hoc 签名 + hardened runtime + entitlements，未公证）。本机 `codesign --verify --deep --strict` 必须通过，且首次运行打包后的原生 smoke（`--smoke-test --test-directory=隔离目录`），结果落盘 `docs/verification-1.8.0-beta.5/mac-app-integrity.json`；`spctl` 预期 rejected 并如实记录。诚实边界：无 Apple Developer 账号，首次打开仍需右键 → 打开（Gatekeeper 按 cdhash 记住，同版本免重复）；本方案只消除「已损坏 + 修复脚本」，不消除「无法验证开发者」提示。版本保持 1.8.0-beta.5，Windows 双包不变。

实施中新增三处计划外但必要的修复（详见计划文档实施备注）：`mac.executableName` 段内覆盖使 bundle 命名为 `Token 用量助手.app`（Windows 不变）；`desktop/main.cjs` smoke 模式将隔离目录归一化为 realpath（修复 macOS 符号链接路径导致的原生 smoke 失败，Windows 为恒等变换；这是 `nativeMacTest` 首次为真实值的原因）；`Build-Mac-App.command` 默认 npmmirror 下载镜像（GitHub 直连在本机会长时间 stall，镜像下载仍经官方 sha256 校验）。已删除 `electron-builder.mac-test.yml` 与 8 个 Mac 修复/启动脚本，`scripts/deliver-opencode-beta5.py` 改读 `mac-app-integrity.json` 并按实际文件计入 DMG/ZIP。使用说明见 `docs/MAC-APP-1.8.0-beta.5.md`。旧 `Full-*.zip` 保留供回退。

## 2026-09-26 OpenCode 第一、二阶段

用户确认分步实施全部 OpenCode 套餐兼容计划。beta.5 新增 Go 官方额度查询和独立 OpenCode 数据库来源，保留原 UI、品牌、应用 ID 和存储。Go 使用固定 GET 三周期百分比，额度与本机 Token 不混算；未提供 Zen 余额、Black 或企业计费查询。工具来源兼容已核对的新旧 SQLite 结构，仅读叶子元数据，排除步骤/消息重复、旧版镜像和复制历史，推理/缓存各计一次。真实 Go 与 OpenCode 使用、Mac 实机验收仍待验证。完整语义、依据、后续阶段见 [OpenCode 说明](docs/OPENCODE-1.8.0-beta.5.md)，交付目录为 `release-v1.8.0-beta.5`。

## 2026-09-26 修复侧栏标识偏移与任务栏旧图标

用户截图反馈 beta.3 侧栏标识偏右、任务栏为 Electron 默认图标。beta.4 去掉侧栏品牌按钮默认内边距，Windows 窗口改用已有多尺寸 ICO，并显式登记主窗口任务栏图标/重新打开信息，免安装版引用外层稳定启动器。原 Logo、其余页面样式和账户存储保持原样。新增包内原生验证实际 SVG/路径居中及系统返回的窗口图标，弥补 beta.3 只检查 EXE 内嵌图标的遗漏。说明与证据见 [修复记录](docs/BRAND-FIX-1.8.0-beta.4.md)。最新发布在 `release-v1.8.0-beta.4`；Mac 实机验收仍待完成。

## 2026-09-26 精修刻度环落地，原 UI 保持

用户确认只更换精修刻度环 Logo，详情页及现在的 UI 风格保持不变。此版本替换 Windows / Mac 图标资源、托盘、加载标识、侧栏和悬浮窗品牌标识。矢量来源和可重建方式见 [品牌说明](docs/BRAND-1.8.0-beta.3.md)。应用 ID、程序名、数据目录和所有原生业务代码保持一致；原有页面样式和内容不变。保留所有旧发布；新交付在 `release-v1.8.0-beta.3`，包含两种 Windows EXE、Mac 全量试用包及源码。Mac 实机验收仍待完成，不恢复长期稳定性测试。后续品牌/UI调整仍需先向用户展示方案并确认。

## 2026-09-26 用户改要全量修复包

用户明确不要升级包，交付 `TokenUsageAssistant-Mac-arm64-Full-1.8.0-beta.2.zip`（约 125 MiB）。它包含 beta.2 相同已测 ASAR、未改写的官方 ARM64 Electron、常规启动脚本，以及针对 beta.2 固定哈希的 `Repair-Mac-Trial.command`，用于微信传包后可能再次出现的启动拦截。无需旧包或单独下载修复脚本。新完整说明见 `docs/MAC-FULL-1.8.0-beta.2.md`，8 个包内文件及脚本权限校验见 `docs/verification-1.8.0-beta.2/mac-full-kit-integrity.json`。此次仅重新组合 Mac 支持文件，应用和 Windows EXE 未改变，旧发布包保留；真实 Mac 复测仍待用户反馈。

## 2026-09-26 Mac Codex 根因与 beta.2 修复

收到有效 r2 报告：Homebrew Codex CLI 0.39.0，初始化阶段约 49 ms 退出，code 2、参数错误分类，未进入账户或额度查询。诊断所选程序为自动发现结果，不据此推断已保存连接或官方桌面端登录状态。此前通用“中断或超时”提示掩盖了此类早退。

beta.2 在连接选择前做仅初始化的协议预检，保留原配置目录和绑定规则；失败后尝试其他已知程序并允许直接选择 Mac Codex.app。RPC 按初始化、登录、额度阶段计时，安全区分启动、协议、退出与真正超时。没有更改 Codex 或 Homebrew、没有适配 0.39 旧协议、没有调用模型。

234 桌面 + 4 兼容测试通过；最终包验证、27 项 beta.1 → beta.2 原生升级检查与发布完整性见 `docs/verification-1.8.0-beta.2`。提供小型 Mac 升级包复用已修复运行环境，以及完整 Mac 首测包、两份 Windows EXE 和源码。真实 Mac 额度连接仍待用户复测，不恢复长期稳定性测试。优先阅读 [beta.2 使用与修复说明](docs/MAC-TRIAL-1.8.0-beta.2.md)。下方保留历史记录。

## 2026-09-25 Mac Codex 连接提示超时

更新：第一版诊断包在 Electron 下用普通 fs 校验 ASAR 导致 ENOENT，报告生成前退出，已复现并交付 r2 修复包。改用 original-fs、提前写报告并记录启动阶段错误。9 项完整入口 / 原生合成检查和 10 项观察层样例通过；Mac 原始连接问题仍待 r2 报告。用户应使用 `TokenUsageAssistant-Mac-Codex-Diagnostics-1.8.0-beta.1-r2.zip`。

用户确认提示来自助手。已确认原连接共用 20 秒预算且错误分类不清，但 Mac 实际根因未定。提供独立只读分阶段诊断包，使用原 ASAR 连接代码，20 秒失败到时后才做 60 秒对照；不改应用或发布包。等待用户返回脱敏诊断报告，详见 [Mac Codex 排查记录](docs/MAC-CODEX-DIAGNOSTICS-1.8.0-beta.1.md)。

## 2026-09-25 Mac 首测反馈：启动被系统拦截

用户微信传包后各文件校验均 OK，但提示 Electron 已损坏，“仍然打开”未解决。提供了独立启动支持包，固定哈希校验后重新解压运行环境，仅处理该 Electron.app 的下载隔离并保留旧运行目录。没有修改应用代码或原发布包，没有全局关闭 Gatekeeper。真实修复效果和 Mac 验收仍待反馈。详情见 [Mac 启动问题记录](docs/MAC-STARTUP-1.8.0-beta.1.md)。

## 2026-09-24 阶段 5：Apple Silicon 首测版（当前开发版）

用户确认 M 芯片，希望先完成开发再到另一台 Mac 测试。已完成第一轮跨平台代码和自带官方 ARM64 Electron 运行环境的测试包；macOS 13+，未在 Mac 实机运行。**（已被 2026-09-30 条目取代）**当时受限于 Windows 打包工具，采用官方运行环境执行相同 ASAR 的试用包方案；现已改为本机 electron-builder 原生构建、ad-hoc 签名、未公证的真实 `.app` + DMG。

新增 `desktop/platform.cjs`、Mac Claude 白名单组件 / 启动器、Mac 原生窗口 / 菜单 / 登录项分支、稳定 Application Support 目录。当时的 `scripts/Start-Mac-Trial.command`、`Check-Mac-Trial.command`、`Build-Mac-Test.command` 已于 2026-09-30 移除，由 `scripts/Build-Mac-App.command`、`scripts/Verify-Mac-Native.command` 取代。216 桌面 + 4 兼容测试通过；Mac 验收和真实核账待用户测试，未恢复长期稳定性测试。优先阅读 [Mac 首测说明](docs/MAC-TRIAL-1.8.0-beta.1.md) 和 `docs/verification-1.8.0-beta.1`。本版不视为阶段 5 完整验收；阶段 6 未开始。以下为历史记录。

## 2026-09-24 阶段 4：账户关联与核对（当前版本）

用户明确批准继续阶段 4。1.7.0 实现人工计费账户归组、同账户多 Key 主查询选择、来源 / 时间 / 供应商 / 模型关联、工具账户筛选及独立账户核对页。原始工具记录不变；无有效规则时 accountId 仍为 null，切换账户绝不自动归属。密钥、组成员、已知平台身份或源文件身份变化要求重新确认。当前平台数据和本机覆盖证据不足以输出真实差值 / 误差率，核对页明确说明原因。204 桌面 + 4 兼容测试通过，最终包原生与升级记录另见验证目录。未做真实账户核账、实际 NSIS 安装或新的长期稳定性测试。

优先阅读 [1.7.0 使用与支持说明](docs/ACCOUNT-ASSOCIATION-1.7.0.md) 和 `docs/verification-1.7.0`。新增 `desktop/association-rules.cjs`（纯归属 / 比较规则）、`desktop/associations.cjs`（原子保存、身份校验、主连接核对）、`src/AccountLinks.jsx`（设置及核对页面）、`tests/associations.test.cjs` 与 `scripts/verify-upgrade-1.7-native.cjs`。`account-links.json` 无凭据 / 对话正文，内部身份摘要不传界面。源码 / 发布目录为本项目和 `release-v1.7.0`；历史发布保留。阶段 5 macOS、6 第三方尚未实施。以下为历史说明。

## 2026-09-24 阶段 3：DeepSeek 官方按量余额（当前版本）

用户明确批准继续阶段 3。1.6.0 接入官方余额查询，新增按量账户看板和悬浮窗；金额保留十进制精度和各自币种，未知不填零，失败保留上次成功值。工具 Token / 估算费用继续独立，余额差不当消费，不绑定当前账户、不汇总多个 Key 余额。详见 [阶段 3 说明](docs/DEEPSEEK-BALANCE-1.6.0.md) 与 `docs/verification-1.6.0`。186 项桌面及 4 项兼容测试通过，最终发布包验证单独记录。缺少真实 DeepSeek 账户实测，未做新的长期稳定性测试。阶段 4 关联核对、5 macOS、6 第三方评估仍待实施。

## 2026-09-24 本机连接体验补丁（当前版本）

用户批准改进 Codex 自动连接及 Claude 状态说明。1.5.1 已增加默认 / 环境变量 / 已保存配置发现、多配置应用内选择、手动回退；额度成功不会因为缺少工具日志而显示失败。Claude 明确区分组件就绪、首次等待、同步与过期状态。详见 [1.5.1 使用与验证](docs/CONNECTION-UX-1.5.1.md)，本版记录位于 `docs/verification-1.5.1`，发布目录 `release-v1.5.1`。本轮 165 项桌面、4 项兼容、最终包原生流程与 23 项原生模块升级检查通过。没有新增长时间稳定性测试，也没有重新进行真实账户核账。此前 1.5.0 记录及以下历史说明保持原样。

## 2026-09-24 新增订阅里程碑（优先阅读）

用户确认在阶段 3 前同时接入 ChatGPT / Codex 与 Claude / Claude Code 的订阅额度和工具明细，并接受 Claude 本地采集组件。用户现有 ChatGPT Pro + Codex、Command Code + Zcode，暂无 Claude 实测账户。本版行为、入口、隐私、支持版本和限制以 [1.5.0 说明](docs/SUBSCRIPTIONS-1.5.0.md) 为准；验证记录位于 `docs/verification-1.5.0`。

新增 `desktop/codex-rpc.cjs`（只读官方客户端查询）、`subscriptions.cjs`（额度标准化）、`metadata-json.cjs`（白名单解码）、`codex-reader.cjs`（本机快照）、`claude-collector.cjs` 与两份 PowerShell 组件（本机 OTLP / 状态栏）。账户目录与工具来源独立，未实现自动核账。真实本机 Pro 查询和支持版本日志已观察；Claude 仅合同、样例与组件验证。必须区分额度 API 成功与实际账单或全量历史。

源码基线保留 1.4.1 悬浮窗底边修复；本版构建输出 `release-v1.5.0`，同时交付 Setup 与 Portable。未做新的长期稳定性测试，用户之前要求停止仍有效。下文为保留的 1.4.x 基线说明；其中“下一阶段 3”在本订阅里程碑之后执行。

更新：2026-09-24。项目位于 `D:\Projects\TokenUsageAssistant\commandcode-companion`，Windows x64。当前无 Git 仓库或公开远端。1.4.1 修复悬浮窗展开后收起不能恢复原底边的位置问题；1.4.0 的功能与验证记录保留为前版基线。

## 当前授权与交付边界

用户明确要求 IMPLEMENT 后续阶段计划；按计划“下一可交付版本只集中阶段 1、2”执行。此前计划中“不改代码”已被本次实施请求替代。用户接受 Harness 可选本地插件，官方按量优先 DeepSeek，macOS 优先于第三方。阶段 0 的维护与实测补充并行，缺少套餐账户不能宣称核账完成。

1.4.0 新增独立工具来源、统一已报告用量、Harness 插件与双工具分析。1.3.0 平台、多账户和 Windows 能力保留。详细支持矩阵、结果及未完成事项以 [本版说明](docs/TOOL-SOURCES-1.4.0.md) 和 `docs/verification-1.4.0` 为准。最终稳定性测试按用户明确要求在约 44 分钟、89 轮后停止，已运行部分 0 错误；两小时验收未完成，不可标为通过。

历史 1.3.0 基线保存在 `release-v1.3`、原交付源码包与 [历史交接](docs/PROJECT_HANDOFF-1.3.0-history.md)。不要覆盖旧包或把其测试记录当作本版记录。

## 结构与接口

| 文件 | 职责 |
|---|---|
| desktop/provider-catalog.cjs、providers.cjs | 平台能力声明、固定只读接口与签名 |
| desktop/accounts.cjs、monitor.cjs、store.cjs | 隔离平台账户、轮询、DPAPI、设置与原有迁移 |
| desktop/tool-sources.cjs | 来源管理、1.3 Zcode 迁移、单活动 worker、取消/超时、最近成功时间 |
| desktop/tool-worker.cjs | 隔离读取各来源、重叠检测、索引任务和聚合 |
| desktop/zcode-reader.cjs | 白名单 SQLite 只读投影；兼容旧读取入口 |
| desktop/harness-reader.cjs | 锁定版本、状态校验、增量 JSONL、事务游标和最大 revision 索引 |
| desktop/tool-analytics.cjs | 统一记录、已报告用量、币种、过滤及保守覆盖范围 |
| desktop/analytics-service.cjs | 账户分析与 tools 分路；legacy local 兼容为单个 Zcode 来源 |
| integrations/deepseek-harness | 可选插件、安装文档、上游版本证据；独立交付 |
| desktop/main.cjs、preload.cjs | 受限 IPC、原生文件选择器、平台/工具状态广播 |
| src/ToolSources.jsx、AnalyticsPage.jsx | 来源设置、多选与统计界面 |
| src/useAnalytics.js | 查询生命周期、过期响应隔离与取消 |
| desktop/tool-native-smoke.cjs | 隔离 Windows 包双工具自检，不用于用户数据 |

工具入口 `analytics({source:'tools',range:'today'|'7d',sourceIds?:string[],model?,project?,session?,requestId?})`。空 sourceIds 表示所有启用来源。会话标识按来源命名空间区分。旧 `source:'local'` 只选一个启用的 Zcode，保留原 session 筛选兼容；新口径包含失败/取消已报告用量。

管理 IPC：addToolSource、updateToolSource（仅名称/启停）、chooseToolSource、removeToolSource、syncToolSource。文件由原生选择器产生，不开放任意网络地址。全部写操作限主面板；不把 Key 传到 renderer。

## 必须维持的语义

- ToolSources 与 AccountManager 没有隐式账户归属。工具记录 `accountId:null`，返回 `credits:null`、`prediction:null`；没有显式关联，不使用当前账户账期。
- Harness 支持 `0.1.7-rc.1` / session format 4 / JSONL schema 1。上游提交与包完整性记录在插件 `upstream-contract.json`。不是所有同名 Harness 都支持。
- 插件监听提交后的 session/event；仅元数据，不扫描历史日志，不读取消息正文、工具内容、错误文本或凭据。缺少起点不伪造调用；分叉继承不累计。
- 同一尝试最大 revision 更新，重试独立。助手事务写自己的索引，游标校验文件身份和尾部锚点，末尾未写完行留待下次。取消回滚未提交事务。
- 缺失字段未知；缓存/推理不双计。记录统计以 reported usage 为准，完成率/均值以完成请求口径。费用仅估算；USD/CNY 不合并，旧未声明币种价格为 USD。
- 来源自身格式异常不能阻断另一个来源。Zcode 副本无可靠安装 ID，重叠身份只作保守暂停合并，不能猜测哪份是最新完整数据库。
- 覆盖范围是观测范围，不是完整账单；覆盖不足不算同期差异。两小时合成逻辑测试不是付费账户/GUI长测。

## 存储和迁移

保留原 appId `local.commandcode.tokenusageassistant`、程序名和 userData。原 `accounts.encrypted.json`、`settings.json`、账户缓存/历史不改格式。1.3 的 `local-source.json` 保留；新建 `tool-sources.json` 与 `tool-source-status.json`。Harness 索引为 `tool-usage.sqlite`，包含白名单元数据，不含完整 JSONL 或对话。

配置损坏不自动覆盖。旧价条目直接按 USD 解释，编辑后显式保存 currency。1.3 可回读旧连接/设置/Zcode；不认识本版新增 Harness 配置是正常边界。迁移脚本只允许新的隔离目录，不能指向真实 userData。

## 构建与复验

阅读 README 和插件 README。常规 `pnpm run test:desktop`、`pnpm run build`、`pnpm run test:sites`；改前端后必须 build。`src/generated` 是生成文件。打包用 `pnpm exec electron-builder --win --x64 --config.electronDist=node_modules/electron/dist`，本版输出 `release-v1.4.1`。每次修改代码后同步更新安装包和免安装程序，并核对版本与包内代码一致；不要覆盖旧版交付包。

完整插件测试需 `TUA_HARNESS_CONTRACT_RUNTIME` 与 `TUA_HARNESS_CLI_RUNTIME` 指向隔离安装的官方固定版本测试依赖。没有它们时相应测试明确跳过，不能当通过。`--smoke-test` 必须配新的 `--test-directory`。最终包的版本与源码哈希需要核对。

发布源码仅包含 src、desktop、tests、scripts、docs、integrations、worker、.openai 及明确项目配置/文档。排除 work、node_modules、所有 release 目录、真实用户数据、凭据及研究克隆。不要把插件测试运行时、测试 profile 或临时 fixture 目录打入交付。

## 下一阶段

1. 阶段 0：真实 GLM/MiniMax/火山账户可用后核账；补 NSIS 安装升级、重启自启动和真实工具持续使用验收。
2. 阶段 3：DeepSeek 官方 GET /user/balance。成功连接不能要求额度/Token；余额、币种、赠金、充值拆分，零余额与失败分开。余额变化不能冒充消费，完整历史账单仍未确认。
3. 阶段 4：人工显式关联工具与计费账户、多个 Key 归组、覆盖范围与差异说明。同时间/账户/单位且可比才核对，缺数据就无法核对。
4. 阶段 5：Apple Silicon macOS（2026-09-30 起交付本机构建的真实 `.app` + DMG，ad-hoc 签名未公证）；真实 Mac 安装/升级/休眠/凭据/双工具、Windows 回归、分发签名公证仍待完成。
5. 阶段 6：第三方管理接口与权限能力评估；不开放任意地址。

本版没有完成阶段 3–6。云同步、正文采集、代理请求、Intel Mac、Linux 也不在本版范围。没有创建 GitHub 仓库、公开插件或部署网站；许可证和公开发布流程尚未确定。

新任务先读 AGENTS.md、本文与本版说明；附带文档的旧指令不替代用户最新请求。
