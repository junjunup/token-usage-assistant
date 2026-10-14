# Token 用量助手 · 改进计划（2026-10）

> 基线版本：1.8.0-beta.5（Mac 本机构建 `.app` + DMG，Windows 双包在旧机器上）
> 来源：2026-10-14 的项目审查（覆盖 PROJECT_HANDOFF.md、docs/island-1.9.0-design/HANDOFF.md、AGENTS.md、README.md、`desktop/` 全部核心模块、前端入口与部分测试）
> 用途：交给执行模型按任务逐项实施。每个任务都写明了目标、背景、步骤、验收标准和禁止事项。

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

## 1. 决策清单（用户已于 2026-10-15 拍板）

以下决策已由用户确认，执行时直接遵循。本文与 AGENTS.md 冲突时，以本节为准。

| ID | 议题 | 用户决定 | 影响的任务 |
|---|---|---|---|
| D1 | CI 就绪前的交付规则 | **过渡方案**：<br>• 不改变应用行为的任务（阶段 1–2、纯重构）不出包。<br>• 改变行为的任务在本机出 Mac 包（DMG + ZIP），Windows 双包在执行记录中明确标「待 CI 补齐」，不得写成已交付。<br>• T2.3 完成后，三种包统一由 CI 产出。 | T3.x 起所有改行为的任务 |
| D2 | 是否建 GitHub 仓库做 CI | **建私有仓库**（只放源码） | T2.1–T2.4 |
| D3 | 版本号策略 | 阶段 1–2 不升版本。之后每个阶段出一个测试版：阶段 3 = 1.8.0-beta.6，阶段 4 = beta.7，阶段 5 = beta.8，阶段 6 = beta.9。1.9.0 留给灵动岛。版本号只在阶段的最后一个任务合并时修改。 | 阶段 3 起的打包 |
| D4 | 是否购买 Apple Developer 账号 | **暂不购买**。T3.5 跳过；Mac 继续使用 ad-hoc 签名、不做公证，因此 Keychain 升级弹框的风险继续存在（由 T3.4 兜底），Mac 也不做自动更新（Squirrel.Mac 要求正式签名）。 | T3.5（跳过）、T3.4、T5.2 |
| D5 | 旧浏览器原型和 Sites 兼容文件 | **删除**。用户明确撤销 AGENTS.md 中「保留 `.openai/hosting.json`、`worker/index.js`、`scripts/prepare-sites-build.mjs`、`tests/sites-worker.test.mjs`」的要求，以及「保留原浏览器原型作为参考」的要求。 | T1.2、T1.4 |
| D6 | 仓库杂物 | **全部处理**：删除 `pelican-bike.html`、`a/` 目录及所有 `.DS_Store`；`docs/island-1.9.0-design-handoff.zip` 不纳入 git；`release-v*/` 移到 `~/Documents/TokenUsageAssistant-releases/`。 | T1.1、T1.2 |
| D7 | 账户核对页 | **改名为「覆盖范围报告」**，以展示各来源的覆盖缺口为主；`compareEvidence` 逻辑不变，差值区块只在 `available:true` 时出现。 | T6.2 |
| D8 | 更新检查渠道 | **另建一个公开仓库，只放安装包**（不放源码），应用通过它的 Releases 检查更新。仓库名在执行 T2.3 或 T5.2 时向用户确认。 | T2.3、T5.2 |
| D9 | 灵动岛待定事项 | ② 告警时整个耳区替换为告警内容<br>③ 用户未设置余额阈值前不发余额告警，首次启用时引导设置<br>④ 红优先于琥珀，同级时显示最快重置的账户<br>⑤ 悬停参数在真机调好后定值，不放进设置<br>⑥ 锁屏可见性只作为真机确认项，不再是设计议题<br>⑦ **收纳态是否常显耳区，在设置中由用户选择**（「常显」/「仅告警时」），默认值等 T7.1 实测遮挡情况后再请用户确认 | T7.0、T7.1、岛首版 |
| D10 | 界面改动 | **所有界面改动都要先出截图或草图，用户确认后再实现**，包括：导出诊断按钮、「重新读取」按钮、更新提示、平台验证分级标签、说明文字折叠、覆盖范围报告页、岛设置项。 | T3.3、T3.4、T5.2、T6.x、T7.x |

**界面方案确认流程（D10）**：执行模型先在浏览器预览模式（`pnpm run dev`，使用 `previewBridge` 预览数据）中实现方案，截取浅色和深色两张图，连同文案一起交给用户。用户确认后才能合并。未确认的界面改动不得合并到 main。

---

## 2. 审查结论摘要（为什么要做这些）

| 问题 | 证据 | 对应任务 |
|---|---|---|
| 没有 Git，没有 CI | 根目录无 `.git`；版本靠 `release-v*` 和 `docs/verification-*` 管理；7 份几乎相同的 `scripts/verify-upgrade-*-native.cjs` | T1.1、T2.x |
| 交付规则和现状脱节 | 本机 `release-v1.8.0-beta.5/` 里只有 Mac 产物，没有 Windows EXE | D1、T2.3 |
| 代码几乎无法审阅 | `main.cjs` 166 行 29 KB，最长一行 3615 字符；`DesktopApp.jsx` 平均每行 300 字符；`AnalyticsPage.jsx` 平均每行 403 字符 | T1.3 |
| 没有日志 | `desktop/` 和 `src/` 中 0 处 `console.*`；56 处 `catch{`，其中 16 处完全为空；IPC 错误统一返回「操作未完成」（`main.cjs:75`） | T3.2、T3.3 |
| Mac 开发版直接用真实用户数据 | `main.cjs:23` 没有区分是否打包，开发版和打包版共用 userData 和 Keychain 条目 | T3.1 |
| ad-hoc 签名下 Keychain 授权风险 | 每次构建签名不同 → 可能弹框；用户点了拒绝就进入「账户列表不可用」，只能重启 | T3.4、T3.5 |
| 工具分析每次查询都全量重扫 | `tool-sources.cjs:67` 同一时间只允许一个 worker，新查询会取消旧查询；Claude 的 jsonl 每次从头读（`claude-collector.cjs:347`）；Codex 每次遍历全部 rollout 文件 | T4.2、T4.3、T7.2 |
| 写入放大 | `history.cjs` 每次轮询在主线程同步重写整个 history.json（最多 1.6 万条） | T4.1 |
| 上游版本白名单过窄 | Codex 只认 `/^0\.155\./`（`codex-reader.cjs:207`）；Claude 只认 ≥2.1.251 的 2.1.x | T5.1 |
| 没有更新渠道 | 安装包靠微信传 | T5.2 |
| 平台逻辑分散 | 新增一个平台需要改 `providers.cjs`、`provider-catalog.cjs`、`main.cjs:124-134`、`accounts.cjs`、`tool-worker.cjs:121`、`tool-sources.cjs`、前端等 6–8 处 | T5.3 |
| smoke 代码混在主流程里 | `main.cjs:138` 的 `finishSmoke` 写在一行；12 个 fixture/smoke 文件打进正式包 | T5.4 |
| 轮询开销 | 唤醒时 20 个账户同时请求；Codex 每轮都启动一次 `codex app-server` 子进程；锁屏期间照常轮询 | T4.4 |
| 前端每秒整树重渲染 | `DesktopApp.jsx` 中 `setInterval(()=>setNow(Date.now()),1000)` | T4.5 |
| 文档只追加、不更新 | README 标题仍是「Windows 1.4.1」；PROJECT_HANDOFF 写着 `D:\Projects`；AGENTS.md 结尾仍是「browser prototype with mock data」 | T1.4 |
| 灵动岛设计稿有数值和红线冲突 | 108 ≠ 100 + 16；耳宽对不上；③ 的「$50 等值」需要换汇；收纳态会遮住菜单栏 | T7.0 |

---

## 3. 任务总览

| 阶段 | 任务 | 改变应用行为？ | 依赖 | 决策 | 状态 |
|---|---|---|---|---|---|
| 1 工程底座 | T1.1 初始化 Git 与基线快照 | 否 | — | — | [x] |
| | T1.2 清理仓库杂物 | 否 | T1.1 | D5、D6 | [x] |
| | T1.3 Prettier + ESLint，一次性格式化 | 否 | T1.1 | — | [ ] |
| | T1.4 文档重构 | 否 | T1.1 | D5 | [ ] |
| 2 CI | T2.1 推送到私有仓库 | 否 | T1.1 | D2 | [ ] |
| | T2.2 CI 测试流水线（Win + Mac） | 否 | T2.1、T1.3 | — | [ ] |
| | T2.3 CI 打包 + 原生 smoke + 完整性记录 | 否 | T2.2 | — | [ ] |
| | T2.4 合并升级验证脚本 | 否 | T2.3 | — | [ ] |
| | T2.5 版本号单一来源 | 否 | T1.1 | — | [ ] |
| 3 可观测性与 Mac | T3.1 Mac 开发版数据隔离 | 是（仅 Mac 开发版） | T1.3 | D1 | [ ] |
| | T3.2 本地日志模块 | 是 | T1.3 | D1 | [ ] |
| | T3.3 导出诊断信息 | 是（UI） | T3.2 | D1、D10 | [ ] |
| | T3.4 凭据读取失败可重试 + Mac 验收清单 | 是 | T3.2 | D1 | [ ] |
| | ~~T3.5 Developer ID 签名与公证~~ | — | — | D4 = 暂不购买 | 跳过 |
| 4 存储与性能 | T4.0 性能基线测量 | 否 | T3.2 | — | [ ] |
| | T4.1 历史记录迁入 SQLite | 是 | T4.0 | D1 | [ ] |
| | T4.2 Claude 导出增量读取 | 是 | T4.0 | D1 | [ ] |
| | T4.3 Codex 扫描优化（视测量结果决定） | 是 | T4.0 | D1 | [ ] |
| | T4.4 轮询调度优化 | 是 | T3.2 | D1 | [ ] |
| | T4.5 前端每秒重渲染修复 | 否（视觉不变） | T1.3 | — | [ ] |
| | T4.6 原子写入加固 | 是（更稳健） | T1.3 | D1 | [ ] |
| 5 架构 | T5.1 上游版本校验改为结构校验 | 是 | T3.2 | D1 | [ ] |
| | T5.2 检查更新 | 是 | T2.3 | D8、D10 | [ ] |
| | T5.3a 平台注册表重构 | 否 | T2.2 | — | [ ] |
| | T5.3b 工具来源注册表重构 | 否 | T5.3a | — | [ ] |
| | T5.4 smoke 代码从主流程拆出 | 否 | T1.3 | — | [ ] |
| | T5.5 领域模块类型检查 | 否 | T2.2 | — | [ ] |
| 6 产品 | T6.1 平台验证分级标注 | 是（UI） | T5.3a | D10 | [ ] |
| | T6.2 核对页去留 | 是（UI） | — | D7、D10 | [ ] |
| | T6.3 说明文字渐进披露 | 是（UI） | — | D10 | [ ] |
| 7 灵动岛 | T7.0 修订岛设计文档 | 否 | — | D9 | [ ] |
| | T7.1 岛 POC（开发开关，不随包发布） | 否（不发布） | T7.0、T3.2 | D9 | [ ] |
| | T7.2 实时尾随通道 | 是 | T4.2、T7.1 | D1 | [ ] |
| | 之后 | 按 `docs/island-1.9.0-design/HANDOFF.md` §8：首版 → 增量一 → 增量二 | | | |

推荐执行顺序：T1.1 → T1.2 → T1.3 → T1.4 → T2.1–T2.5 → T3.1 → T3.2 → T3.4 → T3.3 → T4.0 → T4.1 → T4.5 → T4.6 → T4.4 → T4.2 → T5.1 → T5.4 → T5.3a/b → T5.5 → T5.2 → T7.0 → T7.1 → T7.2 → T6.x。

T7.0 只是改文档，可以随时插队。

**版本与出包节点（D1 + D3）**

| 阶段 | 版本 | 什么时候出包 |
|---|---|---|
| 阶段 1–2 | 保持 1.8.0-beta.5 | 不出包 |
| 阶段 3 | 1.8.0-beta.6 | 阶段内最后一个任务合并时，升版本、打标签、由 CI 出三种包 |
| 阶段 4 | 1.8.0-beta.7 | 同上 |
| 阶段 5 | 1.8.0-beta.8 | 同上 |
| 阶段 6 | 1.8.0-beta.9 | 同上 |
| 灵动岛 | 1.9.0 线 | 按岛的 HANDOFF 分阶段出包 |

阶段中间的任务按 D1 处理：改变行为时在本机出 Mac 包供用户试用，但不升版本号。这类包的文件名加后缀 `-dev.<短 commit>`，避免和正式 beta 混淆。

---

## 4. 任务详情

### 阶段 1 · 工程底座（不改变应用行为，不出包）

#### T1.1 初始化 Git 与基线快照

**目标**：把 1.8.0-beta.5 的源码原样纳入版本控制，作为此后所有改动的回滚点。

**步骤**

1. 在 `git init` 之前，先写好 `.gitignore`：
   ```
   node_modules/
   dist/
   release-*/
   work/
   .DS_Store
   *.log
   /a/
   src/generated/
   docs/island-1.9.0-design-handoff.zip
   ```
   `src/generated/` 由 `scripts/prepare-analytics-preview.mjs` 在 dev/build 时生成。忽略之前先确认没有测试直接 import 它：`grep -rn "src/generated" tests scripts`。如果有测试依赖它，就不要忽略，并在执行记录里写明原因。
2. `git init -b main`，然后 `git add -A`。
3. **提交前做秘密扫描**（必须）：
   ```bash
   git grep -nIE '(sk-[A-Za-z0-9]{20,}|Bearer [A-Za-z0-9._-]{20,}|AKLT[A-Za-z0-9]{16,}|"apiKey"\s*:\s*"[^"]{8,})' -- . ':!pnpm-lock.yaml'
   git ls-files | grep -iE 'credential|accounts\.encrypted|\.sqlite$|\.db$|usage\.jsonl$'
   ```
   任何疑似真实凭据或真实用户数据都要先停下来问用户。测试用的假密钥（例如 `local-smoke-secret-only`）可以保留。
4. 提交：`chore: baseline 1.8.0-beta.5 snapshot`，打标签 `v1.8.0-beta.5`。

**验收**：`git status` 干净；`git ls-files | wc -l` 记入执行记录；秘密扫描结果记入执行记录；`pnpm run test:desktop` 仍为 249 通过。

**禁止**：这一步不删除、不移动任何文件（删除和移动属于 T1.2）。

#### T1.2 清理仓库杂物（D5 = 删除，D6 = 全部处理）

**步骤**

1. 删除 `pelican-bike.html`、`a/`，以及所有 `.DS_Store`。
2. 把 `release-v*/` 移到 `~/Documents/TokenUsageAssistant-releases/`（这是移动，不是删除；移动后核对文件数和总大小）。再用 `grep -rn "release-v" scripts docs/*.md AGENTS.md README.md PROJECT_HANDOFF.md` 找出所有硬编码的发布路径并列出来（修正放在 T2.5）。
3. `docs/island-1.9.0-design-handoff.zip` 已在 T1.1 的 `.gitignore` 中排除，磁盘上的文件保留不动。
4. 删除原型（D5）：
   - 删除 `src/App.jsx`、`src/desktop-preview.js` 中仅供原型使用的部分（先确认 `DesktopApp.jsx` 的浏览器预览模式 `previewBridge` 是否还要用：`pnpm run dev` 的浏览器预览依赖它，**它不属于旧原型，保留**）、`worker/`、`.openai/`、`scripts/prepare-sites-build.mjs`、`tests/sites-worker.test.mjs`；
   - 去掉 `package.json` 里的 `test:sites`，以及 `build` 脚本末尾的 `prepare-sites-build`；
   - 删掉 `src/main.jsx` 里的 `legacy-prototype` 分支；
   - 同时删掉 `src/App.jsx` 专用的样式（先确认 `styles.css` 里的哪些规则只被 `App.jsx` 使用；拿不准的就保留）。
5. `docs/` 下根目录级的过程性文档（`DEVELOPMENT_READY.md`、`design-qa.md`、`desktop-verification.md`）放到 T1.4 统一处理，这里不动。

**验收**：`pnpm run test:desktop` 通过数不变；`pnpm run build` 成功；`pnpm run desktop` 能正常启动并显示主窗口和悬浮窗。删掉 sites 测试后，测试总数的变化要在执行记录里说明。

#### T1.3 Prettier + ESLint，一次性格式化

**目标**：把超长单行代码格式化成可审阅的形式，**语义零变化**。

**步骤**

1. 添加开发依赖：`prettier`、`eslint`、`@eslint/js`、`eslint-plugin-react-hooks`、`globals`（选用至少发布两周以上的确定版本，写死版本号）。国内网络慢的话可以临时使用 npmmirror。
2. `.prettierrc`：`{"printWidth":120,"singleQuote":true,"trailingComma":"all","semi":true}`
3. `.prettierignore`：`dist/`、`release-*/`、`src/generated/`、`pnpm-lock.yaml`、`docs/`、`*.md`、**`integrations/deepseek-harness/`**。最后这一项需要先确认 `upstream-contract.json` 或 harness 测试有没有校验 `exporter.js` 的哈希：`grep -rn "sha256\|integrity\|hash" integrations/deepseek-harness tests/harness-plugin.test.cjs`。如果没有哈希校验，可以去掉这项忽略。
4. `eslint.config.js`（flat config）：
   - `desktop/**/*.cjs`、`scripts/**`、`tests/**`：Node 环境，`sourceType: commonjs`；
   - `src/**`：浏览器环境 + JSX + `react-hooks` 规则；
   - 规则：`js.configs.recommended`，其中 `no-empty` 和 `no-unused-vars` 降为 warn。**本任务不修任何 lint 问题**，只记录警告数作为基线。
5. 格式化之前先建立比对基线：
   ```bash
   pnpm run build && (cd dist/client && find . -type f -exec shasum -a 256 {} \; | sort -k2) > /tmp/dist-before.txt
   pnpm run test:desktop 2>&1 | tail -10 > /tmp/test-before.txt
   ```
6. 执行 `pnpm exec prettier --write .`
7. 比对：
   - 重新 build，生成 `/tmp/dist-after.txt` 并 diff。期望**完全一致**（Vite 压缩会抹平空白差异）。不一致的话，逐个比对压缩后的 JS，确认只有无意义差异，并把结论写进执行记录。
   - `for f in desktop/*.cjs; do node --check "$f"; done`
   - `pnpm run test:desktop` 通过数不变。
   - 在 Mac 上跑一次原生 smoke：`pnpm exec electron . --smoke-test --test-directory="$(mktemp -d)"`，然后检查该目录下 `smoke-result.json` 中 `ok:true`。
8. 添加 `package.json` 脚本：`"format": "prettier --write ."`、`"format:check": "prettier --check ."`、`"lint": "eslint ."`
9. 提交：先提交配置（`chore: add prettier/eslint config`），再单独提交格式化（`style: format codebase (no semantic change)`）。然后把格式化那个提交的 hash 写入 `.git-blame-ignore-revs`，再提交一次。

**验收**：dist 产物哈希一致（或有书面解释）；测试数不变；smoke 结果 ok；ESLint 警告数记入执行记录。

**禁止**：不改任何逻辑、命名或文件结构；格式化之后发现的 bug 写进第 5 节，不在本任务里修。

#### T1.4 文档重构（合并前请用户过目）

**目标**：让 AGENTS.md 只保留当前有效的长期规则；历史记录归档；README 和 HANDOFF 反映当前状态。这一步对后续执行模型非常重要：现在的 AGENTS.md 里有互相矛盾的指令。

**步骤**

1. 归档（内容原样搬过去，一个字都不改）：
   - `AGENTS.md` → `docs/history/AGENTS-through-1.8.0-beta.5.md`
   - `PROJECT_HANDOFF.md` → `docs/history/PROJECT_HANDOFF-through-1.8.0-beta.5.md`
   - `README.md` → `docs/history/README-through-1.8.0-beta.5.md`
   - `DEVELOPMENT_READY.md`、`design-qa.md`、`desktop-verification.md` → `docs/history/`
2. 新建 `docs/history/AGENTS-migration.md`：把旧 AGENTS.md 中**每一条** must / never / do not / 保留 / 不得 类的规则逐条列成表，分成三类：「保留至新 AGENTS.md」「合并为某条」「已过时（附理由）」。
3. 新写 `AGENTS.md`，150 行以内，结构如下：
   - 项目一句话说明 + 当前版本 + 当前改进计划（指向本文件）
   - 读取顺序
   - 数据语义红线（见 0.3）
   - 隐私与只读红线
   - 平台与存储不变量（appId、executableName、userData，Windows DPAPI / Mac Keychain，旧迁移文件保留）
   - 各平台/工具的固定契约要点（每条 1–2 行，详情链接到专题文档）：Command Code、GLM、MiniMax、火山、DeepSeek、OpenCode Go、Codex（只读 app-server 方法白名单）、Claude（statusLine + OTLP 本地组件）、Zcode / OpenCode / Harness / Codex rollout / Claude 导出
   - 交付与验证规则：按 D1 写过渡期规则，按 D3 写版本节奏，并注明 D4（不做签名公证）带来的 Mac 限制
   - 旧 AGENTS.md 中保留 Sites 文件和浏览器原型的要求，已按 D5 撤销，迁移表中标为「已过时（D5，用户 2026-10-15 撤销）」
   - UI 变更规则（已批准的 Logo 和 UI，先出方案再改）
   - 测试规则（证据三级；不做 soak；`--smoke-test` 必须配隔离目录）
4. 新建 `CHANGELOG.md`：整理 README 的横幅和 PROJECT_HANDOFF 的历次条目，倒序排列，每个版本 3–6 行。
5. 新写 `README.md`：产品简介、支持的平台与工具（附验证等级）、安装方法（Win/Mac）、开发命令（Mac + Win）、数据口径摘要、文档索引。
6. 新写 `PROJECT_HANDOFF.md`（只写当前状态快照）：
   - 当前版本，以及各能力的证据等级表
   - 模块结构表（补上 `platform.cjs`、`branding.cjs`、`opencode-reader.cjs`、`subscriptions.cjs`、`codex-*`、`claude-*`、`associations*`）
   - 存储文件清单
   - 未完成的验收项
   - 链接到本计划和灵动岛 HANDOFF
7. 在 `docs/island-1.9.0-design/HANDOFF.md` 顶部加一行，链接到新的 PROJECT_HANDOFF.md 和本计划。

**验收**：
- 迁移表覆盖旧 AGENTS.md 的每条规则；新 AGENTS.md 不超过 150 行；
- 新文档中没有「D:\Projects」「release-v1.4.1」「browser prototype」这类过时表述（用 grep 检查）；
- **「已过时」那一列必须由用户逐条确认后才能合并到 main。**

---

### 阶段 2 · CI 与交付自动化（需要 D2）

#### T2.1 推送到私有仓库

用户在 GitHub 建好私有仓库并提供地址后：`git remote add origin …`，`git push -u origin main --tags`。

**禁止**：仓库设为公开；推送 `release-*` 或任何用户数据。

#### T2.2 CI 测试流水线

新建 `.github/workflows/ci.yml`，在 push 和 PR 时触发。

- 平台矩阵：`windows-latest`、`macos-14`（arm64）
- 步骤：
  1. checkout
  2. `pnpm/action-setup`（版本 11.19.0）
  3. `actions/setup-node`（24.12.0，开启 pnpm 缓存）
  4. `pnpm install --frozen-lockfile`
  5. `pnpm run format:check`
  6. `pnpm run lint`（警告不让构建失败，错误要失败）
  7. `pnpm run test:desktop`
  8. `pnpm run build`
- CI 运行在境外网络，**不要**设置 npmmirror 镜像。
- 测试输出里如果有「跳过」（例如 Harness 运行时没装导致的跳过），要在 job summary 中明确列出，不能算作通过。

**验收**：两个平台都是绿色；job summary 里有测试数。

#### T2.3 CI 打包 + 原生 smoke + 完整性记录

新建 `.github/workflows/release.yml`，在推送 `v*` 标签或手动触发时运行。

- **Windows job**：
  - `pnpm exec electron-builder --win --x64 --config.electronDist=node_modules/electron/dist --config.directories.output=release-out`
  - 对 Portable EXE 执行 `--smoke-test --test-directory=<runner 临时目录>`，读取 `smoke-result.json`，要求 `ok:true`
  - 复用并泛化 `scripts/verify-package-beta5.cjs`，改为从 package.json 读取版本号，生成 `package-integrity.json`（记录包内版本 = package.json 版本，以及 ASAR 哈希）
- **Mac job**：
  - `pnpm run package:mac -- --config.directories.output=release-out`
  - 运行 `scripts/Verify-Mac-Native.command` 的等价步骤：`codesign --verify --deep --strict`、打包后原生 smoke、`spctl` 结果如实记录（未公证时预期为 rejected，不算失败）
  - 生成 `mac-app-integrity.json`
- 上传产物：Setup EXE、Portable EXE、DMG、ZIP、各完整性 JSON、`smoke-result.json`。打标签触发时，在私有仓库中创建一个 draft Release。
- **公开发布（D8）**：再加一个手动触发的 `publish` job，把同一批安装包，加上一份 `SHA256SUMS.txt` 和简短的版本说明，发布到用户指定的**公开安装包仓库**的 Releases。
  - 使用一个只对该公开仓库有 `contents:write` 权限的 fine-grained token，作为 secret `PUBLIC_RELEASE_TOKEN` 存放。
  - 只上传安装包和校验文件，**不上传源码、完整性 JSON 中的本机路径、smoke 报告**。
  - 只有用户手动触发才发布，不在推送标签时自动公开。
  - 开始前先向用户确认公开仓库的名称。
- 在 `docs/RELEASING.md` 写明：
  - 本地发版流程 = 打标签 → 等 CI → 下载产物 → 把完整性 JSON 放进 `docs/verification-<版本>/`
  - CI 的 smoke 属于证据等级 ②，不代表真实账户或真机验收

**风险**：GitHub 的 Windows 和 macOS runner 都有图形会话，但托盘和通知的表现可能和真机不一样。smoke 如果因为 runner 环境失败，先记录具体是哪个检查项失败，**不要为了让 CI 变绿而放宽 smoke 断言**。可以改为在报告里标注「CI 环境不支持该项」并给出依据。

**验收**：一次手动触发能拿到全部 4 个安装包；两个平台的 smoke 都是 `ok:true`；完整性 JSON 中的版本号一致。

#### T2.4 合并升级验证脚本

1. diff 7 份 `scripts/verify-upgrade*-native.cjs`，把共同部分提取为 `scripts/verify-upgrade.cjs --from-asar <path> --to-asar <path> [--profile <name>]`。各版本特有的检查放进 `scripts/upgrade-profiles/<from>-to-<to>.cjs`。
2. 在 CI 的 Windows job 中，用上一个发布版本（从上一个 Release 下载）→ 当前版本跑一次 DPAPI 升级验证。
3. 删除旧脚本（git 历史里还在）。

**验收**：新脚本对 1.8.0-beta.2 → beta.5（或现有最近一对版本）执行的检查项数，与旧脚本一致，并全部通过。

#### T2.5 版本号单一来源

把硬编码的版本号改为从 `package.json` 读取，或通过命令行参数传入：

- `electron-builder.yml` 中的 `directories.output: release-v1.8.0-beta.5`
- `scripts/Build-Mac-App.command` 最后的 echo
- `scripts/deliver-opencode-beta5.py`：泛化为 `scripts/deliver.py`；如果 T2.3 已经覆盖了它的职责，就直接删除
- `scripts/verify-package-beta5.cjs` 和 `verify-opencode-package-beta5.ps1`：同上处理

**验收**：`grep -rn "beta\.5\|beta5" scripts electron-builder.yml package.json` 只剩历史文档中的引用。

---

### 阶段 3 · 可观测性与 Mac 可靠性

#### T3.1 Mac 开发版数据隔离

**背景**：`main.cjs:23` 的 `if(isMac){app.setName('TokenUsageAssistant');app.setPath('userData',…'TokenUsageAssistant')}` 没有区分是否打包。结果是 `pnpm run desktop` 直接读写真实账户数据，并且和打包版共用 Keychain 中的 Safe Storage 条目，来回切换就会触发授权弹框。

**步骤**

1. 在 `platform.cjs` 中新增并导出 `macDataName(isPackaged)`：打包版返回 `'TokenUsageAssistant'`，开发版返回 `'TokenUsageAssistant-Dev'`。
2. `main.cjs` 的 Mac 分支改为使用这个函数。smoke 模式的覆盖逻辑保持原样（它在之后执行，会覆盖 userData）。
3. **Windows 分支不改**：Windows 开发版的 userData 本来就按 package.json 的 `name` 和打包版分开。
4. 在 `tests/platform.test.cjs` 中补上 `macDataName` 的单元测试。
5. 在 README 的开发说明里写明：Mac 开发版使用独立的数据目录，需要重新连接测试账户。

**验收**：
- 单元测试通过；
- 在 Mac 上 `pnpm run desktop` 之后，`~/Library/Application Support/TokenUsageAssistant/` 下任何文件的 mtime 都没有变化（运行前后各 `ls -lT` 一次比对）；
- Keychain 访问中出现的条目名（用 `security find-generic-password -s "<名称>"` 检查）如实记入执行记录。**不要事先假设条目名称**。

#### T3.2 本地日志模块

**目标**：出了问题可以诊断，同时不泄露任何隐私。

**设计**

- 新建 `desktop/logger.cjs`，写入 `<userData>/logs/app.log`（JSON Lines 格式），单文件 1 MB 时轮转，保留 3 份。写入采用异步追加并带缓冲，退出时 flush。
- API：`log.error(module, code, extra?)`、`log.warn(…)`、`log.info(…)`
- `extra` 只接受白名单字段：`stage`、`status`、`errno`（如 `ENOENT`）、`provider`（平台 ID）、`kind`（工具来源类型）、`durationMs`、`exitCode`、`count`、`version`（第三方工具版本号）。**不在白名单里的字段一律丢弃。**
- **不记录**：任何错误对象的 `message` 或 `stack`（可能含路径、URL、上游返回内容）、请求 URL 的查询参数、请求头和请求体、stderr、文件完整路径（需要时只记录 `path.extname` 或固定标签）、账户 label、密钥。
- 兜底防线：对所有字符串值做一次正则脱敏，命中 `sk-`、`Bearer`、32 位以上的 hex/base64 时替换为 `[redacted]`。
- 写日志本身失败时静默忽略，绝不影响主流程。

**接入点**（只增加 log 调用，不改变原有行为）

- `main.cjs` 的 `handle()` catch：记录 channel 名和错误分类（`ApiError.status/code`，或 `publicMessage` 是否存在），不记录 message
- `monitor.cjs` 的 `refresh` 失败和 `receive` 中的错误：记录 provider、status、code
- `providers.cjs` / `api.cjs` 的请求失败：记录 endpoint 种类、status、code 和耗时
- `codex-rpc.cjs`：记录 stage、错误 code、退出码和耗时
- `tool-sources.cjs` / `tool-worker.cjs`：每个来源的 kind、status、扫描行数和耗时
- `store.cjs` 写入失败、`claude-collector.cjs` 启动失败、启动阶段的 catch（`main.cjs:162`）
- 16 处空 `catch{}`：凡是吞掉了「操作失败」的地方都补上 `log.warn`。正常的探测性 catch（例如 ENOENT 时判断文件不存在）可以保持不变，但要在代码里加注释说明原因。

**测试**

- 新增 `tests/logger.test.cjs`，覆盖：白名单过滤、脱敏、轮转、写入失败不抛出异常。
- 端到端检查：用 fixture 制造一次连接失败，然后 `grep -r "<测试密钥>" logs/` 结果应为空。

**验收**：测试通过；smoke 后 `logs/app.log` 存在且每行都是合法 JSON；秘密扫描无命中。

#### T3.3 导出诊断信息（界面需按 D10 先确认方案）

- 在设置页加一个「导出诊断信息」入口，使用现有按钮样式，不引入新的视觉元素。**按 D10 流程，先给用户看入口位置、预览界面和文案的截图（浅色和深色），确认后再合并。**
- 生成一份 JSON：
  - 应用版本、平台、架构、Electron 版本、系统版本
  - 非敏感设置项
  - 每个账户的 `{provider, region, status, 最近成功时间, 最近错误 code}`（**不含 label**）
  - 每个工具来源的 `{kind, status, lastSuccessAt, 扫描行数}`（**不含路径**）
  - 最近 500 行日志
- 先在应用内预览全部内容，用户确认后再通过 `dialog.showSaveDialog` 保存。不依赖任何压缩库。

**验收**：导出的文件里检索不到测试密钥、账户 label 和任何绝对路径。

#### T3.4 凭据读取失败可重试 + Mac 验收清单

**背景**：`accounts.load()` 失败后会设置 `issue`，之后只能重启应用。Mac 上 Keychain 授权被拒是最可能的触发原因。

**步骤**

1. 新增 IPC `assistant:retry-credentials`，只允许主窗口调用：清空 `accounts.issue` 后重新执行 `load()`。成功后重建相关运行时并广播状态。**绝不覆盖已有的加密文件**（保持现有的「未覆盖」语义）。
2. 在现有的错误提示区域加一个「重新读取」按钮，复用现有样式。**按 D10 流程先出截图，确认后再合并。**后端 IPC 和测试可以先合并，按钮单独提交。
3. 测试：用一个第一次 `decryptString` 抛异常、第二次正常的假 `safeStorage`，验证重试后能恢复，且加密文件的字节内容没有变化。
4. 新建 `docs/MAC-ACCEPTANCE-CHECKLIST.md`，交给用户在真机上逐项执行。每一项都要写明操作步骤、预期结果和「实测记录」栏：
   - 从 DMG 安装，首次右键打开
   - 首次保存账户时的 Keychain 提示
   - **安装新构建覆盖升级后**：是否弹出 Keychain 授权；点「始终允许」/「拒绝」后分别的表现；点拒绝后用「重新读取」能否恢复。由于 D4 决定继续使用 ad-hoc 签名，这一项每次发版都要复测
   - 开发版和打包版的数据隔离（对应 T3.1）
   - 菜单栏托盘、悬浮窗（所有桌面空间、全屏应用之上）
   - 睡眠唤醒后自动刷新、登录项自启动
   - 真实连接 Codex；Zcode / OpenCode 来源同步
   - 通知权限
   - 空闲 10 分钟的 CPU 和内存（活动监视器读数）
   - 退出重开后窗口位置保留

**验收**：单元测试通过；清单文档存在。**清单中的真机项不得由执行模型标记为通过。**

#### T3.5 Developer ID 签名与公证（已跳过：D4 = 暂不购买）

> 用户决定暂不购买 Apple Developer 账号，本任务不执行。以下内容保留，供将来改变决定时参考。Mac 继续使用 ad-hoc 签名，首次打开仍需右键 → 打开，`spctl` 继续如实记录为 rejected。


- 在 `electron-builder.yml` 的 mac 段中去掉 `identity: "-"`，`notarize` 改为读取环境变量 `APPLE_ID`、`APPLE_APP_SPECIFIC_PASSWORD`、`APPLE_TEAM_ID`；`hardenedRuntime` 和 entitlements 保持不变。
- 证书通过 `CSC_LINK` 和 `CSC_KEY_PASSWORD` 放进 CI secrets，**不进仓库**。
- 验收：`spctl -a -vv` 返回 accepted；`xcrun stapler validate` 通过。在 MAC-ACCEPTANCE-CHECKLIST 中补充一项：「从 ad-hoc 版升级到签名版时，Keychain 弹框一次是预期行为」。
- 完成后再评估 electron-updater 自动更新（单独开任务，不在本任务范围内）。

---

### 阶段 4 · 存储与性能

#### T4.0 性能基线测量

借助 T3.2 的日志耗时字段，在用户的真实数据上测量以下各项，并把结果写进 `docs/perf-baseline.md`。测量过程只读取元数据，不导出任何数据。

- 每个工具来源的单次查询耗时（today / 7d），以及扫描的行数和文件数
- `history.json` 的大小和单次写入耗时
- 打开分析页时主进程是否卡顿：用 `perf_hooks.monitorEventLoopDelay` 采样 60 秒，记录 p99

**结论规则**：单个来源查询超过 1 s、或主线程 p99 卡顿超过 50 ms 的，对应的优化任务优先做；没超过的可以降级。

#### T4.1 历史记录迁入 SQLite

**背景**：`history.cjs` 的 `append()` 每次轮询都在主线程上同步重写整个 JSON 文件。按默认 60 秒刷新，约 11 天会达到 1.6 万条的上限。

**步骤**

1. 新建 `desktop/history-db.cjs`，使用 `node:sqlite`，数据库文件为 `<userData>/history.sqlite`。
   - 表结构：`history(fp TEXT, t INTEGER, record TEXT, PRIMARY KEY(fp,t))`
   - 对外 API 与 `HistoryStore` 完全一致：`configure(hash)`、`append(data)`、`records`、`clear()`
2. **语义必须逐条保持一致**：同一分钟内后写入的覆盖前面的；`t` 不大于最后一条时忽略；保留 31 天；最多 16000 条。`records` 在内存中维护数组，`append` 时增量 push，不重新整体读取。
3. 迁移：`configure(hash)` 时，如果数据库中没有该 fp 的数据，而 `history.json` 存在且 fingerprint 一致，就导入一次。**`history.json` 原样保留**（用于回滚），此后不再写入它。
4. `AccountManager.remove()` 中同时删除该 fp 在数据库中的行。
5. 等价性测试：用同一组脚本化输入（包含同一分钟内的重复写入、时间倒退、超过 31 天的数据、超过 16000 条的数据），分别驱动旧实现和新实现，断言两者的 `records` 完全相同。

**回滚影响**：回退到旧版本后，只能看到迁移那一刻为止的历史数据。这一点要写进 CHANGELOG。

**验收**：等价性测试通过；单次 append 耗时（日志中记录）低于 5 ms；smoke 通过。

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

#### T4.4 轮询调度优化

1. `AccountManager.refreshAll()`：第 i 个账户延迟 `i*400ms + 随机 0–800ms` 后再发起请求。
2. 监听 `powerMonitor` 的 `lock-screen` 事件时暂停所有 monitor（不清除数据）；`unlock-screen` 时恢复并错峰刷新。Windows 和 Mac 都支持这两个事件，这是一次有意的 Windows 行为变更，要写进 CHANGELOG。
3. Codex 连接的刷新间隔取 `max(refreshSeconds, 120)` 秒，并在界面上「下次刷新」时间处如实显示。这也是有意的行为变更。
4. 测试：用假计时器验证错峰、锁屏暂停和恢复，以及 Codex 的最小间隔。

#### T4.5 前端每秒重渲染修复

- 去掉 `DesktopApp` 顶层的每秒 `setNow`，改为一个 `useNow(intervalMs)` hook，只在实际显示倒计时或相对时间的组件中使用。
- 验收：
  - 视觉零变化：改动前后在相同的预览数据下各截一张主窗口和悬浮窗的图，逐一对比；
  - 用 React Profiler 或渲染计数确认顶层组件不再每秒渲染；
  - 倒计时仍然每秒更新。

#### T4.6 原子写入加固

`store.cjs` 的 `atomicWrite`：

- 临时文件名改为 `${file}.${process.pid}.${随机数}.tmp`
- `renameSync` 遇到 `EPERM`、`EBUSY`、`EACCES` 时最多重试 5 次，每次退避 50 ms（用 `Atomics.wait` 做同步等待）
- 最终失败时清理临时文件，然后抛出原错误
- 写入后执行 `fsync`

测试：模拟 rename 先失败两次再成功；以及一直失败时临时文件会被清理。

---

### 阶段 5 · 架构

#### T5.1 上游版本校验改为结构校验

**背景**：Codex rollout 只认 0.155.x，Claude 只认 ≥2.1.251 的 2.1.x。上游一升级，统计就被整体拒绝。

**规则**

- 结构校验通过、但版本不在已验证列表里：照常读取，同时在来源报告中加上 `contract: 'unverified-version'` 和 `observedVersion` 两个字段，界面在**现有的来源状态文案**中追加一句「x.y 版本未经验证，按已知结构读取」。
- 结构校验不通过：维持现状，拒绝读取并显示「格式不受支持」。
- 已验证版本的列表放在各 reader 顶部的常量里。
- Harness 是项目自带的 exporter，保持严格校验。

**结构校验的最小必需字段**

- Codex：`session_meta` 中有字符串 `id` 和可解析的 `timestamp`；`token_count` 中的 `info.total_token_usage` 和 `last_token_usage` 都是由非负安全整数组成的对象，且含 `input_tokens`、`output_tokens`、`total_tokens`。
- Claude：OTLP 事件名在现有集合内，且所需属性都存在。

**测试**：版本为 0.160.0、结构相同的 fixture → 正常出数据，并带 unverified 标记；结构不同 → 被拒绝。

**红线**：不能为了兼容去猜测字段含义；字段改名一律视为结构不通过。

#### T5.2 检查更新（D8 = 公开安装包仓库；界面按 D10 先确认）

- 启动时以及每 24 小时，用 `net.fetch` 请求公开安装包仓库的 `https://api.github.com/repos/<owner>/<repo>/releases`（不用 `latest`，因为 latest 会跳过 prerelease，而本项目的发布都是 beta）。取版本最高的一项，按 semver 比较（含 beta 序号）。
- 请求不带任何身份信息或设备信息；只设置 `Accept` 和 `User-Agent: TokenUsageAssistant/<版本>`。遇到 403 限流时静默退避到下一个周期。
- 仓库地址写成常量，不允许从设置中修改（与「不开放任意地址」的原则一致）。
- Mac 端只提示并打开下载页：D4 未购买签名，无法自动更新。Windows 端同样只提示，不自动下载。
- 发现新版本时，在设置页和托盘菜单中给出提示。**按 D10 流程，先出提示样式和文案的截图，确认后再合并。**点击后在浏览器中打开该版本的 Release 页面。**不自动下载，不自动安装。**
- 设置中提供「检查更新」开关，默认开启，并在说明中披露「会向 GitHub 发送一次请求」。
- 请求失败时静默处理，只写日志。

#### T5.3a 平台注册表重构（语义零变化）

- 新建 `desktop/providers/<id>.cjs`，每个平台导出：
  `{ id, name, capabilities, regions, credential, note, origins, buildRequest(credential, region, now), classifyBodyError(body), normalize(raw, now), officialUrl({region, identity, target}), clientKind: 'quota'|'balance'|'commandcode'|'subscription' }`
- `providers.cjs`、`provider-catalog.cjs` 和 `main.cjs` 中的 `assistant:official` 改为从注册表派生。所有 ProviderError 的文案原样保留。
- 新增测试：注册表的 id 集合与原来的 `PROVIDERS` 完全一致；每个平台、每种 target 生成的官方地址与重构前一致（写死在快照对比表里）。
- **验收**：除 import 路径外，现有测试一行不改，全部通过；smoke 通过。

#### T5.3b 工具来源注册表重构（语义零变化）

- 新建 `desktop/tool-kinds/<kind>.cjs`，导出：`{ kind, defaultLabel, picker: {type:'file'|'directory', title, filters}, inspect(file), scan(db, source, range), overlapCheck: boolean }`
- `tool-sources.cjs` 中的 `KINDS`/`label`/`inspect`、`tool-worker.cjs:121` 的分派、`main.cjs` 中的 `chooseToolFile`，全部改为从注册表派生。
- 验收要求同 T5.3a。

#### T5.4 smoke 代码从主流程拆出

- 把 `finishSmoke`、smoke 模式下的 client 工厂、fixture 数据库的创建，移到 `desktop/smoke/index.cjs`。`main.cjs` 中只保留：`if (smoke) require('./smoke/index.cjs').attach(ctx)`。
- fixture 文件和 `*-native-smoke.cjs` 移到 `desktop/smoke/` 目录下。**这些文件仍然打进包里**，因为打包后的原生 smoke 测的就是真实的包。本任务只降低 `main.cjs` 的复杂度。
- 验收：smoke 报告的字段集合与改动前完全一致（逐个键对比）。

#### T5.5 领域模块类型检查

- 在 `domain.cjs`、`provider-domain.cjs`、`balance-domain.cjs`、`analytics-core.cjs`、`tool-analytics.cjs`、`association-rules.cjs` 顶部加 `// @ts-check`，并补充 JSDoc typedef。重点是把「可能为 null 的数值」写成 `number|null`。
- `tsconfig.json`：`checkJs`、`strict`、`noEmit`；添加开发依赖 `typescript`；新增 `pnpm run typecheck` 并接入 CI。
- **只通过补充注解来消除类型错误。**如果类型检查暴露出真实的 bug（例如把 null 当 0 参与了计算），记进第 5 节，另开任务修复。

---

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

### 阶段 7 · 灵动岛

#### T7.0 修订岛设计文档（D9 已拍板）

修改 `docs/island-1.9.0-design/HANDOFF.md`：

1. **几何数值**：§3.1 写的是「中心偏移 108px = 100 + 16」，算术不成立（100 + 16 = 116）。收纳宽度 360 时，半宽为 180，耳宽实际是 72 或 64，不是文中的「约 80」。改为：以 T7.1 实测得到的耳区矩形为准，文档中只保留约束（内容不得进入刘海区，保留 ≥12px 缓冲）。
2. **③ 余额默认阈值（已定）**：原建议「兜底默认 $50 等值」需要换汇，违反「不换汇」红线，已废弃。定为：用户未设置阈值前不发余额告警；首次启用岛时引导用户按币种分别设置。
3. **⑥ 锁屏可见性（已定）**：只作为真机确认项，写进 T3.4 的 Mac 验收清单，不再作为设计议题。真正的风险是屏幕共享，由内容保护开关覆盖。
4. **新增 ⑦ 菜单栏遮挡（已定：由用户在设置中选择）**：收纳态常驻的耳区会遮住左侧应用菜单和右侧状态栏图标（包括本应用自己的托盘图标），而且耳区会拦截鼠标。
   - 在岛设置组里新增一项「收纳态耳区」：「常显」/「仅告警时」。
   - 选「仅告警时」时，收纳态只覆盖刘海本身，有告警时才出现耳区（走告警接管通道）。
   - **默认值暂不确定**：T7.1 实测遮挡情况后，把截图交给用户决定。
   - 该设置项的界面同样走 D10 的方案确认流程。
5. **刘海检测**：`workArea.y − bounds.y > 30` 在开启「自动隐藏菜单栏」时会误判。另外，刘海在 point 单位下的宽度会随显示缩放档位变化，按机型预设一张表并不够。改为参考 T7.1 的 NSScreen 方案。
6. **§3.4/§3.5 增量一的前置条件**：补充「依赖 T7.2 实时尾随通道」。现有 `ToolSources.run()` 同一时间只允许一个 worker，新查询会取消正在进行的查询，并且每次都全量扫描，不能直接用于 2–5 秒的刷新。
7. 把岛 HANDOFF 的 §4 待拍板表改为「已定决策」：
   - ② 告警时整个耳区替换为告警内容。既然选了整耳替换，原 §8 第 2 步「补一张告警接管小稿」可以去掉。
   - ③ 见上面第 2 点
   - ④ 红优先于琥珀，同级时显示最快重置的账户
   - ⑤ 悬停参数（150 ms / 200 ms）在真机调好后定值，不放进设置
   - ⑥ 见上面第 3 点
   - ⑦ 见上面第 4 点。唯一剩下的待定项是 ⑦ 的默认值
   - 同时在 §3.3 设置组完整项中加入「收纳态耳区」。

#### T7.1 岛 POC（开发开关，不随包发布）

- 仅当 `!app.isPackaged && process.env.TUA_ISLAND_POC === '1'` 时启用，代码放在 `desktop/island-poc/` 下。打包配置中排除该目录，验证方法：检查 asar 的文件列表。
- 验证点（全部写进 `docs/island-1.9.0-design/POC-REPORT.md`，每一项附截图或数据）：
  1. `setAlwaysOnTop(true, 'status')` 是否位于菜单栏之上；`pop-up-menu` 层级作为对照。
  2. **刘海几何**：用 JXA 读取内建屏幕的 `safeAreaInsets.top`、`auxiliaryTopLeftArea` 和 `auxiliaryTopRightArea`。不需要原生依赖，参考写法如下（需要实测 JXA 能否桥接结构体；不能的话，记录失败，回退到 workArea 启发式加手动微调）：
     ```bash
     osascript -l JavaScript -e 'ObjC.import("AppKit");JSON.stringify($.NSScreen.screens.js.map(s=>{const f=s.frame,i=s.safeAreaInsets,l=s.auxiliaryTopLeftArea,r=s.auxiliaryTopRightArea;return {name:ObjC.unwrap(s.localizedName),frame:[f.origin.x,f.origin.y,f.size.width,f.size.height],top:i.top,left:[l.origin.x,l.origin.y,l.size.width,l.size.height],right:[r.origin.x,r.origin.y,r.size.width,r.size.height]}}))'
     ```
     注意坐标系：AppKit 原点在左下角，Electron 原点在左上角，需要换算。两者单位都是 point/DIP。不同缩放档位下各测一次。
  3. 开启「自动隐藏菜单栏」、切到全屏应用、接外接屏时的检测和隐藏行为。
  4. `setIgnoreMouseEvents(true, {forward:true})` 的鼠标穿透效果，以及 150 ms 悬停判定的手感。
  5. 菜单栏拥挤时，与应用菜单和状态栏图标的遮挡情况（对应 ⑦）。分别截取「常显」和「仅告警时」两种模式在菜单栏空闲和拥挤时的图，供用户决定 ⑦ 的默认值。
  6. `setContentProtection(true)` 在系统截图和录屏下的表现。
  7. 空闲状态下的 CPU 和内存，以及悬停动画时的 CPU（活动监视器读数）。
- **诚实**：执行模型在本机运行得到的结果标为「开发机 POC」；手感和最终参数由用户在真机上确认。

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

之后按 `docs/island-1.9.0-design/HANDOFF.md` §8 继续：首版 → 增量一 → 增量二。每一步都遵守 D1 的交付规则。

---

## 5. 执行中发现的问题（执行模型追加）

| 日期 | 发现于任务 | 问题描述 | 建议 | 处理状态 |
|---|---|---|---|---|
| 2026-10-15 | T1.1 | 第 0.2 节写的 beta.5 测试基线是「249 通过、0 跳过」，但在用户 Mac（macOS 15.7.9，Node 24.21.0，pnpm 11.19.0）上实测为 249 项：246 通过、0 失败、3 跳过。跳过的 3 项是 Harness 运行时测试，原因是未设置 `TUA_HARNESS_CONTRACT_RUNTIME` / `TUA_HARNESS_CLI_RUNTIME`（PROJECT_HANDOFF 已说明这是预期的跳过，不算通过）。 | 用户 2026-10-15 决定：以 246 通过 / 0 失败 / 3 跳过作为后续任务的比对基线。如需恢复 249 通过，另行安装固定版本 Harness 运行时。 | 已按用户决定处理 |
| 2026-10-15 | T1.1 | 执行环境限制：Claude 的设备命令环境是 Linux 虚拟机，且项目文件夹挂载失败；电脑控制对「终端」只允许点击、不允许输入。因此 git 和测试命令由执行模型写成 `work/t1.1/phase-a.sh`、`phase-b.sh`（`work/` 已被忽略），由用户在 Mac 终端运行，执行模型读取输出文件核对。 | 后续任务沿用「执行模型写脚本 → 用户在终端运行 → 执行模型读输出」的方式，除非命令环境能挂载项目文件夹。 | 记录 |
| 2026-10-15 | T1.2 | 预备的 `styles.css` 把 `.red-text` 列为「仅 App.jsx 使用」并删除，但 `DesktopApp.jsx` 用模板字符串动态拼出 `${tone}-text`（`monthTone`/`windowTone` 为 `red` 时，即月度余额耗尽或额度窗口超限），这条规则只在 `styles.css` 中定义；删除会让超限数字失去红色。按字面量 grep 类名查不出这种用法，构建产物检查也查不出。 | 执行前审阅时已恢复 `.red-text`，并从脚本的「已删类名」检查列表中去掉。今后删 CSS 规则时，同时检查 `${…}-xxx` / `+'-xxx'` 这类动态拼接。 | 已处理 |
| 2026-10-15 | T1.2 | T1.2 验收要求 `pnpm run desktop` 能启动并显示主窗口和悬浮窗。但在 Mac 上，开发版直接读写真实 userData，并与打包版共用 Keychain 条目（即 T3.1 要修的问题），可能触发授权弹框、改动真实数据。 | 用户 2026-10-15 决定：本任务改用隔离目录的原生 smoke（`--smoke-test --test-directory=<mktemp -d>`）代替。T3.1 完成前，其他任务的「`pnpm run desktop` 启动」验收同样按此处理，除非用户另行指示。 | 已按用户决定处理 |

---

## 6. 执行记录（执行模型追加）

| 日期 | 任务 | 分支 / commit | 测试（通过/失败/跳过） | 证据等级 | 交付物 | 未完成或遗留 |
|---|---|---|---|---|---|---|
| 2026-10-15 | T1.1 | `main`（初始提交，无需分支）/ `a90b791`（`a90b791248ed54465c4efa10a870d60519ac0124`），标签 `v1.8.0-beta.5`（附注标签） | 246 / 0 / 3（共 249；3 项 Harness 运行时测试因未设环境变量跳过，见第 5 节） | ①（合成契约测试，用户 Mac 本机运行） | 不出包（D1：不改变行为）。`.gitignore` 按计划原样；`git ls-files` = 387；提交后 `git status` 干净。秘密扫描两项（内容正则、文件名）在 `git add` 后和提交前各跑一次，均无命中。`src/generated` 仅被 `scripts/prepare-analytics-preview.mjs` 生成，无测试 import，已忽略。提交者身份由用户自行设置（仓库级 config）。 | 本条执行记录和复选框的更新需单独提交（见下一个提交）。 |
| 2026-10-15 | T1.2 | `task/T1.2-cleanup` / `86331dd`，`--no-ff` 合并为 `6de9240` | 前后均为 246 / 0 / 3（共 249）。`tests/sites-worker.test.mjs` 不在 `test:desktop` 中，删除后总数不变 | ①（合成契约测试）+ ②（Mac 本机开发运行时的隔离目录原生 smoke，非打包版） | 不出包（D1：不改变行为）。git 内：删除 `pelican-bike.html`、`src/App.jsx`、`worker/`、`.openai/`、`scripts/prepare-sites-build.mjs`、`tests/sites-worker.test.mjs`；`package.json` 去掉 `test:sites` 和 build 末尾的 `prepare-sites-build`；`main.jsx` 去掉 `legacy-prototype` 分支；`styles.css` 删掉 36 条仅 App.jsx 使用的规则（260 → 226 条，含两处媒体查询内的子规则），保留 `.red-text`（见第 5 节）以及与 `.preview-bar` 共用的 `.preview-options` 选择器。git 外：经用户同意删除 `a/`（含未入库的 `taste.md`）和 `.DS_Store`；`release-v1.8.0-beta.5/` 移到 `~/Documents/TokenUsageAssistant-releases/`，文件数 271 → 271、字节数 560305755 → 560305755，一致。`src/desktop-preview.js`（`previewBridge`）保留。`git ls-files` 387 → 381。`pnpm run build` 成功，被删类名不出现在构建产物 JS 中。启动验收按用户决定改用隔离目录 smoke：`ok:true`，`readySurfaces` = widget、main，`trayCreated:true`，各子检查 ok。 | 硬编码的 `release-v` 路径已列出（`scripts/verify-package-beta5.cjs`、`deliver-opencode-beta5.py`、`Build-Mac-App.command`、`Verify-Mac-Native.command`、`verify-opencode-package-beta5.ps1`、`electron-builder.yml`），留给 T2.5。`AGENTS.md`、`README.md`、`PROJECT_HANDOFF.md`、`DEVELOPMENT_READY.md` 中还提到 `test:sites` 和 Sites 文件，留给 T1.4。未用真实数据跑 `pnpm run desktop`（见第 5 节）。 |

---

## 附：给执行模型的启动提示词（用户可直接复制）

> 请先完整阅读项目根目录的 `IMPROVEMENT_PLAN.md`，再读 `AGENTS.md` 和 `PROJECT_HANDOFF.md`。找到第 3 节中下一个未完成、且依赖和决策都已满足的任务，按第 0.2 节的流程执行。完成后更新第 6 节执行记录和任务复选框。遇到未拍板的决策、红线冲突或计划外的问题，停下来问我，不要自行决定。每次只做一个任务。
