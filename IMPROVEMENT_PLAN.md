# Token 用量助手 · 改进计划（2026-10）

> 基线版本：1.8.0-beta.5（Mac 本机构建 `.app` + DMG，Windows 双包在旧机器上）
> 来源：2026-10-14 的项目审查（覆盖 PROJECT_HANDOFF.md、docs/island-1.9.0-design/HANDOFF.md、AGENTS.md、README.md、`desktop/` 全部核心模块、前端入口与部分测试）
> 用途：交给执行模型按任务逐项实施。每个任务都写明了目标、背景、步骤、验收标准和禁止事项。

> 2026-10-23 瘦身（T8.9）：已完成任务的详情、2026-10-14 审查结论、已关闭的问题和此前的执行记录已移到 [docs/history/IMPROVEMENT_PLAN-through-1.9.0-beta.2.md](docs/history/IMPROVEMENT_PLAN-through-1.9.0-beta.2.md)（原文快照，未改动）。本文只保留：使用说明、决策、未完成与已跳过的任务、未关闭的问题和此后的执行记录。

---

## 0. 给执行模型的使用说明（每次开工先读）

### 0.1 读取顺序

1. 本文件：先看第 1 节的决策清单，再从第 3 节的任务总览里找到下一个「未完成、且没被决策阻塞」的任务。
2. `AGENTS.md`：项目长期规则。与本文冲突时，以第 1 节中用户已拍板的决策为准；用户没拍板的，以 AGENTS.md 为准，并停下来询问。
3. `PROJECT_HANDOFF.md`，以及任务涉及的专题文档。

### 0.2 每个任务的标准流程

1. 确认依赖任务已完成，所需决策已有答案。没有答案就停下，向用户提问，不要替用户决定。
2. 从 `main` 新建分支 `task/<任务ID>-<简短名>`。
3. 记录基线：运行 `pnpm run test:desktop`，记下通过数、失败数、跳过数（beta.5 基线为 249 通过、0 跳过）。
4. 只做本任务范围内的改动，不顺手修别的东西。发现计划外的问题，写进第 5 节「执行中发现的问题」。
5. 验收：逐条执行任务里的验收标准。测试数只能持平或增加，不能减少。
6. 合并：`git merge --no-ff`，保证每个任务都能单独回滚。按 D13：合并、推送、等 CI 通过后直接开始下一个任务，不再逐个询问；只有 D13 规定要停下的情况才停。
7. 回到第 6 节「执行记录」追加一行：日期、任务 ID、commit、测试结果、证据等级、未完成项。推送了提交的，写明分支 CI / 推送后 CI 的运行号和结果；打了标签的，另写标签 CI 和 Release 的运行号和结果（T8.10）。
8. 把本文件中该任务的复选框改成 `[x]`。

### 0.3 全局红线（任何任务都不得违反，摘自 AGENTS.md）

- **数据语义**：缺失显示「—」，不能显示 0；`resetAt=0` 显示「未启用」，不能编造倒计时；USD 和 CNY 不合并、不换汇；余额差不当作消费；订阅百分比不套用到按量余额；平台汇总和工具汇总不相加；缓存/推理子项不重复计入总量；失败或取消的请求如有报告用量，照样计入。
- **账户归属**：工具记录默认 `accountId:null`，只有已确认的有效关联规则才能归属，不能从当前选中的账户或模型名推断。
- **隐私**：不读取、不记录、不导出对话正文、工具内容、原始错误文本、原始 stderr 或凭据。日志和诊断包同样遵守。
- **只读**：不调用模型生成，不调用任何改变登录状态或消耗额度的接口，不修改第三方工具的数据库或配置。
- **不变量**：`appId`、`executableName`、已打包应用的 userData 路径一律不变；不引入新的原生依赖；不覆盖、不删除旧发布产物。
- **UI**：保持已批准的 Logo 和现有 UI 风格。任何新的视觉元素，都要先给用户看方案（截图或草图），确认后才能实现。
- **诚实分级**：验证结论必须标明等级——①合成契约测试、②打包原生 smoke（隔离样例）、③真实账户或真机验收。没做过 ③ 的，不得写成「已验证」。
- **不做长时间稳定性/soak 测试**（用户已明确叫停）。

### 0.4 关于行号

下文引用的行号对应 1.8.0-beta.5 的原始代码。T1.3 格式化之后行号会全部改变，届时请按函数名或代码片段定位。

---

## 1. 决策清单（用户已于 2026-10-15 拍板，之后陆续追加）

以下决策已由用户确认，执行时直接遵循。本文与 AGENTS.md 冲突时，以本节为准。

| ID | 议题 | 用户决定 | 影响的任务 |
|---|---|---|---|
| D1 | CI 就绪前的交付规则 | **过渡方案**：<br>• 不改变应用行为的任务（阶段 1–2、纯重构）不出包。<br>• 改变行为的任务在本机出 Mac 包（DMG + ZIP），Windows 双包在执行记录中明确标「待 CI 补齐」，不得写成已交付。<br>• T2.3 完成后，三种包统一由 CI 产出。 | T3.x 起所有改行为的任务 |
| D2 | 是否建 GitHub 仓库做 CI | **建私有仓库**（只放源码） | T2.1–T2.4 |
| D3 | 版本号策略 | 阶段 1–2 不升版本。之后每个阶段出一个测试版：阶段 3 = 1.8.0-beta.6，阶段 4 = beta.7，阶段 5 = beta.8，阶段 6 = beta.9。1.9.0 留给灵动岛。版本号只在阶段的最后一个任务合并时修改。<br>**2026-10-18 调整（用户决定）**：菜单栏首版（T7.3–T7.8）合并时升为 **1.9.0-beta.1**；阶段 6 之后顺延为 1.9.0-beta.x，不再发 1.8.0-beta.9<br>**2026-10-23（D12）**：稳固版（T8.1–T8.8）合并时升为 **1.9.0-beta.3** | 阶段 3 起的打包 |
| D4 | 是否购买 Apple Developer 账号 | **暂不购买**。T3.5 跳过；Mac 继续使用 ad-hoc 签名、不做公证，因此 Keychain 升级弹框的风险继续存在（由 T3.4 兜底），Mac 也不做自动更新（Squirrel.Mac 要求正式签名）。<br>**2026-10-23 重新评估（D12 ⑧）**：用户同意按复盘推荐重新评估；是否购买由用户确认，注册和付费由用户完成，执行模型不代办。到位后启用 T3.5；在此之前仍按本条执行<br>**2026-10-25（用户决定）**：为解决每次新构建都弹钥匙串授权，用户在登录钥匙串创建了自签名代码签名证书「TokenUsageAssistant Local Signing」（有效期 3650 天，仅本机）；本机构建曾改用它签名。**同日实测无效并撤回**：钥匙串的访问控制表确实改为按证书记录，但分区表对没有 Apple 团队 ID 的程序仍按每次构建的 cdhash 记录，第二个测试包照样弹窗（smoke 条目分区表多出两个测试包的 cdhash 为证）。改为：本机构建回到 ad-hoc；打包后的 smoke 使用 Chromium 模拟钥匙串，不再弹窗；用户装新版本时正式条目弹一次授权，先接受（要根治需带团队 ID 的 Apple 证书，见 D12 ⑧） | T3.5（跳过）、T3.4、T5.2 |
| D5 | 旧浏览器原型和 Sites 兼容文件 | **删除**。用户明确撤销 AGENTS.md 中「保留 `.openai/hosting.json`、`worker/index.js`、`scripts/prepare-sites-build.mjs`、`tests/sites-worker.test.mjs`」的要求，以及「保留原浏览器原型作为参考」的要求。 | T1.2、T1.4 |
| D6 | 仓库杂物 | **全部处理**：删除 `pelican-bike.html`、`a/` 目录及所有 `.DS_Store`；`docs/island-1.9.0-design-handoff.zip` 不纳入 git；`release-v*/` 移到 `~/Documents/TokenUsageAssistant-releases/`。 | T1.1、T1.2 |
| D7 | 账户核对页 | **改名为「覆盖范围报告」**，以展示各来源的覆盖缺口为主；`compareEvidence` 逻辑不变，差值区块只在 `available:true` 时出现。 | T6.2 |
| D8 | 更新检查渠道 | **另建一个公开仓库，只放安装包**（不放源码），应用通过它的 Releases 检查更新。仓库名已于 2026-10-15 确认：`junjunup/TokenUsageAssistant`（已创建，只含 README）。 | T2.3、T5.2 |
| D9 | 灵动岛待定事项 | ② 告警时整个耳区替换为告警内容<br>③ 用户未设置余额阈值前不发余额告警，首次启用时引导设置<br>④ 红优先于琥珀，同级时显示最快重置的账户<br>⑤ 悬停参数在真机调好后定值，不放进设置<br>⑥ 锁屏可见性只作为真机确认项，不再是设计议题<br>⑦ **收纳态是否常显耳区，在设置中由用户选择**（「常显」/「仅告警时」），默认值等 T7.1 实测遮挡情况后再请用户确认<br>**2026-10-18 调整（用户看完 T7.1 报告后决定）**：放弃耳区方案；收纳态改为菜单栏右侧本应用的状态栏图标，展开以「点菜单栏图标弹出面板」为主，刘海悬停下落面板作为以后可增添的特色。② ⑦ 随耳区作废；③ ④ ⑥ 的原则保留（④ 改为决定菜单栏图标显示哪个账户）；⑤ 只在做刘海悬停面板时适用。岛内是否加入歌曲、系统资源等内容，先记录为待调研方向，不进入当前任务 | T7.0、T7.1、岛首版 |
| D10 | 界面改动 | **所有界面改动都要先出截图或草图，用户确认后再实现**，包括：导出诊断按钮、「重新读取」按钮、更新提示、平台验证分级标签、说明文字折叠、覆盖范围报告页、岛设置项。 | T3.3、T3.4、T5.2、T6.x、T7.x |
| D11 | 开源（2026-10-18） | 开发仓库以 **MIT** 开源，改名为 `token-usage-assistant`；安装包仓库 `junjunup/TokenUsageAssistant` 保持不变（已发布客户端的检查更新依赖它）。历史中的 QQ 邮箱和截图不重写，只在新提交中清理（以后的提交用 GitHub noreply 邮箱）。源码仓库的 Release 随仓库公开，审核关口改为 Publish 演练。`package.json` 的 `name` 保持 `commandcode-companion`（Windows 数据目录取自它）。 | 仓库、发版流程 |
| D12 | 整体复盘后的方向（2026-10-23，[docs/REVIEW-2026-10.md](docs/REVIEW-2026-10.md) 的 Q1–Q8，用户全部按推荐） | ① Electron 为安全公告 GHSA-jr5w-w6x2-84p9 立即升到 44.9.x（≥ 44.9.1），为此破例「依赖发布满两周」的规则，作为 1.9.0-beta.3（Q1）<br>② Claude 用 computer use 在用户 Mac、真实账户上实测的结果计为 ③，统一标注「③（Claude 代测）」；需要用户亲自操作的项（改系统设置、输入密码、外接屏等）仍由用户做；验收清单头部规则相应修改（Q2）<br>③ 路线改为：稳固版 1.9.0-beta.3 + 文档与流程收口 → T6.1 → T6.2 / T6.3 → 先测量再定 T4.2 / T7.2；T7.2、增量一、增量二推迟，刘海悬停面板（A）搁置（Q3）<br>④ Harness 去留待用户告知所用版本（Q4，T8.13）<br>⑤ Claude 采集端口监听失败时自动换端口，更新配置与启动器，并提示重新打开 Claude Code 会话（Q5）<br>⑥ 仓库整理：删除已合并分支，移除 2 个 worktree，调研文档合并到 main，`.commandcode/taste/` 移出仓库并加入 `.gitignore`（历史不重写）（Q6）<br>⑦ 发布目录里的旧 `.app` 移到以 `.noindex` 结尾的子目录，不删除，DMG / ZIP 原样保留（Q7）<br>⑧ D4 重新评估（Q8，见 D4） | T8.1–T8.14、T6.x、T4.2、T7.2、T3.5 |
| D13 | 确认流程分三档（2026-10-25，用户决定：原先每一步都等用户确认，大大拖慢进度） | **第一档：执行模型直接做完，不问**——按已定顺序做完一个任务就接着做下一个；建分支、改代码、跑测试、本机打包与存档、`--no-ff` 合并到 main 并推送、在 main 上试跑 Release、修正自己的文档错误。安全网是自动关卡：推送后等 CI 两个平台通过才进行下一步；测试数只增不减；不放宽断言；打包校验必须通过。<br>**第二档：攒起来，在节点一次交给用户决定**——界面截图（D10）做好后先接着做不依赖它的任务，几张一起确认；**公开发版每个版本只确认一次**：到节点时一次交出标签、Release、存档核对、演练结果与公开说明全文，用户回一句「发」，执行模型完成打标签之后的全部步骤（包括用 `gh` 发布源码仓库草稿、Publish 演练与正式发布、发布后核对）；GitHub 设置、删除、花钱的事照旧单独问，但尽量合并在一次里问。<br>**第三档：只能用户亲手做的，攒成清单**——钥匙串授权、真机验收、外接屏 / 锁屏、浏览器下载后首次打开、重装 Harness 插件、购买账号、创建证书等，记在 PROJECT_HANDOFF「需要你亲手做的事」，在版本节点一次交给用户，不中途停下等。<br>**仍然立即停下来问**：与数据红线 / 隐私冲突；任务范围要变；计划外、又不是已知偶发的失败；需要第二档的决定而后面没有不依赖它的任务可做。每次用户回来时，先用两三行说明做了什么、停在哪里；执行记录照常逐条写，用户随时可以打断。 | 全部任务、发版流程 |
| D14 | 开源与增长（2026-10-26，用户决定） | ① 方向：**开源、积攒用户**；任务按「对新用户的影响」排序：装得上、找得到、信得过、用得久。<br>② **攒一批再发**：阶段 9 的任务都合并到 main，最后由 T9.11 一次升为 1.9.0-beta.5 并发布（仍按 D13 只确认一次），中间不单独发版。<br>③ **签名暂不花钱**：维持 D4（不买 Apple Developer 账号），Windows 也不买代码签名证书；改为把首次打开、升级时的钥匙串授权、SmartScreen 提示的说明写清楚。<br>④ **做英文 README**（界面仍只有中文，README 里写明）。<br>⑤ **新平台先只调研、不实现**：调研结果交用户决定是否、何时实现。<br>⑥ 以后制定新计划或新阶段：先在会话里给大纲和待定问题，用户同意后才写进本文件；执行仍按 D13。 | 阶段 9 全部任务 |
| D15 | 跟随上游：信任结构契约而不是版本号（2026-10-27，用户决定） | ① 读取本机工具数据时，信任来自**结构契约**（核心字段 / 可选字段 / 语义约束），不再按版本号贴「版本未验证」标签；版本号只放在详情与诊断信息里。<br>② 状态改为三档：**正常**（符合契约）、**部分字段缺失**（可选字段缺失时显示「—」并写明缺了什么，其他字段照常）、**格式不兼容**（核心字段缺失或违反约束，停止读取并明确提示，不猜）。<br>③ 允许在本机记录每个来源记录的**字段名集合**（只有字段名，不含任何值或内容），用于升级后的变化提示和诊断信息。<br>④ 工具升级导致读不到数据时，兼容性修复可以不等批次单独发版（D14 ② 的例外，仍按 D13 确认一次）。<br>⑤ T9.12–T9.15 放进 1.9.0-beta.5。<br>⑥ 如实说明「正常」的含义：结构与约束都对上，不等于逐条核账；字段名不变而含义改变的情况只能尽量挡住。 | T9.12–T9.15、AGENTS §6 |

**界面方案确认流程（D10）**：执行模型先在浏览器预览模式（`pnpm run dev`，使用 `previewBridge` 预览数据）中实现方案，截取浅色和深色两张图，连同文案一起交给用户。用户确认后才能合并。未确认的界面改动不得合并到 main。

---

## 2. 审查结论摘要

2026-10-14 的审查结论已归档（见上方归档快照第 2 节）。2026-10-23 的整体复盘见 [docs/REVIEW-2026-10.md](docs/REVIEW-2026-10.md)，其决定为 D12。

---

## 3. 任务总览

阶段 1–5、阶段 7 的 T7.0–T7.1b 与 T7.3–T7.12、以及 T4.7 已全部完成；完整任务表、旧的推荐顺序和版本节点见归档快照第 3 节。下表只列未完成和已跳过的任务。

| 阶段 | 任务 | 改变应用行为？ | 依赖 | 决策 | 状态 |
|---|---|---|---|---|---|
| 3 | ~~T3.5 Developer ID 签名与公证~~ | — | — | D4 = 暂不购买 | 跳过 |
| 4 | T4.2 Claude 导出增量读取（T4.0 后降级：本机没有 Claude 来源，测不到；T7.2 之前必须完成） | 是 | T4.0 | D1 | [ ]（D12：先测量，见 T8.14） |
| 4 | ~~T4.3 Codex 扫描优化~~ | — | T4.0 | T4.0：真实数据约 1 ms，合成 139 MB 时也只有首次冷扫描超过 1 s | 跳过 |
| 6 产品 | T6.1 平台验证分级标注 | 是（UI） | T5.3a | D10 | [x] |
| 6 产品 | T6.2 核对页去留 | 是（UI） | — | D7、D10 | [x] |
| 6 产品 | T6.3 说明文字渐进披露 | 是（UI） | — | D10 | [x] |
| 7 灵动岛 | T7.2 实时尾随通道 | 是 | T4.2、T7.1 | D1 | [ ]（D12：推迟） |
| 7 灵动岛 | 之后 | 按 `docs/island-1.9.0-design/HANDOFF.md` §8：首版 → 增量一 → 增量二；刘海悬停面板（A）单独排期。**D12：增量一、增量二推迟，刘海悬停面板搁置** | | | |
| 8 稳固与收口 | T8.1 Electron 安全更新（44.9.x）与 Dependabot 告警 | 是 | — | D1、D12 | [x]（随 1.9.0-beta.3 发布） |
| 8 稳固与收口 | T8.2 偏好前向兼容与回滚说明 | 是 | — | D12 | [x]（随 1.9.0-beta.3 发布） |
| 8 稳固与收口 | T8.3 锁屏暂停的兜底恢复 | 是 | — | D12 | [x]（随 1.9.0-beta.3 发布） |
| 8 稳固与收口 | T8.4 Claude statusLine 额度改为结构校验 | 是 | — | D12 | [x]（随 1.9.0-beta.3 发布） |
| 8 稳固与收口 | T8.5 Claude 采集端口失败时自动换端口 | 是（提示文案走 D10） | — | D10、D12 | [x]（随 1.9.0-beta.3 发布） |
| 8 稳固与收口 | T8.6 检查更新识别开发包版本；账户加载记耗时 | 是 | — | D12 | [x]（随 1.9.0-beta.3 发布） |
| 8 稳固与收口 | T8.7 应用许可证与第三方声明随包 | 是（包内容） | — | D11、D12 | [x]（随 1.9.0-beta.3 发布） |
| 8 稳固与收口 | T8.8 1.9.0-beta.3 收尾与发版 | 是 | T8.1–T8.7、T8.10 | D3、D12 | [x]（1.9.0-beta.3，2026-10-25 发布） |
| 8 稳固与收口 | T8.9 文档收口（复盘第 2 节、证据口径、补齐 beta.2 发版第 4–5 步、计划归档瘦身） | 否 | — | D12 | [x]（首次打开说明待用户实测后补改） |
| 8 稳固与收口 | T8.10 发版流程加固（辅助脚本、公开说明取自 CHANGELOG、CI 跑 Harness 运行时测试、smoke 失败留证据） | 否 | — | D12 | [x] |
| 8 稳固与收口 | T8.11 仓库整理（分支、worktree、调研文档、偏好笔记、分支与标签保护） | 否 | — | D12 | [x] |
| 8 稳固与收口 | T8.12 发布目录旧 `.app` 移到 `.noindex` 子目录 | 否 | — | D12 | [x] |
| 8 稳固与收口 | T8.13 Harness 去留（待用户告知所用版本） | 视决定 | — | D12 | [x]（适配 0.2.1-rc.2，其他版本按结构校验） |
| 8 稳固与收口 | T8.14 测量 Claude 导出的读取耗时与文件大小（决定 T4.2 / T7.2） | 否 | — | D12 | [x]（结论：暂不做 T4.2，见执行记录） |
| 9 开源与增长 | T9.1 上游版本检查脚本 | 否 | — | D14 | [x] |
| 9 开源与增长 | T9.2 Electron fuses 收紧 | 是（包配置） | — | D14 | [x] |
| 9 开源与增长 | T9.3 「未启用」措辞统一与通知「<1%」 | 是（UI） | — | D10、D14 | [x] |
| 9 开源与增长 | T9.4 隐私与安全说明（`docs/PRIVACY.md`、`SECURITY.md`） | 否 | — | D14 | [x] |
| 9 开源与增长 | T9.5 贡献与反馈入口（issue 模板、`CONTRIBUTING.md`） | 否 | — | D14 | [x] |
| 9 开源与增长 | T9.6 安装与升级说明写清楚（含常见问题） | 否 | — | D4、D14 | [x] |
| 9 开源与增长 | T9.12 调研：各工具的稳定读取途径与可自动比对的定义（只调研） | 否 | — | D15 | [x] |
| 9 开源与增长 | T9.13 结构契约与三档状态 | 是（UI） | T9.12 | D10、D15 | [x] |
| 9 开源与增长 | T9.14 结构指纹与变化提示 | 是（UI） | T9.13 | D10、D15 | [x] |
| 9 开源与增长 | T9.15 自动兼容性检查 | 否 | T9.1、T9.12 | D15 | [x] |
| 9 开源与增长 | T9.7 README 改版（截图、定位、平台与验证等级） | 否 | T9.3、T9.6 | D14 || [x] |
| 9 开源与增长 | T9.8 英文 README | 否 | T9.7 | D14 | [ ] |
| 9 开源与增长 | T9.9 新平台调研（只调研） | 否 | — | D14 | [x] |
| 9 开源与增长 | T9.10 安装包仓库 README 与公开说明模板对齐 | 否（公开内容随发版确认） | T9.7、T9.8 | D13、D14 | [ ] |
| 9 开源与增长 | T9.11 1.9.0-beta.5 收尾与发版 | 是 | T9.1–T9.10、T9.12–T9.15 | D3、D13、D14、D15 | [ ] |

**2026-10-23 起的执行顺序（D12，用户按复盘推荐确认）**：T8.9 → T8.11 → T8.12 → T8.1 → T8.2 → T8.3 → T8.4 → T8.5 → T8.6 → T8.7 → T8.10 → T8.8（发布 1.9.0-beta.3）→ T6.1 → T6.2 / T6.3 → T8.14 → 按测量结果再定 T4.2 / T7.2。T8.13 等用户告知 Harness 版本后插入。仍然每次只做一个任务；T8.9–T8.12 不改应用行为，可以在稳固版各任务之间穿插。

**2026-10-27 调整（D15）**：T9.1–T9.6 已完成，之后的顺序为 T9.12（与 T9.9 一起做，都是只读调研）→ T9.13 → T9.14（与 T9.13 一起出 D10 截图）→ T9.15 → T9.7 → T9.8 → T9.10 → T9.11。原 Codex 0.164 是否单独复核的问题并入 T9.12 / T9.13。

**2026-10-26 起的执行顺序（D14）**：T9.1 → T9.2 → T9.3（D10 截图出来后先接着做后面不依赖它的任务）→ T9.4 → T9.5 → T9.6 → T9.9 → T9.7 → T9.8 → T9.10 → T9.11（发布 1.9.0-beta.5）。已在 main、尚未发布的 T8.13（Harness 0.2.1-rc.2）和首次打开说明更正（H3）随 beta.5 一起发布。

**1.9.0 正式版门槛（D14，T9.11 之后另行确认）**：真机验收清单剩余项由用户补测完；beta.5 日常使用一周没有新问题；上游版本检查没有未处理项。达到后去掉 beta，作为对外推广的第一个正式版本。

**版本**：阶段 8 的稳固版（T8.1–T8.8）合并时升为 1.9.0-beta.3（D3、D12），之后顺延为 1.9.0-beta.x。阶段中间的任务按 D1 处理：改变行为时在本机出 Mac 包供用户试用，但不升版本号。这类包的文件名加后缀 `-dev.<短 commit>`，避免和正式 beta 混淆。

---

## 4. 任务详情（只列未完成和已跳过的任务）

#### T3.5 Developer ID 签名与公证（已跳过：D4 = 暂不购买）

> 用户决定暂不购买 Apple Developer 账号，本任务不执行。以下内容保留，供将来改变决定时参考。Mac 继续使用 ad-hoc 签名，首次打开仍需右键 → 打开，`spctl` 继续如实记录为 rejected。


- 在 `electron-builder.yml` 的 mac 段中去掉 `identity: "-"`，`notarize` 改为读取环境变量 `APPLE_ID`、`APPLE_APP_SPECIFIC_PASSWORD`、`APPLE_TEAM_ID`；`hardenedRuntime` 和 entitlements 保持不变。
- 证书通过 `CSC_LINK` 和 `CSC_KEY_PASSWORD` 放进 CI secrets，**不进仓库**。
- 验收：`spctl -a -vv` 返回 accepted；`xcrun stapler validate` 通过。在 MAC-ACCEPTANCE-CHECKLIST 中补充一项：「从 ad-hoc 版升级到签名版时，Keychain 弹框一次是预期行为」。
- 完成后再评估 electron-updater 自动更新（单独开任务，不在本任务范围内）。

#### T4.2 Claude 导出增量读取

**背景**：`scanClaude` 每次查询都从头读取整个 `usage.jsonl`。

**步骤**

1. 照搬 `harness-reader.cjs` 的模式：
   - 用 `tool_cursors` 记录文件身份（dev:ino）、偏移量和尾部 256 字节锚点；
   - 新增的行 upsert 进 `tool_records`。
2. 冲突规则沿用现有 Map 的语义：`if(!old || record.usageReported || !old.usageReported)` 时覆盖。用 SQL 的 `ON CONFLICT … DO UPDATE … WHERE` 实现，或者先查再写。
3. 查询时从 `tool_records` 按时间范围读取。
4. `sessions.json` 回填项目名的逻辑保持不变。
5. 文件被替换或截断时（身份或锚点不匹配），从偏移量 0 重新读取，并依靠 upsert 去重。

**测试**：第二次查询只读取新追加的字节（在测试里插桩统计读取量）；文件末尾有半行时留到下次再读；文件替换后不会重复计数；现有 Claude 相关测试全部通过。

**本任务不做**：jsonl 的轮转和压缩（可以留作后续任务）。

#### T4.3 Codex 扫描优化（视 T4.0 结果决定）

只有当 T4.0 测得 Codex 查询耗时超过 1 s 时才做。

1. 先确认用户机器上 `sessions/` 的目录结构（是否为 `YYYY/MM/DD`），并确认长会话或 `resume` 是否会往旧日期目录里的文件继续追加：用一份真实的旧 rollout 文件观察它的 mtime 变化。
2. 只有确认不会出现跨日追加，才能按日期目录剪枝。否则只优化缓存层：把每个文件的 stat 结果存进 `codex_files` 表，没有变化的文件不再反序列化 rows，改为直接在 SQL 中按时间范围过滤（需要把 rows 拆成规范化的表）。
3. 必须新增测试：会话 3 天前开始、今天仍在追加的情况下，今天的数据不能丢失。

### 阶段 6 · 产品（全部需要 D10 方案确认）

#### T6.1 平台验证分级标注

- 在每个平台的注册表描述中增加 `verification: {level:'live'|'contract'|'experimental', date, note}`。按当前事实初填：
  - Codex：live（只读额度观察）
  - Command Code：live
  - GLM、MiniMax、火山、DeepSeek、OpenCode Go：contract
  - Claude：contract（组件样例）
  - 实际等级以 PROJECT_HANDOFF 为准，**有疑问就问用户**
- 在添加账户表单和账户切换器中显示标签。**样式先出方案，用户确认后再实现。**

#### T6.2 账户核对页改为「覆盖范围报告」（D7）

- 导航入口和页面标题改为「覆盖范围报告」。页面主体展示：
  - 每个计费账户组下各工具来源的覆盖起止时间；
  - 缺口原因（直接复用 `compareEvidence` 返回的 `reasons`，以及来源报告中的 `missingUsage`、`truncated`、`stale`、`unverified-version` 等字段）；
  - 关联状态（已关联 / 未关联 / 有歧义 / 已失效的记录数，来自 `summarizeAssociations`）。
- `compareEvidence` 的逻辑一行不改。「差值 / 误差率」区块只在 `available:true` 时出现；否则不显示该区块，原因已在缺口列表中说明。
- 内部的 IPC 名称和 `source:'reconciliation'` 保持不变，避免影响迁移和测试，只改用户可见的文案。
- **按 D10 流程，先出浅色和深色截图，用户确认后再合并。**
- 测试：现有核对测试全部通过；新增测试确认 `available:false` 时页面数据里没有差值字段。

#### T6.3 说明文字渐进披露

先盘点所有超过 40 个字的状态说明文案，整理成表交给用户，并附上建议的「一行结论 + ⓘ 详情」拆分方案。**用户确认后再修改。**

---

#### T7.2 实时尾随通道（增量一的前置任务）

- 新建 `desktop/live-tail.cjs`：一个常驻 worker，与 `ToolSources.run()` 完全独立，互不取消。只在岛启用或「正在运行」可见时运行。
- 每个已启用的来源维护一个内存游标：
  - Zcode / OpenCode：`WHERE <时间列> > ? ORDER BY … LIMIT 500`。先用 `PRAGMA index_list` 确认时间列是否有索引；没有索引时，测量每次查询的耗时。超过 50 ms 的话，评估是否改用单调递增的 rowid 做游标。
  - Claude / Harness：文件偏移量。
  - Codex：只读取最新一个 rollout 文件的尾部。
- 输出：`{sourceId, sessionId, tokensDelta, lastStepAt}`
- **必须复用**现有 reader 的规范化和排除逻辑（fork 继承、旧版镜像、缓存与推理不重复计），不能另写一套，避免两条口径不一致。
- 不推断账户归属；「运行中」= 最近一个 step 在 90 秒以内。
- 测试：
  - 新增行只产生一次增量；
  - fork 继承的历史不产生增量；
  - 与分析查询同时运行时，两者都不被取消；
  - 用 T3.2 的日志记录 2 秒和 5 秒刷新间隔下的 CPU 耗时。

### 阶段 8 · 稳固与收口（2026-10-23 整体复盘后新增，D12）

依据 [docs/REVIEW-2026-10.md](docs/REVIEW-2026-10.md)（括号内为报告中的编号）。每个任务仍按第 0.2 节执行；改变行为的任务按 D1 出本机 Mac 测试包，T8.8 合并时统一升为 1.9.0-beta.3。

**T8.1 Electron 安全更新（H1）**
- `electron` 从 44.4.4 升到 44.9.x 的最新补丁（≥ 44.9.1，只升补丁线，不跨大版本）；D12 ① 为此破例「依赖发布满两周」。
- 回归重点：T7.7 记录的「内容保护关不掉」这一 Electron 行为（smoke 已覆盖）、菜单栏图标与面板、Claude statusLine 组件（`ELECTRON_RUN_AS_NODE`）。
- 仓库打开 Dependabot **告警**（不开自动 PR）：GitHub 设置，执行时先问用户，由用户操作或授权后用 API 操作。

**T8.2 偏好前向兼容与回滚说明（H2）**
- `store.cjs` 读取时保留不认识的偏好键，保存时原样写回（只对以后的版本生效，已发布的旧版改不了）；值不合法的已知键仍按现有规则回到默认值。
- 改写 CHANGELOG 中两条回滚说明：如实写「退回旧版后，旧版第一次保存设置时会删除这些项，重新升级后恢复为默认值」。
- 升级验证补一项「旧版读写一次 → 新版再读」，用于以后的版本。
- 测试：未知键保存后仍在；未知键不影响已知键的校验；损坏的设置文件仍不自动覆盖。

**T8.3 锁屏暂停的兜底恢复（M2）**
- 只收到 `lock-screen`、没收到 `unlock-screen` 时，不能一直暂停：手动刷新或系统唤醒时，若系统并未锁屏（`powerMonitor.getSystemIdleState()` 不是 `locked`）就恢复，并记日志。
- 测试：只有锁屏事件时，刷新可以恢复；真正锁屏时仍暂停。

**T8.4 Claude statusLine 额度改为结构校验（M4）**
- 与 T5.1 同一套规则：已验证版本以外的 Claude Code，statusLine 额度只有在结构完全一致时才接受，并在账户状态里提示「x.y 版本未经验证，按已知结构读取」；字段改名或缺失仍然拒绝。
- 测试：2.2.x 结构一致 → 接受并提示；结构不一致 → 拒绝；2.1.x 行为不变。

**T8.5 Claude 采集端口失败时自动换端口（M1，D12 ⑤）**
- 监听失败且为 `EACCES` / `EADDRINUSE` 时换一个端口（最多重试几次，或由系统分配），更新 `collector.json`，重新生成启动器与 statusLine 配置，并提示「请重新打开 Claude Code 会话」；其他错误码仍按现状报告。
- 提示文案先出浅色 / 深色截图，用户确认后再实现（D10）。
- 测试：首个端口失败 → 换端口成功、配置与启动器更新；连续失败 → 明确报告；正常路径不变。同时把计划第 5 节「回环端口 EACCES」改为由本任务处理。

**T8.6 检查更新识别开发包版本；账户加载记耗时（H4、M5）**
- `update-check.cjs` 把 `x.y.z-beta.n-dev.<commit>` 当作 `x.y.z-beta.n` 比较（只影响本机开发包）。
- `accounts/load` 日志加 `durationMs`：耗时异常（例如超过几秒）基本可以判断为钥匙串授权窗，作为 T7.12 原因的线索。
- 测试：开发包版本号可以比较；正式版本号行为不变。

**T8.7 应用许可证与第三方声明随包（D4 发现）**
- 两个平台都把 `LICENSE`、`THIRD_PARTY_NOTICES.md` 放进安装包（`extraResources`），并在 THIRD_PARTY_NOTICES 中补齐各组件的许可证全文或构建时生成的清单（含 Phosphor Icons、Geist 字体）。
- 相应调整 `verify-package.cjs` 与 `Verify-Mac-Native.command` 的检查。

**T8.8 1.9.0-beta.3 收尾与发版**
- 版本号、升级 profile（含同版本 profile）、CHANGELOG、README、AGENTS、PROJECT_HANDOFF；按 RELEASING **全部步骤**执行，包括第 4、5 步（`docs/verification-1.9.0-beta.3/` 与发布目录存档），并等推送后的 CI 通过后再打标签；推送、打标签、发布每一步先问用户。

**T8.9 文档收口（复盘第 2 节、D1、D2，D12 ②）**
- 逐条处理复盘 C1–C19：恢复 CHANGELOG 中 1.8.0-beta.8 的标题；更新 PROJECT_HANDOFF 过时内容（日期、公开版本、Claude 与 Codex 证据、进行中事项、仓库名）；AGENTS 改为 D1–D12；岛设计 HANDOFF 的头部与 §1.1、§8；删除 §6 中重复的 T4.7 记录；第 5 节过时的状态（Actions 计费、临时分支、回环端口）。
- 证据口径（D12 ②）：验收清单头部规则改为允许「③（Claude 代测）」，并给第 12、14、15 项补标注；README / HANDOFF 的证据描述同步。
- 补齐 1.9.0-beta.2 的发版第 4、5 步：下载正式包与报告，逐个核对 SHA256 后放进 `docs/verification-1.9.0-beta.2/` 与发布目录（只新增，不覆盖）。
- 首次打开说明（H3）：等用户用浏览器下载的 DMG 在 macOS 15 上实测后，按实际结果改 README、安装包仓库说明与验收清单第 1 项。
- 计划归档瘦身（C19）：已完成任务的详情和第 6 节执行记录移到 `docs/history/`，本文件只留决策、未完成任务、第 5 节未关闭问题；移动前后逐段核对，不改写内容。
- 不改应用行为，不出包。

**T8.10 发版流程加固（D3、M3、M5）**
- 本机发版辅助脚本：给定标签，下载正式包与报告，核对 SHA256，放到 `docs/verification-<版本>/` 与发布目录，打印剩余步骤；只读 GitHub，不推送、不发布。
- Publish 工作流的公开说明从 CHANGELOG 对应一节生成（复盘 C18）。
- 执行记录增加「推送后 CI 结果」「标签提交 CI 结果」两栏。
- CI 安装固定版本的 Harness 运行时，让 3 个跳过的测试真正运行（安装方法见插件 README）；基线随之变化时同步更新 AGENTS。
- `Verify-Mac-Native.command` 在 smoke 失败时保留临时目录，并记录这段时间里 SecurityAgent 是否出现（M5）。

**T8.11 仓库整理（D6、L4，D12 ⑥）**
- 删除远端与本地已合并的 `task/*`、`claude/*` 分支；移除 `.claude/worktrees/` 下 2 个 worktree；调研文档 `MARKET-RESEARCH-2026-10.md` 合并到 main（只有这一个文件）；`.commandcode/taste/` 移出仓库并加入 `.gitignore`（历史不重写）。
- 给 `main` 与 `v*` 标签加「禁止强推、禁止删除」规则：GitHub 设置，执行时先问用户。

**T8.12 发布目录旧 `.app` 移到 `.noindex` 子目录（M6，D12 ⑦）**
- 把 `~/Documents/TokenUsageAssistant-releases/` 下各目录中的 `.app` 移到一个以 `.noindex` 结尾的子目录（保持原有目录结构），只移动、不删除，DMG / ZIP 和报告原样保留；移动前后列清单核对。以后本机测试包同样处理。

**T8.13 Harness 去留（M3，D12 ④）**
- 等用户告知所用的 dsh 版本：若高于 0.1.7-rc.1 且仍在使用，先开调研任务看 0.2.x 会话格式是否变化，再决定是否适配；若不用或很少用，在 README 与来源状态里写明「只支持 0.1.7-rc.1，已停止跟进」。

**T8.14 测量 Claude 导出的读取耗时与文件大小（复盘第 4.2 节）**
- 用户使用一段时间后，从诊断导出或日志读取 claude-code 来源的查询耗时、行数与文件大小（只读元数据，不读正文）；超过约 0.5 秒或文件明显变大，再做 T4.2（并考虑轮转）。T7.2 的去留据此与「Claude 推送式『正在运行』」等替代方案一起重新评估。

**候选（未排期，D12）**：（fuses 收紧与「未启用」/「<1%」已排进阶段 9 的 T9.2、T9.3）临期倒计时（增量一中不依赖 T7.2 的部分）；Claude 推送式「正在运行」（第 4.4 节，需评估）。


### 阶段 9 · 开源与增长（2026-10-26，D14）

目标：让陌生人能**找得到、装得上、信得过、用得久**。每个任务仍按第 0.2 节执行；改变行为的任务按 D1 出本机 Mac 测试包；全部合并后由 T9.11 一次升为 1.9.0-beta.5。

**T9.1 上游版本检查脚本（用得久）**
- 新增 `scripts/check-upstream.cjs`：只读查询 npm registry 上 Codex CLI、Claude Code、DeepSeek Harness（`@deepseek-ai/dsh`）的最新版本，与代码里的已验证范围比较（Codex `VERIFIED_VERSIONS`、Claude 已验证的 2.1.x ≥ 251、Harness `VERIFIED_RUNTIMES`），输出「已验证 / 超出范围」报告。不安装、不执行上游包。
- 新增每周定时运行的 GitHub Actions 工作流，只把报告写进 job summary；不自动开 issue、不改代码。
- 测试：版本比较与报告生成用固定样例覆盖；网络失败时报告「无法检查」，不当成「已是最新」。

**T9.2 Electron fuses 收紧（信得过，M7）**
- 在打包配置里关闭 `EnableNodeOptionsEnvironmentVariable` 与 `EnableNodeCliInspectArguments`。**`RunAsNode` 不能关**：Claude statusLine 组件和启动脚本依赖 `ELECTRON_RUN_AS_NODE`（`claude-collector.cjs`）。其他开关（例如 asar 完整性校验）先评估，与 ad-hoc 签名、macOS 校验和 Windows 包冲突就不开，并在执行记录里写明原因。
- 两个平台的包校验都要检查 fuse 状态；原生 smoke、升级验证必须通过，Claude 组件实测（statusLine 帮助程序能运行）。

**T9.3 「未启用」措辞统一与通知「<1%」（L2、L3，D10）**
- 菜单栏、面板、主窗口对「窗口尚未开始计时」用同一说法；「已用不为 0 却未启用」不再显示成缺数据的说法。通知里 0–0.5% 显示「<1%」，与菜单栏一致，不再写成「剩余 0%」。
- 先出浅色 / 深色截图（D10，第二档）；等确认期间接着做 T9.4 起不依赖它的任务。测试覆盖三个展示面的取值一致。

**T9.4 隐私与安全说明（信得过）**
- `docs/PRIVACY.md`（中英文）：每个平台和工具来源读什么、不读什么、数据存在哪、如何删除；与 AGENTS §4 的红线一致，不夸大。
- `SECURITY.md`：如何私下报告漏洞。开启 GitHub 的私密漏洞报告属于 GitHub 设置，攒到节点一次问用户（D13 第二档）。

**T9.5 贡献与反馈入口（信得过）**
- `.github/ISSUE_TEMPLATE/`：问题反馈（附「导出诊断信息」的方法，并提醒不要贴密钥或对话内容）、新平台请求（要求附官方只读用量 / 余额接口的文档链接）。
- `CONTRIBUTING.md`：开发环境、测试命令、数据语义与隐私红线摘要、界面改动先出截图的规则。

**T9.6 安装与升级说明写清楚（装得上，D4）**
- README、安装包仓库 README、公开说明模板统一写清楚：macOS 首次打开到「系统设置 → 隐私与安全性 → 仍要打开」（已实测）；覆盖升级后的钥匙串授权要选「始终允许」，以及为什么会出现；Windows 的 SmartScreen 提示「Windows 已保护你的电脑」时点「更多信息 → 仍要运行」（**Windows 未在真机实测**，如实标注，等有 Windows 用户反馈再更正）。
- 加「常见问题」：为什么没有签名、是否安全（开源、可核对哈希）、数据存在哪、怎么卸载干净。

**T9.12 调研：各工具的稳定读取途径（只调研，D15）**
- Codex：官方程序能否在不登录、不调用模型的情况下导出 app-server 协议定义（JSON Schema），额度相关类型能否自动比对；rollout 文件从 0.155 到当前版本的结构变化（只看字段名与类型，用公开发布包或本机已有文件的元数据，不读正文）；有没有比 rollout 更稳定的用量来源。
- Claude Code：状态栏 JSON 与 OpenTelemetry 事件有没有官方的可机读定义，npm 包里能否提取。
- Harness：官方运行时已能自动测试，确认新版本（如 0.2.1-rc.3）能否直接纳入。
- 产出 `docs/research/UPSTREAM-CONTRACTS.md`：每个工具能自动比对什么、不能比对什么、依据链接，以及 T9.13 契约的初稿（核心字段 / 可选字段 / 语义约束）。

**T9.13 结构契约与三档状态（D10、D15）**
- 新增纯模块（加入 typecheck）：每个来源一份契约——核心字段、可选字段、语义约束（如总量 ≥ 输入 + 输出、缓存不超过输入、推理 ≤ 输出、计数非负、时间合理）。Codex rollout 与额度、Claude 状态栏与 OTLP、Harness 的读取端改为按契约判断，不再按已验证版本列表贴标签。
- 三档状态：正常 / 部分字段缺失（显示「—」并写明缺了什么）/ 格式不兼容（停止并提示）。原有「字段改名、核心字段缺失一律拒绝」的测试保留；新增「可选字段缺失时其他字段照常」「违反语义约束时拒绝」等测试。
- 界面上状态与说明的变化先出浅色 / 深色截图（与 T9.14 一起确认）。

**T9.14 结构指纹与变化提示（D10、D15）**
- 每个来源在本机记住记录的字段名集合（只有字段名，不含值）；升级后字段集合变化时提示「新增了 X、缺少了 Y」。诊断信息带字段名差异；问题反馈模板增加「工具升级后读不到」一项。

**T9.15 自动兼容性检查（D15）**
- 扩展 T9.1 的每周检查：发现超出已知范围的新版本时，CI 下载官方包，在不登录、不调用模型的前提下跑契约测试并写进报告。Harness 直接做；Codex、Claude 按 T9.12 的结论能做多少做多少，做不了的如实写明。

**T9.7 README 改版（找得到）**
- 首屏：一句话定位、一张主界面截图或短动图（用浏览器预览的示例数据生成，不含真实账户）、下载链接。
- 支持的平台与工具表带 T6.1 的验证等级（已实测 / 样例验证 / 实验）；简明的隐私摘要（链接 `docs/PRIVACY.md`）；开发者入口放到后面。在 T9.3、T9.6 之后做，截图用最终界面。

**T9.8 英文 README（找得到）**
- `README.en.md`，与中文 README 同结构；两个 README 顶部互相链接；写明界面目前只有中文。以后改中文 README 时同步英文版（写进 AGENTS）。

**T9.9 新平台调研（只调研，不实现）**
- 候选：Kimi（Moonshot）、通义千问 / 阿里云百炼、OpenRouter、硅基流动等国内外常用的编程 / API 平台。逐个核对：是否有官方只读的用量 / 余额 / 套餐额度接口、鉴权方式、是否会消耗额度、区域差异、返回字段能否满足数据语义红线。
- 产出 `docs/research/PROVIDERS-2026-11.md`：每个平台的结论与依据链接，以及「推荐先做哪几个」。交用户决定是否、何时实现（实现另行排期）。

**T9.10 安装包仓库 README 与公开说明模板对齐（找得到）**
- 安装包仓库 README 与新版中文 / 英文 README 的介绍和截图保持一致；公开说明模板同步。安装包仓库属于公开内容：改动随 T9.11 的发版一起确认（D13 第二档），确认后再推送。

**T9.11 1.9.0-beta.5 收尾与发版**
- 与 T8.8 相同：升版、新增升级验证 profile（1.9.0-beta.4 → beta.5 与同版本）、CHANGELOG 本节、README / AGENTS / PROJECT_HANDOFF；推送后等 CI，在 main 上试跑 Release；把标签与公开说明全文一次交用户确认；确认后完成打标签之后的全部步骤并核对。

---

## 5. 执行中发现的问题（执行模型追加）

| 日期 | 发现于任务 | 问题描述 | 建议 | 处理状态 |
|---|---|---|---|---|
| 2026-10-16 | T3.3 | 合并后 main 的 CI 中，Windows 上 `actual portable status-line component sends authenticated metadata to loopback without content` 失败：`listen EACCES: permission denied 127.0.0.1:49849`。这是 runner 绑定回环随机端口时被拒，与本次改动无关；同一代码在标签的 CI 和分支 CI 中都通过，重跑失败作业后也通过。 | 没有放宽测试。如果再次出现，再考虑让该测试改用系统分配的端口（监听 0 号端口）。**2026-10-23 更新（整体复盘 M1）**：之后又出现 2 次且当时没有记录——`38875528400`（main@`b4b5ae0`，`listen EACCES 127.0.0.1:49827`）与 `39808290317`（main@`237987f`，即 v1.9.0-beta.2 的标签提交，`EACCES 127.0.0.1:49835`；执行模型推送后没等这次 CI 就打了标签，同一提交的标签 CI `39808544844` 通过）。三次都落在 49827–49849，符合 Windows 保留端口段的特征；端口是产品代码选的（`claude-collector.cjs` 一次随机、永久保存、失败不换），真实 Windows 机器上可能永久不可用。 | 已处理（T8.5，2026-10-23） |
| 2026-10-16 | T5.1 | Claude 的 statusLine 额度（`receiveQuota`）同样只接受 2.1.251+ 的 2.1.x。计划只点名了 Codex rollout 和 Claude OTLP，所以这次没有改；Claude 一升级，订阅额度就会停止更新。 | 建议另开小任务：把 statusLine 额度也改为结构校验（`normalizeClaude` 已经验证窗口结构），未验证版本在账户状态中提示。 | 已处理（T8.4，2026-10-23） |
| 2026-10-16 | T5.3a | **Windows 打包 smoke 偶发超时**：分支 Release 试跑 `38888202087` 中，`subscription-native-smoke` 启动 PowerShell 运行 Claude 状态栏脚本，6 秒内没有结束（`statusline timeout`），重跑失败作业后同样失败。对照：同一时间 main（不含 T5.3a）的试跑 `38890784846` 通过；在 T5.3a 代码上只加了计时的调试分支 `38891628294` 也通过（smoke 用时 39 s）；T5.3a 分支再跑一次 `38892710298` 通过。Mac 的 smoke 用时在各次运行中都一样（约 11 s）。T5.3a 没有改动状态栏脚本或这段 smoke。 | 判断为 runner 上 PowerShell 冷启动加上首次调用 `Invoke-RestMethod` 偶尔超过 6 秒的环境问题（代码相同，有时过、有时不过），不是 T5.3a 引入的；中途一度根据一次对照怀疑是 T5.3a，之后的两次运行推翻了这个判断。**没有放宽超时**。如果再出现，建议在 smoke 报告中记录 PowerShell 启动到退出的耗时，再决定是否单独处理。用户问及是否与本机休眠有关：无关，这一步运行在 GitHub 的 Windows runner 上。调试分支 `debug/t53a-win-timing` 已删除。 | 待观察 |
| 2026-10-18 | T7.5 | 本机 Mac 测试包首次运行 `Verify-Mac-Native.command` 时，原生 smoke 150 秒未退出被终止；立即重跑，6 项门禁全部通过。按 AGENTS §9，新签名的打包版 smoke 首次运行可能弹出一次 smoke 条目的 Keychain 授权窗，很可能是这个原因，但执行模型没有看到窗口，**未确认**。CI 上同一代码的 Mac 原生 smoke 约 10 秒通过。 | 记录；如再出现，运行时截图确认是否为 Keychain 授权窗。 | 待观察 |
| 2026-10-18 | T7.7 | 本机新构建的打包版首次运行 `Verify-Mac-Native.command`，原生 smoke 再次 150 秒未退出（第二次出现，见 T7.5 那条）；立即重跑全部通过，smoke 约 15 秒结束。重跑时每 5 秒检查屏幕窗口，没有看到 SecurityAgent / 钥匙串授权窗；首次运行的日志随验证脚本的临时目录一起被删，无法回看。T7.6 的首次验证没有出现。 | 下次出现时先保留临时目录（例如给验证脚本加「失败时保留 smoke 目录」的开关）再查；原因未确认，不要写成 Keychain 授权窗。 | 待观察 |
| 2026-10-23 | T8.7 | **Windows 打包 smoke 偶发失败一次**：分支 Release 试跑 `39972189296` 的 Windows 原生 smoke 在关联页一步超时（`Association view did not settle: !!document.querySelector('[role=listbox]')`，`association-native-smoke.cjs:109`，下拉菜单没有在期限内展开），之后的章节没有运行；重跑失败作业后 smoke、包完整性、升级验证全部通过。T8.7 只在 `app.asar` 旁边增加文件，不涉及界面；同一代码的 Mac smoke 通过。 | 与第 5 节其他「首跑 / 偶发 smoke 失败」一起由 T8.10（smoke 失败时保留证据）继续观察；再出现时考虑把这一步的等待改为先确认下拉按钮已获得焦点再展开。不放宽断言。 | 待观察 |
| 2026-10-26 | T9.1 | 上游版本检查首次运行：Codex CLI 最新为 **0.164.0**，已验证范围仍是 0.155.x（T5.1）。读取端会按结构一致性读取并标「版本未验证」，不会静默停更，但用户会一直看到「未验证」。Claude Code 2.1.310、Harness 0.2.1-rc.2（`latest`）在范围内；Harness `next` 已到 0.2.1-rc.3。 | 像 T8.13 那样做一次 Codex 0.164 的结构复核（对比 rollout 字段，用真实 rollout 只读核对元数据），合适就加入已验证列表；是否排进阶段 9 由用户决定（范围变化）。 | 待用户决定 |
| 2026-10-27 | T9.3 | **打包后首次 smoke 150 秒超时第三次出现**（前两次见 T7.5、T7.7）：本机包 `-dev.05ebae6` 第一次 `Verify-Mac-Native.command` 的原生 smoke 超时，期间钥匙串授权窗 0 次；立即重跑 8 项门禁全部通过。smoke 自 2026-10-25 起用模拟钥匙串，所以**原因不是钥匙串**（原先的推测可以排除）。stderr 只有两行 `NSWindow does not support nonactivating panel styleMask` 警告，证据留在 `work/smoke-failures/kept-t9.3-first-run-timeout/`。同一轮的两次打包还因网络（TLS 被断开）失败，与此无关。 | 按已知偶发处理（重跑一次）；再出现时在 smoke 里记各阶段耗时，找出卡在哪一步。 | 观察中 |

已关闭的问题见归档快照第 5 节。

---

## 6. 执行记录（执行模型追加）

| 日期 | 任务 | 分支 / commit | 测试（通过/失败/跳过） | 证据等级 | 交付物 | 未完成或遗留 |
|---|---|---|---|---|---|---|
| 2026-10-23 | T8.9 | `task/T8.9-docs-tidyup`：`7a14a89`（复盘第 2 节修正、证据口径、beta.2 报告）、`fab64c0`（计划瘦身）；`--no-ff` 合并为 `bca5539` | 335 / 0 / 3（只改文档，不变）；`prettier --check` 通过 | 不涉及（文档） | **补齐 1.9.0-beta.2 发版第 4、5 步**：从源码仓库 Release 下载正式包与 4 份报告到 `~/Documents/TokenUsageAssistant-releases/release-v1.9.0-beta.2/`（新建，未覆盖任何文件），4 个安装包的 SHA256 与安装包仓库的资源摘要、CI 完整性报告三方一致；报告存进 `docs/verification-1.9.0-beta.2/`。**复盘第 2 节**：C1 恢复 CHANGELOG 中 1.8.0-beta.8 标题；C3–C8 更新 PROJECT_HANDOFF（日期、发布产物与公开版本、secret 命令改用新仓库名、Codex / Claude 证据、下一步）；C9 AGENTS 改为 D1–D12；C10 岛设计 HANDOFF 的状态、§1.1 三处「待 POC」与 §8；C12 删除重复的 T4.7 记录；C13–C15 更新第 5 节与 T4.7 记录的过时状态（回环端口问题补记 2 次未记录的失败，转 T8.5）；C16 README 补 `typecheck`；C17 README 写明 Windows 证据等级。C2（回滚说明）留给 T8.2，C11（调研文档引用）随 T8.11 合并调研文档解决，C18（公开说明）留给 T8.10。**证据口径（D12 ②）**：验收清单头部规则改为允许「③（Claude 代测）」，第 12、14、15 项补标注；AGENTS §9、README、PROJECT_HANDOFF 同步。**计划瘦身（C19）**：原文快照 `docs/history/IMPROVEMENT_PLAN-through-1.9.0-beta.2.md`（去掉顶部说明后与瘦身前逐字节一致，`cmp` 核对），本文件从 226 KB 减到约 33 KB，只保留使用说明、决策、未完成 / 已跳过任务、5 条未关闭问题（第 5 节 T5.1 一条改为转 T8.4）和此后的执行记录。 | 首次打开说明（复盘 H3）等用户用浏览器下载的 DMG 在 macOS 15 上实测后补改 README、安装包仓库说明与验收清单第 1 项。 |
| 2026-10-23 | T8.11 | `task/T8.11-repo-tidy`：合并调研分支 `4817e68`（`task/island-market-research-2026-10`，只新增 `docs/island-1.9.0-design/MARKET-RESEARCH-2026-10.md`，合并前查过无路径 / 邮箱 / 密钥）、`7ddf1c8`（`.commandcode/` 不再跟踪并加入 `.gitignore`，文件留在本机原处，历史不改写）；`--no-ff` 合并为 `365aa6b` | 335 / 0 / 3（未改代码） | 不涉及 | 经用户确认的清单执行：删除源码仓库 28 个已合并的远端分支（现在只剩 `main`）；删除本机 40 个已合并分支（`git branch -d`，只剩 `main`）；`git worktree remove` 移除 `.claude/worktrees/` 下 2 个无改动的 worktree，并归档对应的 2 个旧会话；新增 Rulesets：`protect-main`（默认分支禁止删除、禁止强推）与 `protect-release-tags`（`refs/tags/v*` 禁止删除、禁止改动），都没有例外，本条记录的推送即在规则下正常完成。 | 第一次批量删除远端 / 本地分支没有生效：zsh 不会把未加引号的变量拆成多个参数，改为逐个删除后完成；以后批量处理用循环。 |
| 2026-10-23 | T8.12 | `task/T8.12-apps-noindex`；`--no-ff` 合并为 `5a2b5be` | 335 / 0 / 3（未改代码） | 不涉及 | 经用户确认：`~/Documents/TokenUsageAssistant-releases/` 下 14 个 `.app`（1.8.0-beta.5 至 1.9.0-beta.1-dev.8964ec3 的本机包，各约 290 MB，共 4.0 GB）连同所在的 `mac-arm64/` 目录移到 `apps.noindex/<原目录名>/mac-arm64/`，只移动、不删除；移动前每个 `mac-arm64/` 里只有这一个 `.app`；移动后版本目录外 0 个、`apps.noindex` 内 14 个，14 个 `codesign --verify --deep --strict` 全部通过，DMG / ZIP 与报告原样留在各版本目录。`mdfind` 按 bundle id 只再找到 `/Applications` 中的应用和仓库外 `~/Documents/commandcode-companion_副本/` 里的一个旧副本（不在本任务范围，未处理）。AGENTS §5、RELEASING 第 5 步写明以后同样处理。 | `~/Documents/commandcode-companion_副本/` 里的旧 `.app` 是否处理由用户决定。 |
| 2026-10-23 | T8.1 | `task/T8.1-electron-security`：`0b82765`（升级）、文档提交；`--no-ff` 合并为 `00b61f3`；分支 CI `39949599786` 两个平台通过 | 335 / 0 / 3（不变）；ESLint 0 个错误、35 个警告；typecheck、`prettier --check`、build 通过；开发版隔离原生 smoke ok（menubar / panel / menubarSettings 均 ok） | ①＋②：本机打包版 `Verify-Mac-Native.command` 第一次运行 smoke 150 秒超时（第 5 节「首跑 smoke 150 秒」再次出现：当时屏幕上没有 SecurityAgent 窗口，系统日志无相关记录，原因仍未确认），立即重跑 7 项门禁全部通过；包内 Electron Framework 为 44.9.3。`spctl` rejected（预期）。未做 ③ | `electron` 44.4.4 → **44.9.3**（2026-10-21 发布，修复 GHSA-jr5w-w6x2-84p9，high；只升 44 补丁线）；`pnpm-workspace.yaml` 的发布满两周例外改为 `electron@44.9.3` 并注明 D12 ①；本机二进制按 CI 的做法用 `node node_modules/electron/install.js` 下载（带校验）。**Mac**：`TokenUsageAssistant-Mac-arm64-1.9.0-beta.2-dev.0b82765.dmg`（130988601 字节，sha256 `f760358d…`）与 `.zip`（130967219 字节，`7d5fd62a…`）放在 `~/Documents/TokenUsageAssistant-releases/release-v1.9.0-beta.2-dev.0b82765/`，`.app` 放在 `apps.noindex/` 下（T8.12）；包内版本为临时设置的 `1.9.0-beta.2-dev.0b82765`，构建后已还原。**Windows**：分支 CI 测试通过，安装包待 beta.3 的 Release 补齐。**Dependabot**：经用户同意用 API 打开源码仓库的 Dependabot 告警（`PUT /vulnerability-alerts` 返回 204，`automated-security-fixes` 仍为关闭，不开自动 PR）。CHANGELOG 新增「未发布（稳固版）」一节。 | 首跑 smoke 超时这次留下的线索只有「无授权窗」，留给 T8.10（smoke 失败时保留目录）继续查。 |
| 2026-10-23 | T8.2 | `task/T8.2-preference-compat`：`8bbd608`；`--no-ff` 合并为 `b3533a5`；分支 CI `39962167337` 两个平台通过 | 340 项：337 通过 / 0 失败 / 3 跳过（新增 2 项 `tests/desktop.test.cjs`：未知偏好保存后保留、已知偏好的非法值仍回到默认；不是对象的 `preferences` 不保留任何东西。第一项在旧代码上失败；原有断言未改）；ESLint 0 个错误、35 个警告；typecheck、`prettier --check` 通过 | ①＋②：分支 Release 试跑 `39962782531`（windows / mac / release 均 success），Windows 真实 DPAPI 升级验证（profile `1.9.0-beta.2-to-1.9.0-beta.2`）28 项全部通过，含新增的 `newBuildKeepsUnknownPreferences`；本机打包版 `Verify-Mac-Native.command` 第一次 smoke 150 秒超时、立即重跑 7 项全部通过（第 5 节首跑超时，T8.1 之后又一次）；包内 `store.cjs` 与源码逐字节一致。未做 ③ | `store.cjs`：读取设置时把不认识的偏好原样放到一边，保存时写回（已知键优先）；已知键的非法值仍按原规则回到默认；`preferences` 不是普通对象时不保留任何东西。升级验证：新增 `newBuildKeepsUnknownPreferences`（profile 标志 `unknownPreferencesKept`，已在 `1.9.0-beta.2-to-1.9.0-beta.2` 打开；在隔离目录的独立子目录里写入「未来的偏好」，新版读写一次后检查原样保留，不影响逐字节检查）。CHANGELOG：两条回滚说明改为如实写明旧版会在第一次保存时删除不认识的设置，「未发布」一节说明本版起不再丢失、但退回 1.9.0-beta.2 及更早版本时仍无法补救。**Mac**：`TokenUsageAssistant-Mac-arm64-1.9.0-beta.2-dev.8bbd608.dmg`（130989337 字节，sha256 `2f128489…`）与 `.zip`（130967329 字节，`e44da5d0…`）在发布目录，`.app` 在 `apps.noindex/`；包内版本为临时设置的 `1.9.0-beta.2-dev.8bbd608`，构建后已还原。**Windows**：Release 试跑已出包（未下载存档，正式包随 beta.3）。 | T8.8 新建 `1.9.0-beta.2-to-1.9.0-beta.3` 与同版本 profile 时都要打开 `unknownPreferencesKept`。 |
| 2026-10-23 | T8.3 | `task/T8.3-lock-resume`：`0546f6b`、文档提交；`--no-ff` 合并为 `e9a557a`；分支 CI `39965199452` 两个平台通过 | 341 项：338 通过 / 0 失败 / 3 跳过（新增 1 项 `tests/polling.test.cjs`：没暂停时不动、仍锁定时不恢复、状态未知时不恢复、未锁定时恢复并错峰刷新；原有接线测试的正则按新写法更新——锁屏时 `pauseAll` 并启动每分钟检查、解锁时清除检查并 `resumeAll`，另加手动刷新、系统唤醒与 `getSystemIdleState(1) === 'locked'` 三处接线断言，没有放宽；两项在旧代码上都失败）；ESLint 0 个错误（中途 1 个 `no-useless-assignment` 已改）、35 个警告；typecheck、`prettier --check` 通过；开发版隔离 smoke ok | ①＋②：本机打包版 `Verify-Mac-Native.command` 7 项门禁首次即全部通过（这次首跑没有超时）；包内 `accounts.cjs`、`main.cjs` 与源码逐字节一致。未做 ③（锁屏 / 解锁不成对的场景没有在真机上复现） | `accounts.cjs` 新增 `resumeIfUnlocked(isLocked)`：只在已暂停且确认未锁屏时恢复（记 `accounts resume-fallback`），判断出错时保持暂停。`main.cjs`：锁屏时启动每 60 秒一次的检查，解锁时清除；手动刷新（界面与托盘菜单）与系统唤醒先调用它；判断用 `powerMonitor.getSystemIdleState(1) === 'locked'`。**Mac**：`TokenUsageAssistant-Mac-arm64-1.9.0-beta.2-dev.0546f6b.dmg`（130990886 字节，sha256 `977a0a0c…`）与 `.zip`（130968260 字节，`7051ce58…`）在发布目录，`.app` 在 `apps.noindex/`；包内版本为临时设置的 `1.9.0-beta.2-dev.0546f6b`，构建后已还原。**Windows**：分支 CI 通过，安装包随 beta.3。 | 锁屏行为（T4.4 与本任务）在真机上仍未验证，可并入验收清单。 |
| 2026-10-23 | T8.4 | `task/T8.4-statusline-structural`：`fe8e481`、文档提交；`--no-ff` 合并为 `e69a009`；分支 CI `39967071225` 两个平台通过 | 343 项：340 通过 / 0 失败 / 3 跳过（新增 2 项 `tests/subscriptions.test.cjs`：未验证版本 2.2.0 在窗口结构一致时被接受、额度正确、账户说明以「2.2 版本未经验证」开头、已验证版本不写标记——在旧代码上失败；窗口改名、为空、缺失、字段改名、版本号不规范、缺会话标识时一律拒绝且 `quota.json` 不变；原有断言未改）；ESLint 0 个错误、35 个警告；typecheck、`prettier --check` 通过 | ①＋②：本机打包版 `Verify-Mac-Native.command` 7 项门禁首次即全部通过；包内 `claude-collector.cjs`、`subscriptions.cjs` 与源码逐字节一致。未做 ③（没有真实的 2.2.x Claude Code 可测；当前 2.1.308 仍走已验证路径） | `claude-collector.cjs` 的 `receiveQuota`：版本号须为 x.y.z；已验证范围外的版本至少要有一个已知窗口（`five_hour` / `seven_day`），字段由 `normalizeClaude` 校验；接受时在 `quota.json` 写入 `unverifiedVersion`，并把版本记入 `status.json` 的 `observedVersion`（OTLP 来源同样提示）。`subscriptions.cjs` 的 `normalizeClaude`：有 `unverifiedVersion` 时在说明前加「x.y 版本未经验证，按已知结构读取。」（旧版读取会忽略这个字段）。第 5 节「statusLine 额度严格」改为已处理；AGENTS §6 Claude 一条补上规则。**Mac**：`TokenUsageAssistant-Mac-arm64-1.9.0-beta.2-dev.fe8e481.dmg`（130991771 字节，sha256 `a62f1e98…`）与 `.zip`（130969422 字节，`f9475963…`）在发布目录，`.app` 在 `apps.noindex/`；包内版本为临时设置的 `1.9.0-beta.2-dev.fe8e481`，构建后已还原。**Windows**：分支 CI 通过，安装包随 beta.3。 | — |
| 2026-10-23 | T8.5 | `task/T8.5-collector-port`：`2d637a5`、文档提交；`--no-ff` 合并为 `2208ca2`；分支 CI `39968765820` 两个平台通过 | 346 项：343 通过 / 0 失败 / 3 跳过（新增 3 项 `tests/subscriptions.test.cjs`：真实被占用的端口会被替换、保存、写进启动配置，新端口上第一条事件后提示清除；模拟 `EACCES` / `EADDRINUSE` 会换端口、最后由系统分配，其他错误不重试且配置不变，全部失败时报告最后的错误；「工具明细」状态显示提示文案。三项在旧代码上都失败；原有断言未改）；ESLint 0 个错误、35 个警告；typecheck、`prettier --check` 通过 | ①＋②：本机打包版 `Verify-Mac-Native.command` 7 项门禁首次即全部通过；包内 `claude-collector.cjs`、`subscription-status.cjs`、`main.cjs` 与源码逐字节一致。未做 ③（没有能复现保留端口的 Windows 真机） | `claude-collector.cjs` 新增 `listen()`：保存的端口遇到 `EACCES` / `EADDRINUSE` 时再试 3 个随机端口（49152–65151），再由系统分配；成功换端口后写回 `collector.json`（令牌、来源标识不变），记录 `portChange`，日志 `claude-collector port-changed`；收到第一条 `/v1/logs` 事件后清除。状态栏辅助脚本每次运行都读 `collector.json`，所以额度在已开的会话里自动恢复；OTLP 地址在会话启动时固定，需要重开会话。`subscription-status.cjs`：Claude 账户有 `portChange` 时「工具明细」显示「采集端口已更换 · 需重开会话」及说明（D10 已批准，截图 `docs/island-1.9.0-design/claude-port-change/`）；浏览器预览新增 `?provider=claude&desktop-preview=claude-port-changed`。第 5 节「回环端口 EACCES」改为已处理。**Mac**：`TokenUsageAssistant-Mac-arm64-1.9.0-beta.2-dev.2d637a5.dmg`（130996258 字节，sha256 `326cf1fc…`）与 `.zip`（130970117 字节，`7934d93f…`）在发布目录，`.app` 在 `apps.noindex/`；包内版本为临时设置的 `1.9.0-beta.2-dev.2d637a5`，构建后已还原。**Windows**：分支 CI 通过，安装包随 beta.3。 | 提示只保存在内存里：换端口后如果在新会话上报前重启助手，提示不会再出现（额度仍会自动恢复）。 |
| 2026-10-23 | T8.6 | `task/T8.6-dev-version-load-timing`：`ce5d95f`、文档提交；`--no-ff` 合并为 `c2477f0`；分支 CI `39970511325` 两个平台通过 | 348 项：345 通过 / 0 失败 / 3 跳过（新增 2 项：`tests/update-check.test.cjs` 开发包版本按基础版本比较、能提示更新，非法后缀仍拒绝；`tests/providers.test.cjs` 账户加载成功 / 失败都记录耗时，字段只有 `count`、`durationMs`。两项在旧代码上都失败；原有断言未改）；ESLint 0 个错误、35 个警告；typecheck、`prettier --check` 通过 | ①＋②：本机打包版 `Verify-Mac-Native.command` 7 项门禁首次即全部通过；包内 `accounts.cjs`、`update-check.cjs` 与源码逐字节一致。未做 ③ | `update-check.cjs`：版本正则允许可选的 `-dev.<7–40 位十六进制>` 后缀，比较时等同基础版本（开发包 `1.9.0-beta.2-dev.x` 会看到 beta.3 更新，与 beta.2 相同时不提示）。`accounts.cjs` 的 `load()`：成功记 `accounts loaded`（`count`、`durationMs`），失败的 `load-failed` 加 `durationMs`。**Mac**：`TokenUsageAssistant-Mac-arm64-1.9.0-beta.2-dev.ce5d95f.dmg`（130996458 字节，sha256 `ab43129e…`）与 `.zip`（130970791 字节，`c106be42…`）在发布目录，`.app` 在 `apps.noindex/`；包内版本为临时设置的 `1.9.0-beta.2-dev.ce5d95f`，构建后已还原。**Windows**：分支 CI 通过，安装包随 beta.3。 | 首次启动图标卡住（T7.12）再出现时，可对照 `accounts loaded` 的 `durationMs` 判断是否与钥匙串授权窗有关。 |
| 2026-10-23 | T8.7 | `task/T8.7-license-notices`：`defe51f`、文档提交；`--no-ff` 合并为 `ecd5951`；分支 Release 试跑 `39972189296`（首次 Windows smoke 偶发失败，重跑失败作业后 windows / mac / release 均 success） | 350 项：347 通过 / 0 失败 / 3 跳过（新增 `tests/third-party-licenses.test.cjs` 2 项并加入 `test:desktop`：许可证全文与已安装依赖一致；两个平台都随包且两个校验脚本都检查）；ESLint 0 个错误、35 个警告；typecheck、`prettier --check` 通过 | ①＋②：Windows 包完整性报告新增 `licenses`：`resources/LICENSE.txt`、`THIRD_PARTY_NOTICES.md`、`THIRD_PARTY_LICENSES.txt` 与仓库逐字节一致，Electron 的两个许可证文件在安装根目录；Windows smoke（重跑）与升级验证通过。本机 Mac 打包版 `licenseFiles` 通过（5 个文件都在 `Contents/Resources`，3 个与仓库一致），第一次 smoke 150 秒超时、重跑 7 项全部通过。未做 ③ | 用 sourcemap 构建确认打进 `dist/client` 的依赖：react、react-dom、scheduler、chart.js、@kurkle/color、@phosphor-icons/react，另有 @fontsource/geist、geist-mono 字体。新增 `scripts/third-party-licenses.mjs`（从 pnpm 目录读取版本与许可证文件，生成 `THIRD_PARTY_LICENSES.txt`；`--check` 检查是否过期）。`electron-builder.yml` 顶层 `extraResources`（两个平台）加入 `LICENSE`（改名 `LICENSE.txt`）、`THIRD_PARTY_NOTICES.md`、`THIRD_PARTY_LICENSES.txt`；`verify-package.cjs`、`Verify-Mac-Native.command` 逐字节核对。THIRD_PARTY_NOTICES：Electron 版本改为 44.9.3，补 scheduler、@kurkle/color 两行，写明全文位置与随包位置。**Mac**：`TokenUsageAssistant-Mac-arm64-1.9.0-beta.2-dev.defe51f.dmg`（130989801 字节，sha256 `cee0b331…`）与 `.zip`（130976476 字节，`c8602657…`）在发布目录，`.app` 在 `apps.noindex/`；包内版本为临时设置的 `1.9.0-beta.2-dev.defe51f`，构建后已还原。**Windows**：试跑已出包（未存档，正式包随 beta.3）。 | Windows smoke 偶发失败已记入第 5 节（待观察）。 |
| 2026-10-24 | T8.10 | `task/T8.10-release-hardening`：`f2463c8`（主体）、`29e57de`（不覆盖正式报告）；`--no-ff` 合并为 `39cff01`；分支 CI `39985942344`（`f2463c8`）与 `39989821242`（`29e57de`）两个平台通过 | 本机 352 项：349 通过 / 0 失败 / 3 跳过；**CI 两个平台 352 / 0 / 0**（装了 Harness 运行时，3 项不再跳过）；新增 `tests/release-tools.test.cjs` 2 项（CHANGELOG 取节、存档核对）并加入 `test:desktop`；ESLint 0 个错误、35 个警告；typecheck、`prettier --check` 通过 | ①＋②：本机装上固定版本运行时后 `tests/harness-plugin.test.cjs` 18 / 0 / 0（T4.7 改过的插件第一次在真实运行时上通过）；`archive-release.cjs` 的核对对真实的 beta.2 存档无问题、换成错误版本报出 8 处不符、目标目录已存在时拒绝；改过的 `Verify-Mac-Native.command` 在本机按 1.9.0-beta.2 构建两次，7 项门禁都通过（失败留证据的分支没有被触发）。不出包（不改变应用行为），本机构建已删除 | ①CI `ci.yml`：在 `$RUNNER_TEMP` 用 `npm install --ignore-scripts` 装 `@deepseek-ai/dsh-session@0.1.7-rc.1`、`@deepseek-ai/cordis@4.0.4`、`@deepseek-ai/dsh@0.1.7-rc.1`，设置两个环境变量。②`publish.yml`：检出标签，`scripts/changelog-section.cjs` 取 CHANGELOG 本版一节附在公开说明后（没有这一节时失败），job summary 显示全文；T8.10 之前的标签没有这个脚本，不能再用新版 Publish 发布。③`scripts/archive-release.cjs`：RELEASING 第 4、5 步，只读 GitHub，核对哈希在 CI 报告中、报告版本一致、升级验证 passed，安装包仓库已发布时再核对资源摘要和 `SHA256SUMS.txt`；不覆盖已有目录或不同内容的报告。④`Verify-Mac-Native.command`：smoke 期间每 5 秒记录 SecurityAgent 窗口，失败时把报告、日志、stdout / stderr 存到 `work/smoke-failures/<时间>-<版本>/`；**本任务中发现**：按已发布的版本号在本机构建时，脚本会覆盖已提交的 `docs/verification-<版本>/mac-app-integrity.json`（这次覆盖了 beta.2 的正式报告，已从 git 恢复并与发布目录存档逐字节核对一致），现在没有 `TUA_REPORT_DIR` 且正式报告已提交时改写到 `work/local-verification-<版本>/`（CI 设置了 `TUA_REPORT_DIR`，不受影响）。⑤RELEASING：版本必须有 CHANGELOG 一节；推送后等 CI 通过再打标签；第 4–5 步改用存档脚本。计划第 0.2 节第 7 步：执行记录写明推送 / 分支 CI、标签 CI 与 Release 的运行号（原计划写「执行记录增加两栏」，为不改动现有表格结构改为写进第 0.2 节的要求）。AGENTS §9、README、PROJECT_HANDOFF 的基线写明本机与 CI 两种口径；插件 README 说明 CI 已运行这些测试。 | Publish 的新写法要到下一次发版（beta.3）才会真正运行；先用演练检查 job summary 中的说明全文。 |
| 2026-10-24 | T8.8（升版与 main 试跑） | `task/T8.8-release-1.9.0-beta.3`：`8300c9e`；`--no-ff` 合并为 `c645c1e` 并推送；**推送后 CI `39992003122` 两个平台通过**（之后才试跑）；Release 试跑 `39992543069`（workflow_dispatch，windows / mac / release 均 success，首次即通过） | 本机 349 / 0 / 3；CI 352 / 0 / 0；ESLint 0 个错误、35 个警告；typecheck、`prettier --check` 通过 | ②：Windows 真实 DPAPI 升级验证 1.9.0-beta.2 → 1.9.0-beta.3（profile `1.9.0-beta.2-to-1.9.0-beta.3`）28 项全部通过，含 `newBuildKeepsUnknownPreferences`；Windows smoke ok、包完整性 ok（含 3 个许可证文件逐字节核对）；Mac 7 项门禁全部通过（含 `licenseFiles`）；各报告版本均为 1.9.0-beta.3。未做 ③ | 版本升为 **1.9.0-beta.3**；新增 profile `1.9.0-beta.2-to-1.9.0-beta.3` 与同版本 `1.9.0-beta.3-to-1.9.0-beta.3`（都打开 `unknownPreferencesKept`），beta.2 同版本 profile 注释改为已被取代；CHANGELOG 标题改为「1.9.0-beta.3（未发布，稳固版）」（`changelog-section.cjs` 能取出本节，Publish 将用它）；README、AGENTS（当前版本、§7）、PROJECT_HANDOFF 已更新。试跑包下载到 `~/Documents/TokenUsageAssistant-releases/release-v1.9.0-beta.3-ci.c645c1e/`，SHA256 与 CI 完整性报告一致：Setup `8fc1709b…`、Portable `30c1f591…`、DMG `7a6de2d9…`、ZIP `7c1f9057…`。 | 下一步（每步先问用户）：打标签 `v1.9.0-beta.3`（指向推送后 CI 已通过的 main 提交）→ 等标签 CI 与 Release → `node scripts/archive-release.cjs v1.9.0-beta.3` → 用户发布源码仓库草稿 → Publish 演练（核对 job summary 里的说明全文）→ 正式发布；发布时给 CHANGELOG 标题补日期。 |
| 2026-10-24 | T8.8（标签 v1.9.0-beta.3） | 标签 `v1.9.0-beta.3` → `ce60aa7`（= origin/main，该提交推送后 CI `39996333372` 通过）；**标签 CI `39998715213` 通过**；Release `39998715593`（windows / mac / release 均 success），源码仓库生成草稿（prerelease） | 同上 | ②：草稿附带的报告由 `scripts/archive-release.cjs` 核对（首次正式使用）：各报告版本均为 1.9.0-beta.3、升级验证 passed、4 个安装包的 SHA256 都在 CI 完整性报告中；未做 ③ | 存档脚本把 4 个安装包与 4 份报告放进 `~/Documents/TokenUsageAssistant-releases/release-v1.9.0-beta.3/`，报告放进 `docs/verification-1.9.0-beta.3/`（本次提交）。哈希：Setup `03dfcb2c…`、Portable `107c45c7…`、DMG `802c5e95…`、ZIP `0dd488ea…`（标签构建重新打包，与 main 试跑不同，属预期）。 | 下一步：用户在源码仓库发布草稿 → Publish 演练（核对 job summary 中由 CHANGELOG 生成的说明）→ 用户确认后正式发布；发布时给 CHANGELOG 标题补日期，并再跑一次存档核对（安装包仓库的摘要与 `SHA256SUMS.txt`）。 |
| 2026-10-25 | T8.8（发布 1.9.0-beta.3）与 D13 | 用户在源码仓库发布 `v1.9.0-beta.3`（prerelease）；Publish 演练 `40164722611`（发布步骤 skipped，说明全文由标签处 CHANGELOG 生成，先交用户看过）→ 用户确认 → 正式运行 `40165241022`（各步骤 success）；记录分支 `task/D13-release-records` | — | ②；未做 ③ | 安装包仓库 [v1.9.0-beta.3](https://github.com/junjunup/TokenUsageAssistant/releases/tag/v1.9.0-beta.3)：draft=false、prerelease=true，5 个文件；`SHA256SUMS.txt` 只列 4 个安装包，每个哈希与 GitHub 资源摘要、`SHA256SUMS.txt`、存档目录（`checkRelease` 无问题）三方一致：Setup `03dfcb2c…`、Portable `107c45c7…`、DMG `802c5e95…`、ZIP `0dd488ea…`；公开说明含「本版改动」及 T8.1–T8.10 全部条目（T8.10 的新写法首次实际运行）。CHANGELOG 标题补日期；AGENTS、PROJECT_HANDOFF 改为已发布。**D13**：用户决定确认流程分三档，写入第 1 节、第 0.2 节第 6 步、AGENTS §7；PROJECT_HANDOFF 新增「需要你亲手做的事」一节。 | 自签名证书（钥匙串方案）等用户创建证书后进行；D12 路线下一步为 T6.1。 |
| 2026-10-25 | 钥匙串：本机自签名签名 | `task/keychain-local-signing`：`3e25905` 及修正提交；`--no-ff` 合并为 `0f24936`；推送后 CI 见下一条记录要求 | 本机 349 / 0 / 3（只改两个打包脚本） | ②：用户创建证书后（`security find-identity -v -p codesigning` 显示 1 个有效身份），本机连续打两个包（临时版本 `1.9.0-beta.3-dev.a000001`、`-dev.a000002`，验证后已删除，未存档）：两个包的指定要求都是 `identifier "local.commandcode.tokenusageassistant" and certificate leaf = H"a2784991…"`（不再是随构建变化的 cdhash），`codesign --verify --deep --strict` 通过；`Verify-Mac-Native.command` 两次都 7 项全过，报告 `signature` 记为本机自签名证书，第二次全程 53 秒、smoke 未超时 | `Build-Mac-App.command`：登录钥匙串有「TokenUsageAssistant Local Signing」时传 `--config.mac.identity=…` 与 `--config.mac.timestamp=none`（自签名不需要可信时间戳，且时间戳服务常连不上），`TUA_MAC_IDENTITY=-` 强制 ad-hoc；`Verify-Mac-Native.command`：用 `codesign -dvv`，ad-hoc 或该证书（`Authority=TokenUsageAssistant Local Signing`）都通过并写明。过程中修正两处：`pnpm run … -- 参数` 会把 `--` 原样传给 electron-builder 导致参数被忽略；纯数字带前导零的预发布号会被规范化（`dev.0000001` → `dev.1`）。D4、AGENTS §7、RELEASING 已更新。 | 是否弹窗要用户确认（第一次应弹 smoke 条目一次，第二次不弹）；换装新签名的正式包时正式条目会再弹一次；是否让 CI 正式包也用这张证书另行决定（D13 第二档）。 |
| 2026-10-25 | 钥匙串：证书方案撤回，smoke 改用模拟钥匙串 | `task/smoke-mock-keychain`：`a1fcbe0`、文档提交；`--no-ff` 合并为 `8df375e` | 本机 350 / 0 / 3（新增 1 项 `tests/platform.test.cjs`：Mac smoke 设置 `use-mock-keychain` 的接线）；ESLint 0 个错误、35 个警告；`prettier --check` 通过 | ②：本机 ad-hoc 打包（临时版本 `1.9.0-beta.3-dev.a1fcbe0`，验证后已删除）`Verify-Mac-Native.command` 7 项门禁全部通过，全程 19 秒；smoke 前后 smoke 条目的分区表都是 23 条，新包不在其访问控制表中——钥匙串未被访问 | **用户反馈第二个证书签名的包仍弹窗，查明原因**：`security dump-keychain -a`（只读访问控制，不读机密）显示 smoke 条目的访问控制表已按证书记录（`certificate leaf = H"a2784991…"`），但分区表仍是 `cdhash:` 列表，并多出两个测试包的条目——没有 Apple 团队 ID 时分区按 cdhash，自签名证书无法避免弹窗。执行模型在实测前就问用户「第二个没弹，对吗」，应先查分区表。处理（用户同意）：撤回本机证书签名（两个打包脚本恢复到 `d3a8e19`）；`main.cjs` 在 Mac smoke 模式下 `app.commandLine.appendSwitch('use-mock-keychain')`；AGENTS §5、§7、§9，RELEASING，D4，PROJECT_HANDOFF 已更新。 | smoke 不再测到真实钥匙串读写（由真机使用覆盖）；装新版本时正式条目弹一次授权先接受。 |
| 2026-10-25 | T6.1 | `task/T6.1-verification-levels`：`2d8dda1`、`a46c54f`；分支 CI `40167417922` 两个平台通过；用户按 D10 确认浅色 / 深色截图（`docs/design/T6.1-verification-levels/` 共 6 张）后 `--no-ff` 合并为 `eb92a38` | 354 项：本机 351 通过 / 0 失败 / 3 跳过（新增 1 项 `tests/providers.test.cjs`：每个平台的验证等级合法、日期格式正确，`live` 恰为 Claude、Codex、Command Code；`tests/provider-registry.test.cjs` 中渲染端目录的字段清单加上 `verification`，属于新增字段，未放宽断言）；ESLint 0 个错误、35 个警告；typecheck、`prettier --check` 通过 | ①＋②：本机 ad-hoc 打包 `1.9.0-beta.3-dev.a46c54f`，`Verify-Mac-Native.command` 7 项门禁全部通过（smoke 用模拟钥匙串）；包内 `provider-catalog.cjs`、9 个 `providers/*.cjs`、`main.cjs` 与源码逐字节一致，前端产物含新文案；DMG / ZIP 与报告存档于 `release-v1.9.0-beta.3-dev.a46c54f/`，`.app` 在 `apps.noindex/` 下。Windows 双包待 CI 补齐。未做 ③ | 各平台注册表加 `verification: {level, date, note}`：Command Code live（2026-10-25）、Codex live（2026-10-15）、Claude live（2026-10-19，按 PROJECT_HANDOFF 的 ③（Claude 代测）记录，计划原写 contract）；GLM、MiniMax、火山、DeepSeek、OpenCode Go 为 contract（2026-10-15）。`provider-catalog.cjs` 把 `verification` 传给渲染端；`Select` 支持选项标签 `badge`；平台选择、账户切换器显示「已实测 / 样例验证 / 实验」标签，连接表单显示一行等级说明。CHANGELOG 新增「未发布（计划作为 1.9.0-beta.4）」一节。 | 等级要随实测更新（某平台做了 ③ 就改成 live 并更新日期）；下一步 T6.2。 |
| 2026-10-25 | T6.2 | `task/T6.2-coverage-report`：`396e187`、`7cfcebe`；分支 CI `40169652335`、`40171612363` 两个平台通过；用户按 D10 确认浅色 / 深色截图（`docs/design/T6.2-coverage-report/` 共 6 张）后 `--no-ff` 合并为 `ef0481f` | 356 项：本机 353 通过 / 0 失败 / 3 跳过（新增 2 项 `tests/associations.test.cjs`：`available:false` 时页面数据里没有 `comparison`、`difference`、`errorRate` 字段，原因与 `reconcile()` 的 `reasons` 完全一致，来源起止与关联计数原样取自报告；可比时差值原样透传；各类缺口文字。原有核对测试与 `compareEvidence` 测试未改、全部通过）；ESLint 0 个错误、35 个警告；typecheck、`prettier --check` 通过 | ①＋②：第一次本机打包（`-dev.396e187`）原生 smoke **失败**：`association-native-smoke.cjs` 仍点击旧的「账户核对」按钮（证据留在 `work/smoke-failures/kept-t6.2-old-smoke-label/`，未入库、未存档）。改 smoke 跟随新名称与新标题，并**新增**断言：不可比时页面上没有差值区块（`7cfcebe`）。重新打包 `1.9.0-beta.3-dev.7cfcebe`，7 项门禁全部通过；包内 `coverage-report.cjs`、`analytics-service.cjs`、`associations.cjs`、smoke 脚本与源码逐字节一致；存档于 `release-v1.9.0-beta.3-dev.7cfcebe/`。Windows 双包待 CI 补齐。未做 ③ | 新增纯模块 `desktop/coverage-report.cjs`（加入 typecheck 与渲染端生成）：只读 `reconcile()` 的结果，按来源整理覆盖起止和缺口（`stale`、`truncated`、`partialLine`、`missingUsage`、`unverified-version`、范围内无归入记录），关联计数来自 `summarizeAssociations`；`available` 不为 true 时不带任何差值字段。页面：导航、标题、面包屑改为「覆盖范围报告 / Coverage」；顶部「N 个来源 · M 处覆盖缺口」，不可比时列「暂不能计算差值」的原因，可比时才出现差值 / 误差率；「工具来源覆盖」「关联状态」两节；原平台 / 工具两栏保留。`compareEvidence`、IPC 名称、`source:'reconciliation'` 未改。浏览器预览新增 `?desktop-preview=coverage`。 | 无。 |
| 2026-10-25 | T8.14（测量 Claude 导出） | 只读查看本机真实数据（未改动任何文件） | — | ③（Claude 代测，只读） | 真实 userData 中 Claude 来源已启用，但导出文件 `claude-collector/usage.jsonl` 只有 **1 行、1085 字节**，最后写入 2026-10-19；`quota.json` 同日。说明用户平时没有通过生成的 Start-Claude 启动 Claude Code，导出几乎不增长。日志（2026-10-18 至 10-25，248 行）里只有 1 条来源耗时（Zcode 4 ms），整次工具查询最长 37 ms，没有 Claude 来源的耗时记录。 | **结论：暂不做 T4.2，T7.2 维持推迟**——没有证据说明 Claude 读取慢（复盘定的门槛是约 0.5 秒或文件明显变大）。以后若开始用 Start-Claude 启动，导出超过约 5 MB 或诊断信息里 claude-code 的读取耗时超过 0.5 秒时，再做 T4.2（连同文件轮转，复盘 L7）。 |
| 2026-10-25 | T6.3 | `task/T6.3-progressive-disclosure`：`7708d4c`（盘点与方案，用户确认 A、B 两组）、`3f180ef`、`39aa0be`；分支 CI `40172418045`、`40172943473` 两个平台通过；用户按 D10 确认浅色 / 深色截图（`docs/design/T6.3-progressive-disclosure/` 共 6 张）后 `--no-ff` 合并为 `94b6520` | 357 项：本机 354 通过 / 0 失败 / 3 跳过（新增 1 项 `tests/opencode-go.test.cjs`：Go 说明的结论不超过 40 字，金额与 Zen 余额的说明在详情里）。两处随文案调整：`tests/balance.test.cjs` 原断言 `message` 含「余额变化不是实际消费」，改为分别断言结论「只有余额，没有 Token 或账单汇总」和详情含原句（更严）；`tests/fixtures/provider-behaviour-snapshot.json` 中 OpenCode Go 结果的哈希更新为 `597e7e1d…`——已核对把 `note` 与 `noteDetail` 用「；」接回去后，哈希正好等于旧快照 `f6a6db9b…`，即唯一的变化是这段文字的拆分（测试旁加了注释）；ESLint 0 个错误、35 个警告；typecheck、`prettier --check` 通过 | ①＋②：第一次本机打包（`-dev.3f180ef`）原生 smoke **失败**：`balance-native-smoke.cjs` 用 `.balance-tools button` 点「查看工具分析」，但同一卡片里的说明多了 ⓘ 按钮，选中了它（证据留在 `work/smoke-failures/kept-t6.3-balance-selector/`，未入库、未存档）。改为 `.balance-tools > button`（`39aa0be`），其余 smoke 选择器已逐个核对，不会选到 ⓘ。重新打包 `1.9.0-beta.3-dev.39aa0be`，7 项门禁全部通过；包内 7 个改动的后端模块与 smoke 脚本与源码逐字节一致；存档于 `release-v1.9.0-beta.3-dev.39aa0be/`。Windows 双包待 CI 补齐。未做 ③ | 新组件 `src/Disclosure.jsx`（`disclosure.css`）：结论后一个 12px 的 ⓘ 按钮，`aria-expanded` / `aria-controls`，默认收起、不记忆；没有详情时只显示结论。前端 22 处改为结论 + 详情（总览、余额、用量分析、覆盖范围报告、账户关联、设置、工具来源、Codex / Claude 连接说明）；后端 8 处拆成两个字段：OpenCode Go、Codex 订阅、Claude 订阅的 `note` / `noteDetail`，分析服务的两种不可用说明，以及 Claude / Codex / OpenCode 来源的 `message` / `messageDetail`（`tool-worker.cjs` 原样透传）。错误、需操作的提示、确认文字、弹窗按方案 C 不动。浏览器预览数据同步改为新写法。 | 第 3 节路线（D12）到此全部完成；T6.1–T6.3 是否作为 1.9.0-beta.4 发布，待用户决定（D13 第二档）。 |
| 2026-10-25 | 1.9.0-beta.4 升版与 main 试跑 | `task/release-1.9.0-beta.4`：`12259d1`；`--no-ff` 合并为 `d2174b1` 并推送；**推送后 CI `40174289762` 两个平台通过**（之后才试跑）；Release 试跑 `40174492696`（workflow_dispatch，windows / mac / release 均 success，首次即通过） | 本机 354 / 0 / 3；CI 357 / 0 / 0；ESLint 0 个错误、35 个警告；typecheck、`prettier --check` 通过 | ②：Windows 真实 DPAPI 升级验证 1.9.0-beta.3 → 1.9.0-beta.4（profile `1.9.0-beta.3-to-1.9.0-beta.4`）28 项全部通过，含 `newBuildKeepsUnknownPreferences`；Windows smoke ok、包完整性 126 项全部通过；Mac 7 项门禁全部通过；各报告版本均为 1.9.0-beta.4。未做 ③ | 版本升为 **1.9.0-beta.4**（T6.1–T6.3，用户 2026-10-25 决定）；新增 profile `1.9.0-beta.3-to-1.9.0-beta.4` 与同版本 `1.9.0-beta.4-to-1.9.0-beta.4`（都打开 `unknownPreferencesKept`），beta.3 同版本 profile 注释改为已被取代；CHANGELOG 标题改为「1.9.0-beta.4（未发布，说明与报告）」（`changelog-section.cjs` 能取出本节）；README、AGENTS（当前版本、§7）、PROJECT_HANDOFF 已更新。试跑包下载到 `~/Documents/TokenUsageAssistant-releases/release-v1.9.0-beta.4-ci.d2174b1/`，SHA256 与 CI 完整性报告一致：Setup `241ca476…`、Portable `1b831a90…`、DMG `9d8bda45…`、ZIP `9b567fe5…`。 | 等用户一次确认（D13 第二档）：打标签 `v1.9.0-beta.4`（→ `d2174b1`）→ 标签 CI 与 Release → `archive-release.cjs` → 用 `gh` 发布源码仓库草稿 → Publish 演练 → 正式发布 → 核对；发布时给 CHANGELOG 标题补日期。 |
| 2026-10-25 | 发布 1.9.0-beta.4 | 用户一次确认（D13 第二档）后：标签 `v1.9.0-beta.4`（附注标签 → `d2174b1`）；标签 CI `40175680080` 两个平台通过；Release `40175680116`（windows / mac / release 均 success，draft prerelease 8 个文件）；`archive-release.cjs` 存档并核对；`gh release edit --draft=false --prerelease` 发布源码仓库 Release；Publish 演练 `40176254251`（发布步骤 skipped）→ 正式运行 `40176428470`（各步骤 success） | — | ②；未做 ③ | 安装包仓库 [v1.9.0-beta.4](https://github.com/junjunup/TokenUsageAssistant/releases/tag/v1.9.0-beta.4)：draft=false、prerelease=true，5 个文件；`SHA256SUMS.txt` 只列 4 个安装包，每个哈希与 GitHub 资源摘要、`SHA256SUMS.txt`、存档目录三方一致：Setup `743bf127…`、Portable `41d03cf1…`、DMG `3aa2f058…`、ZIP `379e9860…`。公开说明与用户确认的全文一致（标签处 CHANGELOG 与生成脚本自确认后未改动；发布后逐行比对，只差末尾空行）。演练的 job summary 不在日志里，未能从命令行直接读取，改用上述比对。CHANGELOG 标题补日期；AGENTS、README、PROJECT_HANDOFF 改为已发布；`docs/verification-1.9.0-beta.4/` 入库。 | 用户亲手做的事已更新为 beta.4（换装、浏览器下载首次打开）。 |
| 2026-10-25 | 用户待办：换装 beta.4、浏览器下载首次打开（H3）、Harness 版本 | 用户授权执行模型操作电脑；只读查看、Safari 下载、替换「应用程序」中的应用 | — | ③（Claude 代测；放行安全提示由用户完成） | ① Harness：`/Applications/DeepSeek Harness.app` 为 **0.2.1-rc.2**（`~/.dsh/dsh-runtimes/.../runtime.json` 的 `desktopVersion` 相同），另有 DSH Desktop Beta 2.0.17-beta.1；本项目锁定 0.1.7-rc.1，留给 T8.13。② H3：Chrome 扩展未连接，改用 `open -a Safari <资源直链>` 让 Safari 下载 DMG：SHA256 `3aa2f058…` 与发布一致，带 Safari 的隔离属性；挂载后用 `ditto` 装入「应用程序」（替换原 1.9.0-beta.1-dev），首次启动时进程停在 `_dyld_start` 等待系统安全判定，弹窗执行模型看不到（系统弹窗不在截图里），用户反馈为「无法验证开发者 / 从互联网下载」一类并已放行；是弹窗直接打开还是需到系统设置「仍要打开」，待用户确认。③ 放行后启动正常：日志 `start` 1.9.0-beta.4、账户加载 2 个（首次 6.1 秒，之后 20 毫秒）、菜单栏图标正常、界面截图确认版本与新的 ⓘ 说明；未出现钥匙串授权弹窗。④ 发现：应用以 App Translocation（隔离副本路径）运行，因为是命令复制、未经访达拖拽；执行模型试图用访达 AppleScript 把应用移出再移回，移回「应用程序」需要管理员权限而失败，已立即用 `mv` 放回原处（版本、隔离属性不变），未输入任何密码；不去掉隔离属性（属于绕过系统检查）。⑤ 检查更新两次返回 HTTP 403：本机出口 IP 的 GitHub 未认证 API 额度为 0/60（`x-ratelimit-remaining: 0`），是环境限流，不是应用缺陷；应用按失败处理、不影响其他功能。 | 待用户确认首次打开的确切路径后，更正 README / 验收清单 / 公开说明模板里的「右键 → 打开」；更新检查遇到 403 限流时界面怎么提示，可以另看。 |
| 2026-10-25 | H3 首次打开说明更正 | `task/H3-first-open-instructions`；`--no-ff` 合并到 main | 本机 354 / 0 / 3；`prettier --check` 通过；`bash -n` 打包脚本通过 | ③：用户确认 macOS 15.7.9 上浏览器下载的 1.9.0-beta.4 首次打开时，弹窗里没有「打开」按钮，要到「系统设置 → 隐私与安全性」点「仍要打开」 | 把「右键 → 打开」改为「系统设置 → 隐私与安全性 → 仍要打开」：README 安装第 2 步、验收清单第 1 项（步骤、预期、实测记录）、AGENTS §7 的 D4 限制、RELEASING、`Build-Mac-App.command` 的结束提示、`publish.yml` 的公开说明模板（以后的发布生效）。历史文档（`docs/MAC-APP-*-1.8.0-beta.5.md` 等）不改。 | 用户决定后（同日）：安装包仓库 README 提交 `95cfe61`、1.9.0-beta.1–beta.4 四个 Release 说明用 `gh release edit --notes-file` 更新，均只把「首次打开请在「应用程序」中右键 → 打开。」换成新写法；复核：四个说明都等于「原文只替换这一句」，draft=false、prerelease=true、各 5 个文件不变，README 与预期逐字节一致。源码仓库 Release 说明不含这句，未改。 |
| 2026-10-26 | T8.13 | `task/T8.13-harness-0.2`：`cc0aa0c`；分支 CI `40218559764` 两个平台 364 / 0 / 0（两个 Harness 运行时都装上，6 项运行时测试都执行）；`--no-ff` 合并为 `9143361` | 364 项：本机 358 通过 / 0 失败 / 6 跳过（未装运行时的 6 项；本机另装两套隔离运行时到 `work/` 后 `tests/harness-plugin.test.cjs` 24 / 24 通过）。新增：导出器 3 项（两个已验证版本写入各自版本与上游提交；未验证版本照常导出、字段改名或未知结束原因仍停止；1.4.0 建立的来源在升级后沿用身份、外来标记仍冲突），读取端 1 项（已验证正常、未验证读取并标注、格式错误的版本与「未验证却带提交」的标记拒绝），运行时测试改为按版本各跑一遍（+3）。**改动的原断言**：原测试要求版本 `9.9.9` 被拒绝，这正是本次用户决定改变的规则；改为格式不合的版本串（缺失、空、`latest`、`0.2`、含空格）仍拒绝，并新增未验证版本的结构校验测试。ESLint 0 个错误、35 个警告；typecheck、`prettier --check` 通过 | ①＋②：本机 ad-hoc 打包 `1.9.0-beta.4-dev.cc0aa0c`，7 项门禁全部通过；包内 `harness-reader.cjs`、`tool-analytics.cjs`、smoke 样例与源码逐字节一致；存档于 `release-v1.9.0-beta.4-dev.cc0aa0c/`。官方 0.2.1-rc.2 SessionStore、插件入口、官方 CLI 在隔离 `DSH_HOME` 中安装 / 启动 / 卸载均通过（无模型请求）。未做 ③（用户尚未在真实 Harness 中安装插件） | 调研：用户装的是 DeepSeek Harness 0.2.1-rc.2（会话文件仍为 `session.v4`）；比较官方发布包 `dsh-session`、`dsh-llm` 0.1.7-rc.1 与 0.2.1-rc.2 的类型定义：事件类型表、助手消息流 0 行变化，导出器读取的字段与结束原因集合完全相同，变化只在请求头说明、实验性插件记录 API、工具历史折叠等未使用部分；上游标签 `dsh-v0.2.1-rc.2` → `687f282e…`。实现：导出器 1.5.0 `VERIFIED_RUNTIMES` 两个版本，其他合格版本照常按原有严格结构校验导出并在记录中写实际版本；`source.json` 写创建时的版本与提交（未验证为 `null`），兼容 1.4.0 建立的来源；读取端接受 1.4.0 / 1.5.0，未验证版本报 `contract:'unverified-version'` 与提示（复用 Codex 的文案）；`package.json` 对等依赖改为 `0.1.7-rc.1 || >=0.2.1-rc.2`。CI 增装 0.2.1-rc.2 运行时与 CLI。AGENTS §6、插件 README（新增 macOS 桌面版用 `npx` 安装）、上游契约记录、README、CHANGELOG 已更新。插件副本放到 `~/.token-usage-assistant/harness-plugin` 供用户安装。 | 用户在 Harness 中安装插件并添加来源后可做 ③；退回 1.9.0-beta.4 及更早的助手时，1.5.0 写的新记录会被旧版判为不支持（只影响 Harness 来源）。 |
| 2026-10-26 | T9.1 | `task/T9.1-upstream-check`：`63fbfee`；分支 CI `40220690477` 两个平台通过；`--no-ff` 合并为 `48b123f`；合并后在 main 上手动触发新工作流 `40221140806`（success） | 368 项：本机 362 通过 / 0 失败 / 6 跳过（新增 `tests/upstream-check.test.cjs` 4 项：已验证范围直接取自读取端代码；查询失败或版本格式不对一律「无法检查」，不当作已是最新；报告内容与待处理计数；只访问 dist-tags 地址，各种失败都返回 null）；ESLint 0 个错误、35 个警告；typecheck、`prettier --check` 通过 | ①；不改变应用行为，不出包。脚本在不装依赖的干净目录中也能运行（工作流不执行 `pnpm install`） | `scripts/check-upstream.cjs`（`pnpm run check:upstream`）：查询 npm 注册表的 dist-tags（可用 `UPSTREAM_REGISTRY` 改为镜像），Codex `@openai/codex`、Claude Code `@anthropic-ai/claude-code`、Harness `@deepseek-ai/dsh` 都取 `latest`；已验证范围引用 `codex-reader.cjs` 的 `VERIFIED_VERSIONS`、`claude-collector.cjs` 的 `supported`、`harness-reader.cjs` 的 `VERIFIED`，不另抄一份。`.github/workflows/upstream.yml`：每周一 01:17 UTC 与手动触发，只写运行摘要，不开 issue、不提交、不装上游包。首次结果：Codex 0.164.0 超出范围（已记入第 5 节），Claude Code 2.1.310 与 Harness 0.2.1-rc.2 在范围内。 | 下一步 T9.2（Electron fuses）。 |
| 2026-10-26 | T9.2 | `task/T9.2-electron-fuses`：`95632e4`；分支 CI `40221999152` 与分支 Release 试跑 `40222008210`（windows / mac / release 均 success）；`--no-ff` 合并为 `543935a` | 371 项：本机 365 通过 / 0 失败 / 6 跳过（新增 `tests/fuses.test.cjs` 3 项：`scripts/fuses.cjs` 的期望与 `electron-builder.yml` 完全一致；RunAsNode 开、NODE_OPTIONS 与 --inspect 关、只从 asar 加载；逐项报出不一致或读不到的开关）；ESLint 0 个错误、35 个警告；typecheck、`prettier --check` 通过 | ②：本机 ad-hoc 打包 `1.9.0-beta.4-dev.95632e4`，`Verify-Mac-Native.command` 8 项门禁全部通过（新增 `electronFuses`；原生 smoke 内含用打包程序以 `ELECTRON_RUN_AS_NODE` 运行 Claude `StatusLine.cjs`）。直接探测：`ELECTRON_RUN_AS_NODE=1` 仍可运行；`NODE_OPTIONS=--require` 不再生效（探针文件未写出）；正常启动加 `--inspect=9341`（隔离 smoke 目录）不监听端口、无调试输出。Windows：Release 试跑的包完整性报告读回的 fuse 与期望一致，smoke 与 DPAPI 升级验证通过。存档于 `release-v1.9.0-beta.4-dev.95632e4/`。未做 ③ | `electron-builder.yml` 新增 `electronFuses`：`enableNodeOptionsEnvironmentVariable`、`enableNodeCliInspectArguments` 关，`onlyLoadAppFromAsar` 开；`runAsNode` 保持开（Claude statusLine 帮助程序与启动脚本依赖），`grantFileProtocolExtraPrivileges` 保持开（菜单栏图标渲染页用 `loadFile`）；Cookie 加密、asar 完整性校验、V8 快照未改（未评估出必要性，前者在 Mac 会多用一个钥匙串条目，后者与 ad-hoc 签名的配合未验证）。新增 `scripts/fuses.cjs`（经 electron-builder 依赖链读取 `@electron/fuses`，不新增依赖），`verify-package.cjs`（报告新增 `fuses`）与 `Verify-Mac-Native.command`（新增 `electronFuses` 门禁）都读回并比较。**如实记录**：在 `ELECTRON_RUN_AS_NODE` 模式下 `--inspect` 仍然生效——这个模式本身就是可运行任意脚本的 Node，关闭 `--inspect` 不增加防护；要消除只能关 `RunAsNode`，与 Claude 组件冲突。AGENTS §7 门禁同步。 | 下一步 T9.3（「未启用」措辞与「<1%」，先出截图）。 |
| 2026-10-26 | T9.4 | `task/T9.4-privacy-security`：`97ff48d`；分支 CI `40223262784` 两个平台通过；`--no-ff` 合并为 `eda6775` | 371 项不变；`prettier --check` 通过 | —（只改文档，不出包） | 新增 `docs/PRIVACY.md`（中英文）：逐个平台写读取内容与访问地址（取自 `desktop/providers/*.cjs` 的固定地址），本机工具来源只读白名单元数据，不读的内容，数据目录与各文件用途，联网只有已连接平台与 GitHub 更新检查（可关），诊断信息只在用户导出时生成且先预览，如何删除。Windows 数据目录只写「`%APPDATA%` 下本应用的文件夹」，未在 Windows 真机核对具体名称。`SECURITY.md` 改为中英双语，并保留原文要点（凭据外泄、绕过只读、打码或合成样例）——**执行模型一开始用新内容直接覆盖了原文件，没有先读**，发现后对照 `main` 上的原文补回遗漏的两点。GitHub 私密漏洞报告查询为已开启（`enabled:true`），无需改设置。AGENTS §4 新增一条：数据边界变化时同步更新 `docs/PRIVACY.md`。 | 下一步 T9.5；T9.3 等截图确认。 |
| 2026-10-26 | T9.5 | `task/T9.5-contributing`：`dbfd51e`；分支 CI `40223669123` 两个平台通过；`--no-ff` 合并为 `53f4185` | 371 项不变；`prettier --check` 通过 | —（只改文档与仓库模板，不出包） | `.github/ISSUE_TEMPLATE/`：问题反馈表单（版本、系统、涉及的平台或工具、现象、步骤、可选诊断信息，必选「没有贴密钥 / 令牌 / 账户名 / 对话内容」）、新平台请求表单（必须附官方只读接口文档链接）、`config.yml` 链接到私密漏洞报告；均为中英双语，标签用 GitHub 默认的 `bug`、`enhancement`。`CONTRIBUTING.md`（中英）：开发环境与命令、隔离 smoke、提交前要求（CI、测试只增不减、界面改动先附浅色 / 深色截图、数据边界变化更新 PRIVACY）、数据规则摘要、新平台的实现要求。发现 README「开发」一节的 Electron 版本（44.4.4）和测试基线已过时，留给 T9.7 改版时一并更正。 | 下一步 T9.6；T9.3 等截图确认。 |
| 2026-10-27 | T9.3 | `task/T9.3-idle-and-percent`：`05ebae6`；分支 CI `40223140803` 两个平台通过；用户按 D10 确认浅色 / 深色截图（`docs/design/T9.3-idle-and-percent/` 共 4 张）后 `--no-ff` 合并为 `b68220a` | 372 项：本机 366 通过 / 0 失败 / 6 跳过（新增 1 项 `tests/desktop.test.cjs`：剩余百分比文本 `<1%` / `1%` / `0%` / `—` 的边界；原「未启用与缺数据不同」测试把期望文案从「待首次使用后开始计时」改为「未启用 · 首次使用后开始计时」，这是本任务要改的文案，并**新增**「已有用量的未启用」与「已有用量的缺数据」两个断言，区分仍然严格）；ESLint 0 个错误、35 个警告；typecheck、`prettier --check` 通过 | ②：本机 ad-hoc 打包 `1.9.0-beta.4-dev.05ebae6`：两次打包因网络（TLS 被断开）失败后第三次成功；第一次 `Verify-Mac-Native.command` 原生 smoke 150 秒超时（见第 5 节），立即重跑 8 项门禁全部通过；包内 `domain.cjs`、`main.cjs`、`menubar-status.cjs` 与源码逐字节一致，前端产物含新文案；存档于 `release-v1.9.0-beta.4-dev.05ebae6/`。Windows 双包待 CI 补齐。未做 ③ | `domain.cjs` 新增 `percentText`（<1% 规则的唯一实现，菜单栏改为引用它）；`resetDescription` 对 `resetState:'idle'` 一律以「未启用」开头，已用为 0 时「首次使用后开始计时」，否则「计时起点待平台返回」；只有字段缺失才是「重置时间暂未返回」。`main.cjs`：低额度通知用 `percentText`；托盘提示改用 `windowText`（不限 / 未启用 / `percentText`）。额度说明弹窗文案同步。浏览器预览新增 `?scenario=idle-used`。 | 下一步 T9.6。 |
| 2026-10-27 | T9.6 | `task/T9.6-install-docs`：`ebb67f2`；分支 CI `40440769599` 两个平台通过；`--no-ff` 合并为 `8dcd92d` | 372 项不变；`prettier --check` 通过 | —（只改文档与公开说明模板，不出包） | 新增 `docs/INSTALL.md`（中英）：macOS 安装、首次放行（已实测）、升级时再放行与钥匙串「始终允许」及原因；Windows 安装版 / 免安装版与 SmartScreen「更多信息 → 仍要运行」（**明确标注未在 Windows 真机实测**）；用 `shasum` / `certutil` 核对 `SHA256SUMS.txt`；常见问题（为什么不签名、是否安全、不自动更新、数据位置、彻底卸载含钥匙串条目 `TokenUsageAssistant Safe Storage` 与 Harness 目录、反馈方式）。README 安装节链接到它并补 Windows 提示、改写升级一步（去掉指向旧版 Mac 说明的链接）；`publish.yml` 的公开说明模板补 Windows 提示、macOS 升级说明和安装文档链接（下次发布生效）。安装包仓库 README 的同步留给 T9.10，随发版确认。 | 下一步 T9.9（新平台调研）。 |
| 2026-10-27 | T9.12 | `task/T9.12-upstream-contracts`：分支 CI `40443530533` 两个平台通过；`--no-ff` 合并为 `e578022` | 372 项不变 | —（只调研，不改代码） | 报告 `docs/research/UPSTREAM-CONTRACTS.md`。**Codex**：本机 ChatGPT.app 自带的 Codex CLI 0.159.2 用隔离 `CODEX_HOME` 离线执行 `app-server generate-json-schema`，导出 39 个文件、651 个类型，额度用到的 `RateLimitSnapshot` / `RateLimitWindow` 字段齐全，可自动比对；rollout 是内部格式不在定义里，但 `TokenUsageBreakdown` 与其字段一一对应；本机最近 40 个 rollout（全为 0.159.2）的 `token_count` 字段与读取端期望完全一致（只统计字段名，不读内容）。顺带发现账户级用量查询（候选，未使用）和会消耗重置次数的接口（永不调用，白名单已排除）。**Claude**：npm 包是安装壳，SDK 类型里没有状态栏输入的定义（另一个用量查询形状不同且需登录），只能靠契约与结构指纹。**Harness**：装 0.2.1-rc.3 运行时跑现有运行时测试 2 / 2 通过（临时探针，已删除），证明可自动检查。报告附 Codex rollout、Codex 额度、Claude 状态栏、Claude OTLP、Harness 的契约初稿。T9.9（新平台调研）未与本任务合并，仍单独做。 | 下一步 T9.13（结构契约与三档状态）。 |
| 2026-10-27 | T9.13 | `task/T9.13-structure-contracts`：`1360174`；分支 CI `40446804049` 两个平台 376 / 0 / 0；用户按 D10 确认浅色 / 深色截图（`docs/design/T9.13-structure-contracts/` 共 4 张）后 `--no-ff` 合并为 `c44dc00` | 376 项：本机 370 通过 / 0 失败 / 6 跳过。新增 `tests/upstream-contracts.test.cjs` 4 项（Codex / Claude 契约；按来源列出缺失的可选字段；Codex 客户端只发 4 个只读方法、源码里没有消耗重置次数的调用）。**改动的原测试**（D15 改变的正是这些规则）：Codex「0.160 标为未验证」改为「与 0.155 一样读取、无标签、单一缓存表，可选计数缺失时为部分字段缺失」；「未验证版本字段改名就拒绝」扩展为对 0.155 与 0.160 **都**拒绝，并新增可选字段类型错误的拒绝；Codex「版本号不合格式就拒绝」改为版本只作记录、缺会话标识仍拒绝；Claude OTLP「未验证版本缺任一属性就拒绝」改为任何版本缺输入或输出就拒绝、缺缓存计数则输入总量为未知；Claude「版本号不合格式计为不支持」改为不再检查版本、缺会话或时间仍计为不支持；状态栏「未验证版本的改名窗口拒绝」扩展为对 2.1.251 与 2.2.0 **都**拒绝（另加超出 0–100 与数组两种），空窗口仍清空；采集器状态文件不再写版本、旧文件里的版本被忽略；覆盖范围报告与 Harness 的版本标签断言改为部分字段与无标签。ESLint 0 个错误、35 个警告；typecheck、`prettier --check` 通过 | ②：本机 ad-hoc 打包 `1.9.0-beta.4-dev.1360174`，8 项门禁首次即全部通过；包内 7 个改动模块与源码逐字节一致；存档于 `release-v1.9.0-beta.4-dev.1360174/`。smoke 脚本不依赖版本标签。Windows 双包待 CI 补齐。未做 ③ | 新增纯模块 `desktop/upstream-contracts.cjs`（加入 typecheck）。**与调研初稿的差异**：关系约束（缓存大于输入、推理大于输出、总量小于输入加输出）沿用现有做法按记录标 `invalidUsage`、不丢记录，契约只拒绝结构问题；Claude 状态栏「没有任何窗口」仍按原有规则清空窗口（执行模型一度改成拒绝，被现有测试拦下后恢复），只有「有窗口但都不认识」才算不兼容。Codex 缓存：所有版本的行只写 `codex_file_versions`，`codex_files` 不再写入并在读到时迁移，退回旧版后旧版会自己重读 0.155 文件。来源报告字段改为 `contract:'partial'` 与 `missing`；工具来源卡片和覆盖范围报告显示「部分字段缺失：…，显示为「—」」，格式不兼容沿用「数据需检查」并说明已排除。浏览器预览新增 `?desktop-preview=contract-states`，覆盖范围预览加入部分字段的 Codex 来源。AGENTS §6（Codex、Claude、Harness、跟随上游）、`docs/INSTALL.md` 常见问题、CHANGELOG 已更新。 | 下一步 T9.14（字段名指纹）。 |
| 2026-10-27 | T9.14 | `task/T9.14-field-fingerprints`：`3664eda`；分支 CI `40457285186` 两个平台 380 / 0 / 0；用户按 D10 确认浅色 / 深色截图（`docs/design/T9.14-field-fingerprints/` 共 2 张）后 `--no-ff` 合并为 `9d2928f` | 380 项（+4）：本机 374 通过 / 0 失败 / 6 跳过。新增 4 项：Codex 字段改名记为字段变化、重启后保留、不带任何值；Claude 请求属性名（不含值）成为指纹并保存在采集器状态里；指纹只保留标识符样式的名字、排序、最多 64 个，变化两个方向都列出；只保留用量计数名，含正文或凭据意味的名字一律剔除。诊断快照的期望值加入 `fields: []` 与 `fieldChange: null`（新增字段，原断言未放宽）。ESLint 0 个错误；typecheck、`prettier --check` 通过 | ②：本机 ad-hoc 打包 `1.9.0-beta.4-dev.3664eda`，8 项门禁首次即全部通过；包内 6 个改动模块与源码逐字节一致；存档于 `release-v1.9.0-beta.4-dev.3664eda/`。Windows 双包待 CI 补齐。未做 ③ | `desktop/upstream-contracts.cjs` 新增 `fieldNames`、`usageFieldNames`、`fieldChange`、`fieldChangeNote`。Codex 只读 `last_token_usage` 的键名（存表 `codex_file_fields`，取最新文件），Claude 取 `api_request` 属性名；**执行中发现**：Claude OTLP 的隐私测试拦下了 `prompt`、`apiKey` 这类属性名进入指纹，于是改为只保留用量计数名（含 token / cache）并剔除含正文或凭据意味的名字。指纹与变化（含发现时间）持久化在 `tool-source-status.json`；来源卡片提示 14 天（「一行结论 + ⓘ」）；诊断快照带 `fields`、`fieldChange`。`docs/PRIVACY.md`（中英文）写明只记字段名；问题反馈模板增加工具版本与「升级后读不到」。浏览器预览 `?desktop-preview=contract-states` 加入字段变化样例。 | 下一步 T9.15（自动兼容性检查）。 |
| 2026-10-27 | T9.15 | `task/T9.15-compat-check`：`f6eaef7`…`92a67f9`；分支 CI `40465430381`（`10691da`）两个平台 382 / 0 / 0；不改界面、不改应用行为，`--no-ff` 合并为 `04556b5` | 382 项（+2）：本机 376 通过 / 0 失败 / 6 跳过。新增 2 项：Codex 协议定义里方法、类型、字段齐全才算兼容（改名、缺失、`usedPercent` 不再必填、缺 chatgpt 账户类型都列出来）；兼容性报告只把真正的不兼容计数，测试计数从 TAP 输出读取。`tests/harness-plugin.test.cjs` 只在设置了 `TUA_HARNESS_CANDIDATE_VERSION` 时追加一组运行时测试，平常的测试数不变。ESLint 0 个错误；typecheck、`prettier --check` 通过 | 不出包（不改应用行为）。①：本机与 GitHub（手动运行 Upstream versions 工作流 `40465842036`）：Codex 0.164.0 兼容；Harness 0.2.1-rc.4 的 3 项运行时测试全部通过；对照组 0.2.1-rc.2 在 `40465436698` 中同样通过 | 新增 `scripts/upstream-compat.cjs`，每周版本检查之后运行：最新版本超出已复核列表的工具，在临时目录装官方包（`--ignore-scripts`、不登录、不调用模型、不用任何密钥），检查完删除临时目录。Codex 在隔离的 `CODEX_HOME` 下导出协议定义，比对 4 个只读方法、额度类型和 `TokenUsageBreakdown`；Harness 用官方包自带的 SessionStore、Cordis 和 CLI 跑 3 项运行时测试；Claude 没有可机读定义，报告写明「无法自动检查」。报告只含方法名、字段名、测试计数和本仓库的测试名，不含上游输出；发现不兼容时任务失败（GitHub 通知仓库所有者），安装或导出失败只记「无法检查」。手动运行可以指定版本（经环境变量传入，脚本校验格式）。`check-upstream.cjs` 里过时的「标版本未验证」说明已改。**执行中发现**：CI 上第一次运行时 Harness 的 CLI 测试失败；对照组 0.2.1-rc.2 也失败，说明不是版本问题。临时加调试输出（随后 revert）查明原因是工作流没装 pnpm（官方 CLI 安装插件需要），已补上 pnpm，缺 pnpm 时记为「无法检查」。研究文档 `UPSTREAM-CONTRACTS.md` 与 AGENTS §6 已更新 | 下一步 T9.9（新平台调研）。 |
| 2026-10-27 | T9.9 | `task/T9.9-provider-research`：`cf1d4e8`；只改文档，`--no-ff` 合并为 `1f12442` | 测试数不变（382 项；本机 376 / 0 / 6）；只新增文档，`prettier --check` 通过 | 不出包。只读调研：只看官方文档与公开资料，没有用任何凭据调用接口，没有登录控制台；字段含义未经 ③ 核对 | 产出 `docs/research/PROVIDERS-2026-11.md`：按「官方文档化的只读接口、普通 API Key、不消耗额度、字段语义清楚、区域差异」五条判断。**推荐**：① Kimi 开放平台余额（`/v1/users/me/balance`，国内 CNY / 国际 USD，形状同 DeepSeek 余额）；② OpenRouter `/api/v1/key`（Key 级上限与日 / 周 / 月用量、预算与重置时间；不是账户余额）；③ 硅基流动 `/v1/user/info`（三个余额字段的含义与币种文档未说明，要先用真实返回核对；身份字段不保存）。**暂不建议**：阿里云百炼（API Key 无余额接口，只能用云账号 AccessKey 查整个账户余额；Coding Plan 没有官方额度接口）、Kimi Code 订阅额度（只有第三方逆向的接口）、Anthropic / OpenAI 组织用量（需要管理员密钥）；阶跃星辰、百度千帆没找到官方接口。是否实现、何时实现交用户决定 | 下一步 T9.7（README 改版）。新平台是否实现，在下一个节点一并请用户决定。 |
| 2026-10-27 | T9.7 | `task/T9.7-readme`：`fa16768`；分支 CI `40468588696` 两个平台 382 / 0 / 0；不改应用界面，`--no-ff` 合并为 `038c196` | 测试数不变（382 项；本机 376 / 0 / 6）；ESLint 0 个错误，`prettier --check`、构建通过 | 不出包。首屏截图用浏览器预览的示例数据在隐藏的 Electron 窗口里截取（浅色 / 深色，`docs/readme/`），截图前去掉了只属于浏览器预览的提示条；不含真实账户 | README 重写：首屏是一句话定位、示例数据截图（GitHub 按访问者的深浅色自动切换）、下载链接；新增「能做什么」；平台与工具表改用 T6.1 的验证等级（已实测 / 样例验证，与代码里 `verification.level` 一致；工具来源没有代码标签的，按原 README 的证据如实归类）；加入隐私摘要（链接 `docs/PRIVACY.md`）和「工具升级后照样能读」一段（T9.13–T9.15）；开发者入口移到后面，Electron 版本与测试基线改为当前值（原来写的是 44.4.4 与 350 项）。**顺带修正**：浏览器预览里写死的版本号 `1.8.0-beta.4` 改为读取 `package.json` 的版本（构建产物只带入版本号这一项）。 | 下一步 T9.8（英文 README）。 |

2026-10-23 之前的执行记录见归档快照第 6 节。

---

## 附：给执行模型的启动提示词（用户可直接复制）

> 请先完整阅读项目根目录的 `IMPROVEMENT_PLAN.md`，再读 `AGENTS.md` 和 `PROJECT_HANDOFF.md`。找到第 3 节中下一个未完成、且依赖和决策都已满足的任务，按第 0.2 节的流程执行。完成后更新第 6 节执行记录和任务复选框。遇到未拍板的决策、红线冲突或计划外的问题，停下来问我，不要自行决定。每次只做一个任务。
