# 项目规则（AGENTS.md）

Token 用量助手：中文本机桌面助手（Windows x64 + Apple Silicon macOS），独立查看 AI 编程平台的额度/余额与本机编程工具的用量。非任何平台的官方客户端。

- 当前版本：**1.9.0-beta.6**（阶段 10「更多平台」T10.1 Kimi 开放平台余额、T10.2 OpenRouter Key 上限与花费；2026-10-29 发布。四种安装包由 CI 的 Release 工作流产出，见 [docs/RELEASING.md](docs/RELEASING.md)）
- 当前改进计划：[IMPROVEMENT_PLAN.md](IMPROVEMENT_PLAN.md)，其中第 1 节是用户已拍板的决策（D1–D17）
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
- 对外的隐私说明是 [docs/PRIVACY.md](docs/PRIVACY.md)（中英文，T9.4）：新增平台或工具来源、改变读取范围、存储位置或联网行为时同步更新，只写已实现且核实过的事实。

## 5. 平台与存储不变量

- `appId`（`local.commandcode.tokenusageassistant`）、`executableName`、已打包应用的 userData 路径一律不变。Mac 打包版：`~/Library/Application Support/TokenUsageAssistant`；Windows：原 Electron userData。Mac 开发版（未打包）用 `TokenUsageAssistant-Dev` 作为应用名和数据目录，Keychain 条目也随之独立（`platform.cjs` 的 `macDataName`）。Mac 上的 `--smoke-test`（打包版和开发版都是）用 `TokenUsageAssistant-Smoke` 作为应用名（`macSmokeName`），并且自 2026-10-25 起使用 Chromium 的模拟钥匙串（`use-mock-keychain`），**不读写任何真实钥匙串条目**，也就不会弹授权窗；打包版和开发版的条目更不受影响。（以前的 `TokenUsageAssistant-Smoke Safe Storage` 条目已不再使用。）
- 凭据加密：Windows 用 DPAPI，Mac 用 Keychain（Electron safeStorage）。DPAPI 文件绑定当前 Windows 用户，不能作为跨电脑备份。
- 升级时保留账户凭据、设置和窗口位置；配置损坏时不自动覆盖；旧迁移文件（例如 `local-source.json`）保留。
- 不引入新的原生依赖。不覆盖、不删除旧发布产物（统一存放在 `~/Documents/TokenUsageAssistant-releases/`）。其中的 `.app` 一律放在 `apps.noindex/<原目录名>/mac-arm64/` 下，不留在各版本目录里，避免系统按 bundle id 选中旧版（T8.12）；启动打包版一律用完整路径（`open "/Applications/Token 用量助手.app"`）。
- 多账户（最多 20 个）各自加密保存；轮询、缓存、告警相互隔离；支持区域选择和动态额度窗口。
- 某个来源格式异常或失败时，要显式报告并隔离，不能阻断其他来源。

## 6. 平台与工具契约要点

- **Command Code**：`https://api.commandcode.ai` 只读用量查询。
- **GLM / MiniMax / 火山**：固定官方只读额度接口（GLM `/api/monitor/usage/quota/limit`，MiniMax `/v1/token_plan/remains`，火山 `GetAFPUsage` 北京区），支持国内/国际区域。见 [PROVIDER-ADAPTATION-1.3.0](docs/PROVIDER-ADAPTATION-1.3.0.md)。
- **DeepSeek**：固定 HTTPS `GET /user/balance`，Bearer 鉴权，不跟随重定向；保留 `is_available` 和未知字段；`parts.balance` 与额度、工具用量、账单分开。见 [DEEPSEEK-BALANCE-1.6.0](docs/DEEPSEEK-BALANCE-1.6.0.md)。
- **Kimi 开放平台**（T10.1，D16）：固定 HTTPS `GET /v1/users/me/balance`，Bearer 鉴权，不跟随重定向；国内 `api.moonshot.cn` 为 CNY、国际 `api.moonshot.ai` 为 USD（币种由所选站点决定，不换汇，两个站点的 Key 互不通用）。金额是 JSON 数字，按服务端的最短十进制形式转成字符串保存，详情里不四舍五入（紧凑位置按 D17 ④ 两位小数，见第 8 节）；指数形式视为格式不兼容。`available_balance` 是核心字段，代金券、现金余额可选（缺失显示「—」）；现金为负标「欠费」并始终可见；可用余额 ≤ 0 为「不可用于调用」（与 DeepSeek 余额同一规则，琥珀色），不是查询失败。
- **OpenRouter**（T10.2，D16 ③）：固定 HTTPS `GET https://openrouter.ai/api/v1/key`，普通 API Key、Bearer 鉴权，不跟随重定向；不调用管理密钥接口。只展示**这把 Key** 的花费上限、预算与已报告花费（USD，UTC 日 / 周一起的周 / 月），不是账户余额也不是账单，与工具用量、其他平台不相加。`limit` 为 null 显示「不限」（不是 0），`limit_reset` / `reset_interval` 为 null 显示「不重置」；`budgets` 里 `key_limit` 一项与 Key 上限是同一个限制，只显示一次，重置时间取它的 `resets_at`（服务端给的，不自行推算）。Key 名称、用户 / 组织 / 工作区编号等身份字段一律不保存。金额按服务端数字的最短十进制形式显示，不四舍五入到一位（紧凑位置按 D17 ④ 两位小数，见第 8 节）。
- **OpenCode Go**：固定 HTTPS `GET /zen/go/v1/usage`，Bearer 鉴权，不跟随重定向，不调用推理。只展示服务端给出的三个百分比和重置时间，不编造余额、金额额度或续费日；舍入为 0 不能说明滚动窗口的起点。Zen / Black / 企业版查询不可用，不得暗示支持全部套餐。见 [OPENCODE-1.8.0-beta.5](docs/OPENCODE-1.8.0-beta.5.md)。
- **Codex 订阅**：只读 app-server 方法白名单：`initialize`、`initialized`、`account/read`、`account/rateLimits/read`。选定程序前只做初始化预检；保留用户所选配置；可直接选择 `Codex.app` 的 `Resources/codex`。区分进程、协议、登录、阶段超时四类失败，不暴露 stderr；不声称支持旧版 CLI 协议。
- **Codex 连接发现**：已保存的位置、`CODEX_HOME`、默认 `~/.codex`。只有一个时直接连接，多个时在应用内选择，手动选择作为回退；更新一个已丢失的保存位置时，不得静默改绑到另一个账户。见 [CONNECTION-UX-1.5.1](docs/CONNECTION-UX-1.5.1.md)、[MAC-TRIAL-1.8.0-beta.2](docs/MAC-TRIAL-1.8.0-beta.2.md)。
- **Codex rollout**：元数据快照不是请求数，请求状态未知。按结构契约读取（T9.13，D15）：任何版本只要核心计数（`input_tokens`、`output_tokens`、`total_tokens`）齐全且都是非负整数就读取，版本号只作记录；缓存与推理计数是可选字段，缺失显示「—」并标「部分字段缺失」；核心字段改名、缺失或类型不对一律拒绝（格式不兼容）。
- **Claude**：额度来自 statusLine，`context_window` 不是总消耗；按结构契约读取（T9.13，D15）：任何版本只要至少一个已知窗口（5 小时 / 每周）字段齐全就读取，有窗口但都不认识视为格式不兼容、保留原额度；没有任何窗口表示当前没有套餐额度、清空窗口。OTLP 请求事件的输入、输出是核心字段，缓存计数可选。OTLP 本地组件只监听回环地址，只采集启用之后的数据，覆盖缺口要明示。组件就绪和首次额度同步是两个独立状态。见 [SUBSCRIPTIONS-1.5.0](docs/SUBSCRIPTIONS-1.5.0.md)。
- 额度查询成功时，不因缺少工具日志或来源添加失败而显示失败；不重新启用用户已禁用的来源。
- **Zcode**：只读白名单 SQLite 投影；多个副本身份重叠时只做保守的暂停合并，不猜测哪份最新。见 [TOOL-SOURCES-1.4.0](docs/TOOL-SOURCES-1.4.0.md)。
- **OpenCode 数据库**：优先使用 step 记录，排除旧版镜像和会话创建之前的历史。
- **跟随上游（D15，2026-10-27；T9.13–T9.15 已实现）**：本机工具数据的可信度按结构契约判断（核心字段 / 可选字段；关系不一致按记录标 `invalidUsage`，不丢记录），三档状态：正常 / 部分字段缺失 / 格式不兼容；不再按版本号贴「版本未验证」。每个来源只记用量计数的字段名（T9.14，不含值，含正文或凭据意味的名字一律不记），字段集合变化时在来源卡片上提示 14 天，并写进诊断信息。契约在 `desktop/upstream-contracts.cjs`，依据见 [UPSTREAM-CONTRACTS](docs/research/UPSTREAM-CONTRACTS.md)。各工具代码里的「已复核版本」列表只决定每周检查（T9.1）把哪些新版本交给兼容性检查（T9.15，`scripts/upstream-compat.cjs`：Codex 比对官方协议定义、Harness 在官方运行时上跑运行时测试、Claude 无可机读定义只能如实写明；只在临时目录安装官方包，`--ignore-scripts`，不登录、不调用模型）。
- **Harness**：已验证 `0.1.7-rc.1`、`0.2.1-rc.2`（T8.13，2026-10-26 用户决定）/ session format 4 / JSONL schema 1。其他版本的运行时只有每个事件都符合已知结构才导出，记录写明实际版本（T9.13 起助手不再按版本贴标签）；字段改名、缺失或未知结束原因一律停止导出，不猜测。导出器 1.5.0 沿用 1.4.0 建立的来源身份。可选插件只导出启用后的白名单元数据，不含历史、正文、工具内容、凭据，也不代理请求。见 [插件说明](integrations/deepseek-harness/README.md)。

## 7. 交付与验证（过渡期：D1 / D3 / D4）

- 不改变应用行为的任务不出包。改变行为的任务在本机出 Mac 包（DMG + ZIP，文件名加 `-dev.<短 commit>`）；Windows 双包在执行记录中标「待 CI 补齐」，不得写成已交付。T2.3 完成后，三种包统一由 CI 产出。
- 版本：阶段 1–2 保持 1.8.0-beta.5；阶段 3–5 依次为 1.8.0-beta.6–beta.8；菜单栏首版（T7.3–T7.8）为 1.9.0-beta.1，菜单栏真机验收后的改进（T7.9–T7.12、T4.7）为 1.9.0-beta.2，整体复盘后的稳固版（T8.1–T8.8）为 1.9.0-beta.3，T6.1–T6.3 为 1.9.0-beta.4，阶段 9「开源与增长」（T9.1–T9.11）攒成 1.9.0-beta.5（D14），阶段 10「更多平台」（T10.1、T10.2、T10.4）攒成 1.9.0-beta.6（D16），阶段 11「看得全、装得上」以 T11.9 收尾：达到 1.9.0 正式版门槛（D17 加入 Windows 真机验收）就发 1.9.0，否则发 1.9.0-beta.7，之后顺延为 1.9.0-beta.x，达到 1.9.0 正式版门槛后去掉 beta（D3，2026-10-18 调整）。版本号只在一组任务的最后一个任务合并时修改。
- Mac 包：本机 electron-builder 构建 `.app` + DMG/ZIP（arm64、hardened runtime、entitlements、不公证）。签名一律 ad-hoc（2026-10-25 试过用户的自签名证书：钥匙串的分区表对没有 Apple 团队 ID 的程序仍按每次构建的哈希记录，换证书后每个新包照样弹授权，已撤回）。装新版本时正式条目弹一次授权属于 D4 的已知限制。`codesign --verify --deep --strict` 必须通过，Electron fuses 必须与 `electron-builder.yml` 一致（T9.2，`scripts/fuses.cjs`；`RunAsNode` 不能关），打包后的原生 smoke 必须 `ok`；`spctl` 预期为 rejected，如实记录，不算通过。
- D4（暂不购买 Apple Developer 账号）带来的限制：首次打开要到「系统设置 → 隐私与安全性」点「仍要打开」（2026-10-25 在 macOS 15.7.9 实测：弹窗里没有「打开」按钮，「右键 → 打开」不能放行，H3）；只能消除「已损坏」提示，不能消除「无法验证开发者」提示；覆盖升级后可能弹出 Keychain 授权；Mac 不做自动更新。不引导用户关闭 Gatekeeper。
- 出包时核对包内版本和代码与源码一致。只改了源码，不得称为已交付。
- 每个任务按改进计划第 0.2 节执行：独立分支、`--no-ff` 合并、追加执行记录。
- 确认分三档（D13，2026-10-25）：内部可撤回的步骤直接做完并接着做下一个任务；界面截图与公开发版攒到节点一次确认（每个版本只确认一次，确认后由执行模型完成打标签之后的全部步骤）；只能用户亲手做的事记进 PROJECT_HANDOFF「需要你亲手做的事」，在节点一次交出。遇到红线冲突、范围变化、计划外失败时仍立即停下来问。制定新计划或新阶段时，先在会话里给大纲和待定问题，用户同意后才写进改进计划（D14 ⑥）。
- 有意义的决策变化要同步更新 `PROJECT_HANDOFF.md`（只写当前快照）和 `CHANGELOG.md`。
- `README.md` 与 `README.en.md` 同结构（T9.8，D14）：改中文 README 时在同一个任务里同步英文版；英文版写明界面目前只有中文。

## 8. UI 规则

- 保持已批准的刻度环 Logo（母版为 `desktop/assets/brand-mark.svg`）和现有 UI 风格：白底、细线、Geist / Geist Mono、分段绿色额度条、紫色 Token 强调、深浅色主题（参考 commandcode.ai 用量页）。不改名，不重做页面，不替换功能图标。
- 任何新视觉元素或界面改动，都要先出浅色和深色的截图或草图，用户确认后才能实现和合并（D10）。从用户选定的 mock 实现时，以 mock 为准。
- 界面代码放在 `src/`；`dist/client` 由构建生成；`src/generated` 由 `scripts/prepare-analytics-preview.mjs` 生成，要改就改 `desktop/` 下对应的纯模块。
- 已定交互：左侧导航和标题栏固定，只有主内容滚动；所有下拉菜单用统一的自定义组件，可键盘操作，不出现系统原生 select；悬浮窗默认紧凑，点击展开；侧栏第二个图标（SquaresFour）进入用量分析，悬浮窗开关放在总览；优先展示 5 小时/每周剩余额度和重置时间，Token 与费用分开。
- 回归保护：悬浮窗收起后回到原来的底边（1.4.1）；侧栏品牌按钮零内边距，Logo 居中；Windows 窗口使用多尺寸 ICO，并显式设置任务栏信息，指向稳定启动器或安装后的 EXE；Mac 打包版以 bundle 内的 icns 为准（Dock 图标覆盖只在开发版生效）。
- 品牌或图标改动，必须验证渲染后的 SVG/路径中心，以及最终包中系统返回的原生窗口图标；只提取 EXE 资源不够。
- 说明文字（T6.3，2026-10-25 用户确认）：超过约 40 字的状态说明用「一行结论 + ⓘ 详情」（`src/Disclosure.jsx`），默认收起、不记忆；需要用户操作的提示、错误信息、需要确认的文字和本身就是详情的弹窗不折叠。后端说明分成 `note` / `noteDetail`、`message` / `messageDetail` 两个字段。
- 用户给出持久的设计反馈或决定时，记录在本节。
- Mac 菜单栏（2026-10-18 起）：收纳态是菜单栏状态图标（默认 ②「刻度环 + 一个数值」，平时单色、告警按程度变黄 / 红），左键弹出面板、右键原生菜单；面板宽 360pt、跟随应用主题，三格只显示账户接口数据，面板内切换账户不影响主窗口。细节与已批准的偏差见 [docs/island-1.9.0-design/HANDOFF.md](docs/island-1.9.0-design/HANDOFF.md) §3、§4。设置在「账户与设置 → PREFERENCES」的「菜单栏图标与面板」子组（仅 Mac，T7.7）：图标形态、菜单栏显示用量、告警时变色、面板截屏与共享保护；图标被系统藏到刘海后面时只提示，不自动切换形态。同一账户内图标先显示额度窗口（5 小时 / 每周等），月度余额不参与「剩余最少」的比较；没有可用窗口时才显示金额；余额告警比窗口更严重时显示余额（T7.9，2026-10-18 用户决定）；面板账户标签用同一规则（T7.11）。金额在菜单栏图标、面板账户标签、悬浮窗与总览的「全部账户」里按 D17 ④ 显示：两位小数（十进制逐位四舍五入，不经浮点），不足 0.01 的非零金额显示「<0.01」，不显示「0.00」；面板的余额行、主窗口详情与存储保留服务端给出的全部位数（T11.3，`balance-domain.cjs` 的 `compactAmount`）。
- 一眼看全（T11.1–T11.3，2026-10-30 用户选定草图方案 A，设计稿 [docs/design/T11-glance/](docs/design/T11-glance/)）：有两个及以上账户时，总览顶部加「ALL ACCOUNTS / 全部账户」卡片网格，按剩余最少排序（与菜单栏图标同一规则），点卡片切换当前账户，下面的单账户详情不变；悬浮窗收起时只显示最紧的账户，展开后列出全部账户。Windows 托盘图标只画刻度环、不画数字，告警时整环着色（低于阈值带黄、用尽全红、没有数据只有灰环）；面板里平台不提供的格子折叠，胶囊金额两位小数（D17 ④），最紧的窗口总在列表里；节奏行只给 Command Code（D17 不新增预测算法）。Windows 托盘（T11.2）：左键弹出与 Mac 相同的面板，贴着托盘所在的任务栏边、在工作区内、不带箭头（`desktop/panel-placement.cjs`）；双击打开主窗口，右键菜单不变；悬停提示按菜单栏同一规则列出各账户的最紧值，不超过 127 个字符，放不下的写「另 N 个账户」；设置在「托盘图标与面板」子组（没有图标形态，其余三项同 Mac）；总览顶部的固定到任务栏说明点「知道了」后不再出现（`trayPinHint`），只给说明，不改系统设置。
- 首次启动向导与设置分区（T11.4，2026-10-31 用户确认草图，设计稿 [docs/design/T11.4-onboarding/](docs/design/T11.4-onboarding/)）：只在没有任何账户和工具来源、账户列表可读、且用户没有完成或跳过过（设置 `setupWizard`）时出现在总览（`desktop/onboarding.cjs`）；打开后一直保持到完成或跳过，中途连上账户不关闭；第 2 步就是设置页的连接表单（向导模式，只能新建连接）；Windows 完成第 4 步时一并收起总览的固定说明。「计费账户归组 / 工具记录关联」在设置页默认折叠的「高级」区里，不记忆展开状态；有需要重新确认的归组或规则（或关联数据有问题）时自动展开并在标题上写明几项（需要用户操作的提示不折叠）。

## 9. 测试规则

- 证据三级：①合成契约测试；②打包原生 smoke（隔离样例）；③真实账户或真机验收。没做过 ③ 的，不得写成「已验证」。Claude 用 computer use 在用户 Mac、真实账户上实测的结果也计为 ③，统一标注「③（Claude 代测）」；需要用户亲自操作的项（改系统设置、输入密码、外接屏、锁屏等）仍由用户做（D12 ②）。某个平台的真实观察不能证明其他平台（例如 Codex 的只读观察不证明 Claude 核账）。
- 不做长时间稳定性/soak 测试（用户已叫停）；加速的短时运行不能当作两小时 soak。
- `--smoke-test` 必须配新建的隔离 `--test-directory`；迁移和升级验证只能指向隔离目录，不得指向真实 userData。
- Mac 开发版（`pnpm run desktop`）自 T3.1 起使用独立的数据目录和 Keychain 条目，可以直接用于启动验收；打包版和 smoke 仍按上一条使用隔离目录。smoke 使用模拟钥匙串（见第 5 节），不会弹钥匙串授权窗；代价是 smoke 不再测到真实钥匙串读写，这部分由真机使用覆盖。
- 因 Harness 运行时未安装而跳过的测试要明确报告，不算通过。当前基线：本机 418 通过 / 0 失败 / 6 跳过（共 424）；CI 安装了两个已验证版本的 Harness 运行时（T8.10、T8.13），为 424 通过 / 0 失败 / 0 跳过。本机要跑这 6 项，按插件 README 安装两套运行时并设置四个环境变量。
- `pnpm run typecheck`（T5.5 起：8 个纯领域模块的严格 JSDoc 类型检查，T7.4 / T7.6 加入 `menubar-status.cjs`、`menubar-panel.cjs`，T6.2 加入 `coverage-report.cjs`，T9.13 加入 `upstream-contracts.cjs`，T11.1 加入 `account-overview.cjs`，T11.2 加入 `panel-placement.cjs`，T11.4 加入 `onboarding.cjs`；已接入 CI）必须通过。修改这些模块时同步维护注解；可能缺失的数值写成 `number|null`，不要用 0 代替。
- 本地服务和预览由执行模型自己启动，并在可用的浏览器中查看，不让用户手动启动。
