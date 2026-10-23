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
6. 合并：`git merge --no-ff`，保证每个任务都能单独回滚。
7. 回到第 6 节「执行记录」追加一行：日期、任务 ID、commit、测试结果、证据等级、未完成项。
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
| D4 | 是否购买 Apple Developer 账号 | **暂不购买**。T3.5 跳过；Mac 继续使用 ad-hoc 签名、不做公证，因此 Keychain 升级弹框的风险继续存在（由 T3.4 兜底），Mac 也不做自动更新（Squirrel.Mac 要求正式签名）。<br>**2026-10-23 重新评估（D12 ⑧）**：用户同意按复盘推荐重新评估；是否购买由用户确认，注册和付费由用户完成，执行模型不代办。到位后启用 T3.5；在此之前仍按本条执行 | T3.5（跳过）、T3.4、T5.2 |
| D5 | 旧浏览器原型和 Sites 兼容文件 | **删除**。用户明确撤销 AGENTS.md 中「保留 `.openai/hosting.json`、`worker/index.js`、`scripts/prepare-sites-build.mjs`、`tests/sites-worker.test.mjs`」的要求，以及「保留原浏览器原型作为参考」的要求。 | T1.2、T1.4 |
| D6 | 仓库杂物 | **全部处理**：删除 `pelican-bike.html`、`a/` 目录及所有 `.DS_Store`；`docs/island-1.9.0-design-handoff.zip` 不纳入 git；`release-v*/` 移到 `~/Documents/TokenUsageAssistant-releases/`。 | T1.1、T1.2 |
| D7 | 账户核对页 | **改名为「覆盖范围报告」**，以展示各来源的覆盖缺口为主；`compareEvidence` 逻辑不变，差值区块只在 `available:true` 时出现。 | T6.2 |
| D8 | 更新检查渠道 | **另建一个公开仓库，只放安装包**（不放源码），应用通过它的 Releases 检查更新。仓库名已于 2026-10-15 确认：`junjunup/TokenUsageAssistant`（已创建，只含 README）。 | T2.3、T5.2 |
| D9 | 灵动岛待定事项 | ② 告警时整个耳区替换为告警内容<br>③ 用户未设置余额阈值前不发余额告警，首次启用时引导设置<br>④ 红优先于琥珀，同级时显示最快重置的账户<br>⑤ 悬停参数在真机调好后定值，不放进设置<br>⑥ 锁屏可见性只作为真机确认项，不再是设计议题<br>⑦ **收纳态是否常显耳区，在设置中由用户选择**（「常显」/「仅告警时」），默认值等 T7.1 实测遮挡情况后再请用户确认<br>**2026-10-18 调整（用户看完 T7.1 报告后决定）**：放弃耳区方案；收纳态改为菜单栏右侧本应用的状态栏图标，展开以「点菜单栏图标弹出面板」为主，刘海悬停下落面板作为以后可增添的特色。② ⑦ 随耳区作废；③ ④ ⑥ 的原则保留（④ 改为决定菜单栏图标显示哪个账户）；⑤ 只在做刘海悬停面板时适用。岛内是否加入歌曲、系统资源等内容，先记录为待调研方向，不进入当前任务 | T7.0、T7.1、岛首版 |
| D10 | 界面改动 | **所有界面改动都要先出截图或草图，用户确认后再实现**，包括：导出诊断按钮、「重新读取」按钮、更新提示、平台验证分级标签、说明文字折叠、覆盖范围报告页、岛设置项。 | T3.3、T3.4、T5.2、T6.x、T7.x |
| D11 | 开源（2026-10-18） | 开发仓库以 **MIT** 开源，改名为 `token-usage-assistant`；安装包仓库 `junjunup/TokenUsageAssistant` 保持不变（已发布客户端的检查更新依赖它）。历史中的 QQ 邮箱和截图不重写，只在新提交中清理（以后的提交用 GitHub noreply 邮箱）。源码仓库的 Release 随仓库公开，审核关口改为 Publish 演练。`package.json` 的 `name` 保持 `commandcode-companion`（Windows 数据目录取自它）。 | 仓库、发版流程 |
| D12 | 整体复盘后的方向（2026-10-23，[docs/REVIEW-2026-10.md](docs/REVIEW-2026-10.md) 的 Q1–Q8，用户全部按推荐） | ① Electron 为安全公告 GHSA-jr5w-w6x2-84p9 立即升到 44.9.x（≥ 44.9.1），为此破例「依赖发布满两周」的规则，作为 1.9.0-beta.3（Q1）<br>② Claude 用 computer use 在用户 Mac、真实账户上实测的结果计为 ③，统一标注「③（Claude 代测）」；需要用户亲自操作的项（改系统设置、输入密码、外接屏等）仍由用户做；验收清单头部规则相应修改（Q2）<br>③ 路线改为：稳固版 1.9.0-beta.3 + 文档与流程收口 → T6.1 → T6.2 / T6.3 → 先测量再定 T4.2 / T7.2；T7.2、增量一、增量二推迟，刘海悬停面板（A）搁置（Q3）<br>④ Harness 去留待用户告知所用版本（Q4，T8.13）<br>⑤ Claude 采集端口监听失败时自动换端口，更新配置与启动器，并提示重新打开 Claude Code 会话（Q5）<br>⑥ 仓库整理：删除已合并分支，移除 2 个 worktree，调研文档合并到 main，`.commandcode/taste/` 移出仓库并加入 `.gitignore`（历史不重写）（Q6）<br>⑦ 发布目录里的旧 `.app` 移到以 `.noindex` 结尾的子目录，不删除，DMG / ZIP 原样保留（Q7）<br>⑧ D4 重新评估（Q8，见 D4） | T8.1–T8.14、T6.x、T4.2、T7.2、T3.5 |

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
| 6 产品 | T6.1 平台验证分级标注 | 是（UI） | T5.3a | D10 | [ ] |
| 6 产品 | T6.2 核对页去留 | 是（UI） | — | D7、D10 | [ ] |
| 6 产品 | T6.3 说明文字渐进披露 | 是（UI） | — | D10 | [ ] |
| 7 灵动岛 | T7.2 实时尾随通道 | 是 | T4.2、T7.1 | D1 | [ ]（D12：推迟） |
| 7 灵动岛 | 之后 | 按 `docs/island-1.9.0-design/HANDOFF.md` §8：首版 → 增量一 → 增量二；刘海悬停面板（A）单独排期。**D12：增量一、增量二推迟，刘海悬停面板搁置** | | | |
| 8 稳固与收口 | T8.1 Electron 安全更新（44.9.x）与 Dependabot 告警 | 是 | — | D1、D12 | [x]（随 1.9.0-beta.3 发布） |
| 8 稳固与收口 | T8.2 偏好前向兼容与回滚说明 | 是 | — | D12 | [x]（随 1.9.0-beta.3 发布） |
| 8 稳固与收口 | T8.3 锁屏暂停的兜底恢复 | 是 | — | D12 | [x]（随 1.9.0-beta.3 发布） |
| 8 稳固与收口 | T8.4 Claude statusLine 额度改为结构校验 | 是 | — | D12 | [x]（随 1.9.0-beta.3 发布） |
| 8 稳固与收口 | T8.5 Claude 采集端口失败时自动换端口 | 是（提示文案走 D10） | — | D10、D12 | [x]（随 1.9.0-beta.3 发布） |
| 8 稳固与收口 | T8.6 检查更新识别开发包版本；账户加载记耗时 | 是 | — | D12 | [x]（随 1.9.0-beta.3 发布） |
| 8 稳固与收口 | T8.7 应用许可证与第三方声明随包 | 是（包内容） | — | D11、D12 | [ ] |
| 8 稳固与收口 | T8.8 1.9.0-beta.3 收尾与发版 | 是 | T8.1–T8.7、T8.10 | D3、D12 | [ ] |
| 8 稳固与收口 | T8.9 文档收口（复盘第 2 节、证据口径、补齐 beta.2 发版第 4–5 步、计划归档瘦身） | 否 | — | D12 | [x]（首次打开说明待用户实测后补改） |
| 8 稳固与收口 | T8.10 发版流程加固（辅助脚本、公开说明取自 CHANGELOG、CI 跑 Harness 运行时测试、smoke 失败留证据） | 否 | — | D12 | [ ] |
| 8 稳固与收口 | T8.11 仓库整理（分支、worktree、调研文档、偏好笔记、分支与标签保护） | 否 | — | D12 | [x] |
| 8 稳固与收口 | T8.12 发布目录旧 `.app` 移到 `.noindex` 子目录 | 否 | — | D12 | [x] |
| 8 稳固与收口 | T8.13 Harness 去留（待用户告知所用版本） | 视决定 | — | D12 | [ ] |
| 8 稳固与收口 | T8.14 测量 Claude 导出的读取耗时与文件大小（决定 T4.2 / T7.2） | 否 | — | D12 | [ ] |

**2026-10-23 起的执行顺序（D12，用户按复盘推荐确认）**：T8.9 → T8.11 → T8.12 → T8.1 → T8.2 → T8.3 → T8.4 → T8.5 → T8.6 → T8.7 → T8.10 → T8.8（发布 1.9.0-beta.3）→ T6.1 → T6.2 / T6.3 → T8.14 → 按测量结果再定 T4.2 / T7.2。T8.13 等用户告知 Harness 版本后插入。仍然每次只做一个任务；T8.9–T8.12 不改应用行为，可以在稳固版各任务之间穿插。

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

**候选（未排期，D12）**：Electron fuses 收紧（先关 `NODE_OPTIONS`、`--inspect`，M7）；「未启用」措辞统一与通知「<1%」（L2、L3，界面走 D10，可与 T6.3 合并）；临期倒计时（增量一中不依赖 T7.2 的部分）；Claude 推送式「正在运行」（第 4.4 节，需评估）。

---

## 5. 执行中发现的问题（执行模型追加）

| 日期 | 发现于任务 | 问题描述 | 建议 | 处理状态 |
|---|---|---|---|---|
| 2026-10-16 | T3.3 | 合并后 main 的 CI 中，Windows 上 `actual portable status-line component sends authenticated metadata to loopback without content` 失败：`listen EACCES: permission denied 127.0.0.1:49849`。这是 runner 绑定回环随机端口时被拒，与本次改动无关；同一代码在标签的 CI 和分支 CI 中都通过，重跑失败作业后也通过。 | 没有放宽测试。如果再次出现，再考虑让该测试改用系统分配的端口（监听 0 号端口）。**2026-10-23 更新（整体复盘 M1）**：之后又出现 2 次且当时没有记录——`38875528400`（main@`b4b5ae0`，`listen EACCES 127.0.0.1:49827`）与 `39808290317`（main@`237987f`，即 v1.9.0-beta.2 的标签提交，`EACCES 127.0.0.1:49835`；执行模型推送后没等这次 CI 就打了标签，同一提交的标签 CI `39808544844` 通过）。三次都落在 49827–49849，符合 Windows 保留端口段的特征；端口是产品代码选的（`claude-collector.cjs` 一次随机、永久保存、失败不换），真实 Windows 机器上可能永久不可用。 | 已处理（T8.5，2026-10-23） |
| 2026-10-16 | T5.1 | Claude 的 statusLine 额度（`receiveQuota`）同样只接受 2.1.251+ 的 2.1.x。计划只点名了 Codex rollout 和 Claude OTLP，所以这次没有改；Claude 一升级，订阅额度就会停止更新。 | 建议另开小任务：把 statusLine 额度也改为结构校验（`normalizeClaude` 已经验证窗口结构），未验证版本在账户状态中提示。 | 已处理（T8.4，2026-10-23） |
| 2026-10-16 | T5.3a | **Windows 打包 smoke 偶发超时**：分支 Release 试跑 `38888202087` 中，`subscription-native-smoke` 启动 PowerShell 运行 Claude 状态栏脚本，6 秒内没有结束（`statusline timeout`），重跑失败作业后同样失败。对照：同一时间 main（不含 T5.3a）的试跑 `38890784846` 通过；在 T5.3a 代码上只加了计时的调试分支 `38891628294` 也通过（smoke 用时 39 s）；T5.3a 分支再跑一次 `38892710298` 通过。Mac 的 smoke 用时在各次运行中都一样（约 11 s）。T5.3a 没有改动状态栏脚本或这段 smoke。 | 判断为 runner 上 PowerShell 冷启动加上首次调用 `Invoke-RestMethod` 偶尔超过 6 秒的环境问题（代码相同，有时过、有时不过），不是 T5.3a 引入的；中途一度根据一次对照怀疑是 T5.3a，之后的两次运行推翻了这个判断。**没有放宽超时**。如果再出现，建议在 smoke 报告中记录 PowerShell 启动到退出的耗时，再决定是否单独处理。用户问及是否与本机休眠有关：无关，这一步运行在 GitHub 的 Windows runner 上。调试分支 `debug/t53a-win-timing` 已删除。 | 待观察 |
| 2026-10-18 | T7.5 | 本机 Mac 测试包首次运行 `Verify-Mac-Native.command` 时，原生 smoke 150 秒未退出被终止；立即重跑，6 项门禁全部通过。按 AGENTS §9，新签名的打包版 smoke 首次运行可能弹出一次 smoke 条目的 Keychain 授权窗，很可能是这个原因，但执行模型没有看到窗口，**未确认**。CI 上同一代码的 Mac 原生 smoke 约 10 秒通过。 | 记录；如再出现，运行时截图确认是否为 Keychain 授权窗。 | 待观察 |
| 2026-10-18 | T7.7 | 本机新构建的打包版首次运行 `Verify-Mac-Native.command`，原生 smoke 再次 150 秒未退出（第二次出现，见 T7.5 那条）；立即重跑全部通过，smoke 约 15 秒结束。重跑时每 5 秒检查屏幕窗口，没有看到 SecurityAgent / 钥匙串授权窗；首次运行的日志随验证脚本的临时目录一起被删，无法回看。T7.6 的首次验证没有出现。 | 下次出现时先保留临时目录（例如给验证脚本加「失败时保留 smoke 目录」的开关）再查；原因未确认，不要写成 Keychain 授权窗。 | 待观察 |

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

2026-10-23 之前的执行记录见归档快照第 6 节。

---

## 附：给执行模型的启动提示词（用户可直接复制）

> 请先完整阅读项目根目录的 `IMPROVEMENT_PLAN.md`，再读 `AGENTS.md` 和 `PROJECT_HANDOFF.md`。找到第 3 节中下一个未完成、且依赖和决策都已满足的任务，按第 0.2 节的流程执行。完成后更新第 6 节执行记录和任务复选框。遇到未拍板的决策、红线冲突或计划外的问题，停下来问我，不要自行决定。每次只做一个任务。
