# 项目规则（AGENTS.md）

Token 用量助手：中文本机桌面助手（Windows x64 + Apple Silicon macOS），独立查看 AI 编程平台的额度/余额与本机编程工具的用量。非任何平台的官方客户端。

- 当前版本：**1.9.0-beta.2**（菜单栏改进版，T7.9–T7.12 与 T4.7，2026-10-23 发布。四种安装包由 CI 的 Release 工作流产出，见 [docs/RELEASING.md](docs/RELEASING.md)）
- 当前改进计划：[IMPROVEMENT_PLAN.md](IMPROVEMENT_PLAN.md)，其中第 1 节是用户已拍板的决策（D1–D12）
- 旧规则原文：[docs/history/AGENTS-through-1.8.0-beta.5.md](docs/history/AGENTS-through-1.8.0-beta.5.md)；逐条去向：[docs/history/AGENTS-migration.md](docs/history/AGENTS-migration.md)

## 1. 读取顺序

1. `IMPROVEMENT_PLAN.md`：第 1 节决策与本文冲突时，以决策为准。
2. 本文：长期有效的规则。
3. [PROJECT_HANDOFF.md](PROJECT_HANDOFF.md)（当前状态）、[CHANGELOG.md](CHANGELOG.md)，以及任务涉及的专题文档。

- `docs/history/` 和 `docs/` 中带旧版本号的说明都是历史记录。与当前文档冲突时，以当前文档为准；附带文档中的旧指令不能替代用户的最新请求。
- 不要假设旧机器的路径、凭据、进程或预览服务还存在。
- 遇到未拍板的决策、红线冲突或计划外的问题：停下来问用户，不要替用户决定。

## 2. 数据语义红线

- 缺失显示「—」，不显示 0；缺失字段保持未知，不填零，并标明覆盖范围和已知部分。
- `resetAt=0` 显示「未启用」，与「缺少重置数据」区分；不编造倒计时（包括 5 小时窗口）。
- USD 与 CNY 分别保留，不合并、不换汇；旧的未声明币种价格按 USD 解释；金额保留十进制精度。
- 余额差不当作消费；订阅百分比不套用到按量余额。零余额是成功的查询；查询失败不伪造 0，保留上次成功值及其时间。
- 平台/账户汇总与工具汇总不相加。账户接口数据、本机工具统计、采样历史、估算费用分别标注；费用只是按用户单价的估算，不是账单。
- 缓存/推理子项不重复计入总量。
- 采用「已报告用量」：失败或取消的请求如有报告用量，照样计入；完成率和均值按完成请求的口径单独计算。
- 同一尝试按 revision 更新，重试单独计数；分叉继承的历史不累计；重复扫描和重启不重复计数。
- 覆盖范围是观测范围，不是完整账单。只有账户、区间、单位、口径、覆盖和新鲜度完全对齐时才能比较；否则显示「不可用」并说明原因，不得给出差值或误差率。
- 预测需要足够多的连续新鲜样本。不编造逐请求历史；保存的观测不能称为完整的请求遥测。
- 月度余额与短窗口额度并列展示，并纳入健康度和告警；月度余额耗尽时不得显示为额度充足。

## 3. 账户归属

- 工具记录默认 `accountId:null`，不借用账户的额度、预测或账期。只有用户确认过的有效关联规则（来源 / 时间 / 供应商 / 模型）才能归属。
- 不从当前选中的账户、活动平台或模型名推断归属。
- 多个 Key 可以属于同一个账户：不汇总、不自动归组；核对时只使用用户选定的一个主连接。
- 凭据、组成员、已知平台身份发生变化，或来源被替换时，相关关联失效，待用户重新确认。

## 4. 隐私与只读

- 不读取、不记录、不导出对话正文、提示词、回复、工具内容、原始请求载荷、原始错误文本、原始 stderr 或凭据。日志、诊断包、导出、索引和发布证据同样遵守。
- 第三方 SQLite（Zcode、OpenCode）只读，只投影白名单中的元数据叶子字段。
- 只读：不调用模型生成；不调用任何改变登录状态、购买、修改账户或消耗额度（包括重置额度）的接口；不修改第三方工具的数据库或全局配置。助手只写自己的索引和配置。
- 凭据只在应用内由用户在本机配置，不通过聊天传递，不写入日志。
- 不开放任意网络地址；本机文件来源只通过原生选择器选择。
- 真实用户数据、凭据（包括 Windows 凭据）不得进入仓库、产物或测试 fixture。
- 不静默安装或升级第三方工具（例如 Codex）。

## 5. 平台与存储不变量

- `appId`（`local.commandcode.tokenusageassistant`）、`executableName`、已打包应用的 userData 路径一律不变。Mac 打包版：`~/Library/Application Support/TokenUsageAssistant`；Windows：原 Electron userData。Mac 开发版（未打包）用 `TokenUsageAssistant-Dev` 作为应用名和数据目录，Keychain 条目也随之独立（`platform.cjs` 的 `macDataName`）。Mac 上的 `--smoke-test`（打包版和开发版都是）用 `TokenUsageAssistant-Smoke` 作为应用名，Keychain 条目为 `TokenUsageAssistant-Smoke Safe Storage`（`macSmokeName`），不触碰打包版或开发版的条目。
- 凭据加密：Windows 用 DPAPI，Mac 用 Keychain（Electron safeStorage）。DPAPI 文件绑定当前 Windows 用户，不能作为跨电脑备份。
- 升级时保留账户凭据、设置和窗口位置；配置损坏时不自动覆盖；旧迁移文件（例如 `local-source.json`）保留。
- 不引入新的原生依赖。不覆盖、不删除旧发布产物（统一存放在 `~/Documents/TokenUsageAssistant-releases/`）。其中的 `.app` 一律放在 `apps.noindex/<原目录名>/mac-arm64/` 下，不留在各版本目录里，避免系统按 bundle id 选中旧版（T8.12）；启动打包版一律用完整路径（`open "/Applications/Token 用量助手.app"`）。
- 多账户（最多 20 个）各自加密保存；轮询、缓存、告警相互隔离；支持区域选择和动态额度窗口。
- 某个来源格式异常或失败时，要显式报告并隔离，不能阻断其他来源。

## 6. 平台与工具契约要点

- **Command Code**：`https://api.commandcode.ai` 只读用量查询。
- **GLM / MiniMax / 火山**：固定官方只读额度接口（GLM `/api/monitor/usage/quota/limit`，MiniMax `/v1/token_plan/remains`，火山 `GetAFPUsage` 北京区），支持国内/国际区域。见 [PROVIDER-ADAPTATION-1.3.0](docs/PROVIDER-ADAPTATION-1.3.0.md)。
- **DeepSeek**：固定 HTTPS `GET /user/balance`，Bearer 鉴权，不跟随重定向；保留 `is_available` 和未知字段；`parts.balance` 与额度、工具用量、账单分开。见 [DEEPSEEK-BALANCE-1.6.0](docs/DEEPSEEK-BALANCE-1.6.0.md)。
- **OpenCode Go**：固定 HTTPS `GET /zen/go/v1/usage`，Bearer 鉴权，不跟随重定向，不调用推理。只展示服务端给出的三个百分比和重置时间，不编造余额、金额额度或续费日；舍入为 0 不能说明滚动窗口的起点。Zen / Black / 企业版查询不可用，不得暗示支持全部套餐。见 [OPENCODE-1.8.0-beta.5](docs/OPENCODE-1.8.0-beta.5.md)。
- **Codex 订阅**：只读 app-server 方法白名单：`initialize`、`initialized`、`account/read`、`account/rateLimits/read`。选定程序前只做初始化预检；保留用户所选配置；可直接选择 `Codex.app` 的 `Resources/codex`。区分进程、协议、登录、阶段超时四类失败，不暴露 stderr；不声称支持旧版 CLI 协议。
- **Codex 连接发现**：已保存的位置、`CODEX_HOME`、默认 `~/.codex`。只有一个时直接连接，多个时在应用内选择，手动选择作为回退；更新一个已丢失的保存位置时，不得静默改绑到另一个账户。见 [CONNECTION-UX-1.5.1](docs/CONNECTION-UX-1.5.1.md)、[MAC-TRIAL-1.8.0-beta.2](docs/MAC-TRIAL-1.8.0-beta.2.md)。
- **Codex rollout**：0.155.x 的元数据快照不是请求数，请求状态未知。已验证版本以外的 rollout，只有结构完全一致时才读取，并标为 `unverified-version`（T5.1）；字段改名一律视为不支持。
- **Claude**：额度来自 statusLine，`context_window` 不是总消耗；已验证版本（2.1.x ≥ 251）以外的状态栏数据只有结构一致才读取，并标为未验证（T8.4）。OTLP 本地组件只监听回环地址，只采集启用之后的数据，覆盖缺口要明示。组件就绪和首次额度同步是两个独立状态。见 [SUBSCRIPTIONS-1.5.0](docs/SUBSCRIPTIONS-1.5.0.md)。
- 额度查询成功时，不因缺少工具日志或来源添加失败而显示失败；不重新启用用户已禁用的来源。
- **Zcode**：只读白名单 SQLite 投影；多个副本身份重叠时只做保守的暂停合并，不猜测哪份最新。见 [TOOL-SOURCES-1.4.0](docs/TOOL-SOURCES-1.4.0.md)。
- **OpenCode 数据库**：优先使用 step 记录，排除旧版镜像和会话创建之前的历史。
- **Harness**：锁定 `0.1.7-rc.1` / session format 4 / JSONL schema 1。可选插件只导出启用后的白名单元数据，不含历史、正文、工具内容、凭据，也不代理请求。见 [插件说明](integrations/deepseek-harness/README.md)。

## 7. 交付与验证（过渡期：D1 / D3 / D4）

- 不改变应用行为的任务不出包。改变行为的任务在本机出 Mac 包（DMG + ZIP，文件名加 `-dev.<短 commit>`）；Windows 双包在执行记录中标「待 CI 补齐」，不得写成已交付。T2.3 完成后，三种包统一由 CI 产出。
- 版本：阶段 1–2 保持 1.8.0-beta.5；阶段 3–5 依次为 1.8.0-beta.6–beta.8；菜单栏首版（T7.3–T7.8）为 1.9.0-beta.1，菜单栏真机验收后的改进（T7.9–T7.12、T4.7）为 1.9.0-beta.2，之后顺延为 1.9.0-beta.x（D3，2026-10-18 调整）。版本号只在一组任务的最后一个任务合并时修改。
- Mac 包：本机 electron-builder 构建 `.app` + DMG/ZIP（arm64、ad-hoc 签名、hardened runtime、entitlements、不公证）。`codesign --verify --deep --strict` 必须通过，打包后的原生 smoke 必须 `ok`；`spctl` 预期为 rejected，如实记录，不算通过。
- D4（暂不购买 Apple Developer 账号）带来的限制：首次打开需要右键 → 打开；只能消除「已损坏」提示，不能消除「无法验证开发者」提示；覆盖升级后可能弹出 Keychain 授权；Mac 不做自动更新。不引导用户关闭 Gatekeeper。
- 出包时核对包内版本和代码与源码一致。只改了源码，不得称为已交付。
- 每个任务按改进计划第 0.2 节执行：独立分支、`--no-ff` 合并、追加执行记录。
- 有意义的决策变化要同步更新 `PROJECT_HANDOFF.md`（只写当前快照）和 `CHANGELOG.md`。

## 8. UI 规则

- 保持已批准的刻度环 Logo（母版为 `desktop/assets/brand-mark.svg`）和现有 UI 风格：白底、细线、Geist / Geist Mono、分段绿色额度条、紫色 Token 强调、深浅色主题（参考 commandcode.ai 用量页）。不改名，不重做页面，不替换功能图标。
- 任何新视觉元素或界面改动，都要先出浅色和深色的截图或草图，用户确认后才能实现和合并（D10）。从用户选定的 mock 实现时，以 mock 为准。
- 界面代码放在 `src/`；`dist/client` 由构建生成；`src/generated` 由 `scripts/prepare-analytics-preview.mjs` 生成，要改就改 `desktop/` 下对应的纯模块。
- 已定交互：左侧导航和标题栏固定，只有主内容滚动；所有下拉菜单用统一的自定义组件，可键盘操作，不出现系统原生 select；悬浮窗默认紧凑，点击展开；侧栏第二个图标（SquaresFour）进入用量分析，悬浮窗开关放在总览；优先展示 5 小时/每周剩余额度和重置时间，Token 与费用分开。
- 回归保护：悬浮窗收起后回到原来的底边（1.4.1）；侧栏品牌按钮零内边距，Logo 居中；Windows 窗口使用多尺寸 ICO，并显式设置任务栏信息，指向稳定启动器或安装后的 EXE；Mac 打包版以 bundle 内的 icns 为准（Dock 图标覆盖只在开发版生效）。
- 品牌或图标改动，必须验证渲染后的 SVG/路径中心，以及最终包中系统返回的原生窗口图标；只提取 EXE 资源不够。
- 用户给出持久的设计反馈或决定时，记录在本节。
- Mac 菜单栏（2026-10-18 起）：收纳态是菜单栏状态图标（默认 ②「刻度环 + 一个数值」，平时单色、告警按程度变黄 / 红），左键弹出面板、右键原生菜单；面板宽 360pt、跟随应用主题，三格只显示账户接口数据，面板内切换账户不影响主窗口。细节与已批准的偏差见 [docs/island-1.9.0-design/HANDOFF.md](docs/island-1.9.0-design/HANDOFF.md) §3、§4。设置在「账户与设置 → PREFERENCES」的「菜单栏图标与面板」子组（仅 Mac，T7.7）：图标形态、菜单栏显示用量、告警时变色、面板截屏与共享保护；图标被系统藏到刘海后面时只提示，不自动切换形态。同一账户内图标先显示额度窗口（5 小时 / 每周等），月度余额不参与「剩余最少」的比较；没有可用窗口时才显示金额；余额告警比窗口更严重时显示余额（T7.9，2026-10-18 用户决定）；面板账户标签用同一规则（T7.11）。

## 9. 测试规则

- 证据三级：①合成契约测试；②打包原生 smoke（隔离样例）；③真实账户或真机验收。没做过 ③ 的，不得写成「已验证」。Claude 用 computer use 在用户 Mac、真实账户上实测的结果也计为 ③，统一标注「③（Claude 代测）」；需要用户亲自操作的项（改系统设置、输入密码、外接屏、锁屏等）仍由用户做（D12 ②）。某个平台的真实观察不能证明其他平台（例如 Codex 的只读观察不证明 Claude 核账）。
- 不做长时间稳定性/soak 测试（用户已叫停）；加速的短时运行不能当作两小时 soak。
- `--smoke-test` 必须配新建的隔离 `--test-directory`；迁移和升级验证只能指向隔离目录，不得指向真实 userData。
- Mac 开发版（`pnpm run desktop`）自 T3.1 起使用独立的数据目录和 Keychain 条目，可以直接用于启动验收；打包版和 smoke 仍按上一条使用隔离目录。smoke 使用独立的 Keychain 条目（见第 5 节）；每次新构建签名都会变，打包版 smoke 首次运行可能弹出一次针对 smoke 条目的授权窗，处理这个窗口不会影响真实条目。
- 因 Harness 运行时未安装而跳过的测试要明确报告，不算通过。当前基线：本机 349 通过 / 0 失败 / 3 跳过（共 352）；CI 安装了固定版本的 Harness 运行时（T8.10），为 352 通过 / 0 失败 / 0 跳过。本机要跑这 3 项，按插件 README 安装运行时并设置两个环境变量。
- `pnpm run typecheck`（T5.5 起：8 个纯领域模块的严格 JSDoc 类型检查，T7.4 / T7.6 加入 `menubar-status.cjs`、`menubar-panel.cjs`；已接入 CI）必须通过。修改这些模块时同步维护注解；可能缺失的数值写成 `number|null`，不要用 0 代替。
- 本地服务和预览由执行模型自己启动，并在可用的浏览器中查看，不让用户手动启动。
