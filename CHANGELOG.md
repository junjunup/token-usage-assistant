# 更新日志

倒序排列。每个版本的详细说明、验证记录见对应的 `docs/` 专题文档和 `docs/verification-<版本>/`。证据等级：①合成契约测试 ②打包原生 smoke ③真实账户或真机验收。

## 未发布（阶段 4，计划作为 1.8.0-beta.7）

- 账户额度历史改存到 `history.sqlite`：每次轮询只增量写一条，不再在主线程上整体重写 JSON 文件（16000 条时单次写入从约 21 ms 降到约 0.3 ms）。语义不变：同一分钟内后写入的覆盖前面的，保留 31 天、最多 16000 条。首次启动时从各账户的 `history.json` 导入一次，此后**不再写入 `history.json`**，原文件保留（T4.1）。
- **回滚影响**：退回 1.8.0-beta.6 或更早版本后，历史图表只能看到升级那一刻为止的数据；之后新版本记录的历史只在 `history.sqlite` 中。
- 本机文件写入更稳健：每次写入使用唯一的临时文件并在替换前 fsync；Windows 上目标文件被短暂占用（`EPERM`/`EBUSY`/`EACCES`）时最多重试 5 次；最终失败时清理临时文件，原文件保持不变。代价是单次写入从约 0.2 ms 增加到约 5 ms（T4.6）。
- 性能基线见 `docs/perf-baseline.md`（T4.0；真实数据下没有任何一项超过阈值，T4.3 跳过，T4.2 挪到灵动岛 T7.2 之前）。

## 1.8.0-beta.6（2026-10-16，阶段 3）

- Mac 开发版（未打包）改用独立的应用名、数据目录和 Keychain 条目（`TokenUsageAssistant-Dev`），不再读写打包版的真实数据；打包版和 Windows 不变（T3.1）。
- 新增本机诊断日志 `logs/app.log`：只记录模块、错误分类和白名单字段（不含错误原文、路径、账户名称或密钥），1 MB 轮转保留 3 份；原来静默吞掉的 9 处失败改为记录警告（T3.2）。
- 本机账户列表读取失败（例如拒绝了系统加密授权）后，可以在总览提示条上点「重新读取」恢复，不用重启；不会覆盖已有的加密文件。新增 Mac 真机验收清单 `docs/MAC-ACCEPTANCE-CHECKLIST.md`（T3.4）。
- 修复原生 smoke 的偶发失败：45 秒「渲染进程握手超时」定时器在握手成功后没有清除，冷启动较慢时会在 smoke 检查进行中强制退出并销毁窗口（报 `Object has been destroyed`）。现在握手完成即清除定时器；smoke 断言不变，只影响 `--smoke-test`。
- Mac 上的 smoke 改用独立的应用名 `TokenUsageAssistant-Smoke` 和独立的 Keychain 条目，不再访问真实的 `TokenUsageAssistant Safe Storage`（开发版的 `-Dev` 条目同样不再访问）。原先每次新构建首次跑 smoke 都会弹出访问真实条目的授权窗，没人点允许时主线程卡住，smoke 就会失败。smoke 报告新增 `keychainName` 字段，名称不对时判为失败。
- 新增「导出诊断信息」（账户与设置页底部）：先在应用内预览全部内容，确认后另存为 JSON。内容只有版本、系统、设置、各账户与工具来源的状态码和时间，以及最近 500 行经过再次脱敏的本机日志；不含密钥、账户名称、组织 ID、文件路径、错误原文或对话内容（T3.3）。
- 证据等级：①（合成契约测试）+ ②（CI 打包原生 smoke 与 Windows 真实 DPAPI 升级验证，见 `docs/verification-1.8.0-beta.6/`）；Mac 真机清单 `docs/MAC-ACCEPTANCE-CHECKLIST.md` 待用户执行（③ 未完成）。

### 同版本包含的工程整理（阶段 1–2，不改变应用行为，2026-10）

- 纳入 Git 版本控制，基线提交打标签 `v1.8.0-beta.5`（T1.1）。
- 删除旧浏览器原型（`src/App.jsx`）和 Sites 兼容文件（`worker/`、`.openai/`、`test:sites`），这是用户决策 D5；发布产物移到仓库外的 `~/Documents/TokenUsageAssistant-releases/`（T1.2）。
- 引入 Prettier + ESLint 并一次性格式化全部代码；构建产物经比对，语义不变（T1.3）。
- 预览模块生成脚本改为不受空白影响，并在残留 `require` 时让构建报错（T1.3）。
- 文档重构：新的 AGENTS.md、README、PROJECT_HANDOFF 和本文件；旧版文档归档到 `docs/history/`（T1.4）。
- 处理 ESLint 基线的 26 个错误，运行行为不变（T1.5）。
- 推送到私有仓库；新增 CI：Windows 和 macOS 上运行格式检查、lint、测试、构建（T2.1、T2.2）。
- 新增 Release 工作流，由 CI 产出全部 4 个安装包，并做打包原生 smoke、包内容与源码比对、EXE 内嵌载荷比对；Mac 包还做签名校验。新增手动触发的 Publish 工作流，发布到公开安装包仓库 junjunup/TokenUsageAssistant（T2.3）。
- 7 份升级验证脚本合并为一个通用脚本加按版本区分的 profile；Release 工作流从上一个版本标签重建旧版，做真实 DPAPI 升级验证（T2.4）。
- 版本号只写在 `package.json` 一处；删除 beta.5 专用的交付脚本（T2.5）。

## 1.8.0-beta.5（2026-09-26，Mac 打包方式于 2026-09-30 更新）

- 新增 OpenCode Go 官方额度查询：固定 `GET /zen/go/v1/usage`，展示三个周期的百分比和重置时间，不编造余额。
- 新增 OpenCode 本机 SQLite 工具来源：只读元数据叶子字段，排除重复和旧版镜像。
- Mac 改为本机 electron-builder 构建 `Token 用量助手.app` + DMG/ZIP（arm64，ad-hoc 签名，未公证），不再使用手工拼装的试用包和修复脚本。
- smoke 模式把隔离目录归一化为 realpath，修复 macOS 符号链接路径导致的原生 smoke 失败。
- 证据：①② 通过；真实 Go 账户、真实 OpenCode 使用和 Mac 真机验收未完成。见 [OPENCODE-1.8.0-beta.5](docs/OPENCODE-1.8.0-beta.5.md)、[MAC-APP-1.8.0-beta.5](docs/MAC-APP-1.8.0-beta.5.md)。

## 1.8.0-beta.4（2026-09-26）

- 修复侧栏 Logo 偏右：品牌按钮去掉默认内边距。
- 修复 Windows 任务栏显示 Electron 默认图标：窗口改用多尺寸 ICO，并显式登记任务栏信息。
- 新增包内原生验证：检查 SVG/路径居中，以及系统返回的窗口图标。见 [BRAND-FIX-1.8.0-beta.4](docs/BRAND-FIX-1.8.0-beta.4.md)。

## 1.8.0-beta.3（2026-09-26）

- 更换为用户批准的精修刻度环 Logo（托盘、加载标识、侧栏、悬浮窗、Windows/Mac 图标）；其余 UI 不变。
- 应用 ID、程序名和数据目录不变。见 [BRAND-1.8.0-beta.3](docs/BRAND-1.8.0-beta.3.md)。

## 1.8.0-beta.2（2026-09-26）

- 响应 Mac 诊断报告：Homebrew Codex CLI 0.39.0 在初始化阶段约 49 ms 退出（参数错误），并不是网络超时。
- 选择 Codex 程序前先做仅初始化的协议预检；失败时尝试其他已知程序，并允许直接选择 Codex.app。
- RPC 分阶段计时，区分启动、协议、退出和真正的超时，不暴露原始 stderr。
- 见 [MAC-TRIAL-1.8.0-beta.2](docs/MAC-TRIAL-1.8.0-beta.2.md)；真实 Mac 额度连接仍待复测。

## 1.8.0-beta.1（2026-09-24）

- Apple Silicon macOS 首个开发试用版（macOS 13+）：新增 `platform.cjs`、Mac 版 Claude 组件和启动器、Mac 原生窗口/菜单/登录项分支，数据目录固定为 Application Support/TokenUsageAssistant。
- 当时使用「官方 Electron + 同一 ASAR」的试用包，已被 beta.5 的 `.app` + DMG 取代。
- 不算完成 Mac 验收。见 [MAC-TRIAL-1.8.0-beta.1](docs/MAC-TRIAL-1.8.0-beta.1.md)。

## 1.7.0（2026-09-24）

- 阶段 4：人工计费账户归组、同一账户多 Key 时选择主连接、按来源/时间/供应商/模型设置关联规则、工具按账户筛选、账户核对页。
- 没有有效规则时 `accountId` 仍为 null；凭据、身份或来源变化后需要重新确认。
- 现有数据不足以给出真实差值或误差率，核对页会说明原因。见 [ACCOUNT-ASSOCIATION-1.7.0](docs/ACCOUNT-ASSOCIATION-1.7.0.md)。

## 1.6.0（2026-09-24）

- 阶段 3：DeepSeek 官方按量余额（`GET /user/balance`），新增按量账户看板和悬浮窗视图。
- 保留十进制精度，各币种分开；零余额算成功查询，失败时保留上次成功值。
- 未在真实 DeepSeek 账户上测试。见 [DEEPSEEK-BALANCE-1.6.0](docs/DEEPSEEK-BALANCE-1.6.0.md)。

## 1.5.1（2026-09-24）

- Codex 自动发现已保存位置、`CODEX_HOME` 和默认 `.codex`；多个配置时在应用内选择，手动选择作为回退。
- 额度查询成功不会因为缺少工具日志而显示失败；Claude 组件的就绪、首次等待、同步、过期状态分开显示。见 [CONNECTION-UX-1.5.1](docs/CONNECTION-UX-1.5.1.md)。

## 1.5.0（2026-09-24）

- 新增 ChatGPT / Codex 订阅额度：只读 app-server 查询，以及 Codex rollout 本机快照。
- 新增 Claude / Claude Code 订阅额度（statusLine）和本机 OTLP 采集组件。
- 证据：在 Windows 上做过真实 Codex 只读查询（ChatGPT Pro）；Claude 只有契约样例和组件验证。见 [SUBSCRIPTIONS-1.5.0](docs/SUBSCRIPTIONS-1.5.0.md)。

## 1.4.1（2026-09-24）

- 修复悬浮窗展开后再收起时，不能回到原来底边位置的问题。

## 1.4.0（2026-09-24）

- 阶段 1、2：独立的工具数据源（可新增、改名、启停、同步、移除），统一采用「已报告用量」口径。
- 新增可选的 DeepSeek Harness 本机统计插件（锁定 `0.1.7-rc.1`），以及双工具分析。
- 两小时稳定性测试在约 44 分钟时按用户要求停止，未完成。见 [TOOL-SOURCES-1.4.0](docs/TOOL-SOURCES-1.4.0.md)。

## 1.3.0（2026-09-23）

- 首批新平台：GLM Coding Plan（国内/国际）、MiniMax Token Plan（国内/国际）、火山个人 Agent Plan（北京）；保留 Command Code。
- 支持最多 20 个加密保存的账户，各自独立轮询、缓存和告警，支持动态额度窗口。
- 只做过合成契约验证。见 [PROVIDER-ADAPTATION-1.3.0](docs/PROVIDER-ADAPTATION-1.3.0.md)。

## 1.2.0（2026-09-23）

- 用量分析八项功能：今天/7 天/账期范围、趋势、模型排行、项目/会话、缓存拆分、请求健康度与均值、资金来源消耗、实测消耗速度和条件预测。
- 体验改进：固定导航、自定义下拉菜单、月度余额并列展示、悬浮窗点击展开、重置状态修正。
- 见 [PROJECT_HANDOFF-1.2.0-history](docs/PROJECT_HANDOFF-1.2.0-history.md)。

## 1.0 – 1.1（2026-09-23）

- 首个 Windows 桌面版：托盘、独立置顶悬浮窗、详情面板、轮询、DPAPI 加密凭据、设置持久化、额度提醒。
- 1.1 起只读读取本机 Zcode 用量元数据（在 Windows 上用真实 Zcode 数据库验证过聚合）；Command Code 账户接口以合成响应验证为主。
