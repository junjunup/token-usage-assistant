# Token 用量助手 1.8.0-beta.1 · M 系列 Mac 首测版

> **本版流程已被取代（2026-09-30）**：Mac 交付改由本机 electron-builder 产出的真实 `.app` + DMG，`Start-Mac-Trial.command`/`Build-Mac-Test.command` 等脚本链路已移除。见 `docs/MAC-APP-1.8.0-beta.5.md` 与 `docs/MAC-APP-PLAN-1.8.0-beta.5.md`。本文保留为历史记录。

2026-09-24。阶段 5 首轮开发交付，目标 Apple Silicon（M 系列）+ macOS 13 或更高版本。**尚未在真实 Mac 上运行；本版不是已完成验收的正式 macOS 安装版。** Windows 基线功能同步保留。

## 如何在 Mac 上开始

使用 `TokenUsageAssistant-Mac-arm64-Trial-1.8.0-beta.1.zip`：

1. 将压缩包完整复制到 Mac，解压到一个固定目录。保留包内所有文件；不需要安装 Node、pnpm 或编译源码。
2. 双击 `Start-Mac-Trial.command`。如果被当作文本打开，可以在终端输入 `/bin/bash `（末尾有空格），将该脚本拖入终端，然后按回车。
3. 脚本检查 M 系列芯片、macOS 版本和文件校验值，首次解压自带的官方 Electron ARM64 运行环境，然后启动助手。后续仍用同一脚本启动。
4. 先确认能够看到主面板、顶部菜单栏图标和“账户与设置”，再在应用内连接账户。密钥只在 Mac 本机输入，不要发到聊天。
5. 完整退出请使用应用菜单“退出助手”或 Command-Q；关闭主窗口后仍在菜单栏运行。

这是“官方运行环境 + 已构建应用代码”的开发测试包。没有在 Windows 上伪造 Mac 的 DMG、签名、公证或实机通过结果。它不修改官方 Electron 二进制，保留原始压缩包中的框架软链接和权限。应用运行时可能仍有 Electron 的系统身份提示；正式独立应用包需在 Mac 上构建。

应用数据固定存放在 `~/Library/Application Support/TokenUsageAssistant`。此路径用于后续 Mac 应用包；无需复制 Windows 应用数据。Windows 的加密凭据不能直接迁移到 Mac，需要重新连接。首测包文件夹移动后，重新启动助手会刷新 Claude 启动配置的位置。

## 本轮已实现

- Codex：支持无 `.exe` 后缀的本机可执行程序；尝试标准应用目录、用户应用目录、Homebrew、用户 CLI 路径；保留手动回退、多配置选择和身份绑定。仅官方只读账户 RPC，不登录 / 注销、不调用模型。
- Claude：新增适用于 Mac 的 `Start-Claude.command`、Node 启动器及白名单状态栏组件，使用随应用运行的 Node 环境，不依赖 PowerShell。保持本机回环端口和令牌鉴权，不导出正文或凭据，不改用户原始 Claude 配置。
- 路径：Mac 保留路径大小写，真实文件身份用于别名去重；Windows 原有凭据指纹保持兼容。
- 系统界面：Mac 原生窗口控制、应用菜单、Command 快捷键、菜单栏模板图标、Dock 图标、悬浮窗跨桌面 / 全屏配置、关闭后驻留与重新激活。
- 凭据：沿用 Electron `safeStorage`，在 Mac 使用钥匙串，系统加密不可用时拒绝保存，不回退明文。
- 启动项：按 Mac `mainAppService` 接口处理，区分已登记 / 待系统允许 / 未登记状态；登录启动时主面板保持隐藏。
- 统计：保留所有平台余额 / 套餐能力，Zcode、Harness、Codex、Claude 用量口径及阶段 4 人工关联，不自动换账户归属，不虚构账单核对。

## 连接工具

**Codex**：先在官方客户端登录 ChatGPT，再点“连接本机 Codex”。额度接口成功与本机用量文件可读取分别判定；工具记录解析仍限定 0.155.x。Mac 客户端程序位置、RPC 和真实日志兼容性仍待你测试。

**Claude**：连接后生成本地启动配置。请在你的项目目录打开终端，运行生成目录中的 `Start-Claude.command`。需要 Claude Code 2.1.251 起的 2.1.x；助手应保持运行。此会话使用助手状态栏，仅从启用后采集，不补历史。组件异常不阻断 Claude 的正常使用。

**Zcode / Harness**：在工具数据源中选择 Mac 上的实际数据库或专用导出文件，不沿用 Windows 的盘符。Harness 仍固定官方 0.1.7-rc.1 / 会话格式 4。原始工具日志不改写。

## 建议首轮测试顺序

| 项目 | 操作与通过标准 | 当前状态 |
| --- | --- | --- |
| 启动与退出 | 脚本启动、关闭后菜单栏驻留、再次打开、Command-Q 完整退出 | 待 Mac 实测 |
| 界面与悬浮窗 | 浅深色、原生窗口按钮、悬浮窗展开收起、拖动 / 固定、全屏和桌面切换 | 待 Mac 实测 |
| 凭据保存 | 本机连接账户，退出再开仍保留；钥匙串提示与拒绝场景有明确结果 | 待 Mac 实测 |
| 现有账户 | 优先验证已有 ChatGPT Pro / Codex，以及 Command Code / Zcode | 待真实账户实测 |
| 工具统计 | 同时选两个来源，重复刷新不重复累计，项目 / 模型 / 会话筛选一致 | Windows 样例通过，Mac 待测 |
| 关联与核对 | 人工归组、范围关联、切换总览账户不改归属；缺证据时无法核对 | Windows 样例通过，Mac 待测 |
| 休眠与网络 | 休眠后唤醒、断网恢复，窗口和刷新恢复，旧数据带状态 | 待 Mac 实测 |
| 安装 / 升级 / 启动项 | 独立应用包安装与替换、凭据保留、登录启动及系统批准状态 | 本首测运行模式不验收，须 Mac 打包后测试 |
| 签名与公证 | Developer ID 签名和 Apple 公证验证通过 | 未执行，正式分发前完成 |

没有新增长期稳定性 / 两小时连续运行测试。先按功能逐项反馈即可。

## 样例自检与反馈

需要自动样例检查时，先退出正常运行的助手，再运行 `Check-Mac-Trial.command`。它在测试包内新建 `mac-verification.*` 隔离目录，使用虚构账户及工具数据运行原生样例，不读取你的真实账户数据。过程中系统可能请求钥匙串访问。成功与否以生成的 `smoke-result.json` 为准，不能当作真实账户核账。

反馈请包含：Mac 芯片型号、macOS 版本、操作步骤、预期与实际结果，以及已遮盖账户个人信息的画面。自动自检可提供 `smoke-result.json`。不要发送真实应用数据目录、密钥、`collector.json` 或 `claude-settings.json`，后两者包含本机采集鉴权信息。

## Mac 上生成独立应用包（后续可选）

源码交接包内有 `scripts/Build-Mac-Test.command`。在 Mac 安装 ARM64 Node.js 24 和 pnpm 11.19.0 后运行；脚本按锁文件安装依赖、构建前端并生成 ARM64 ZIP。不要复制 Windows 的 `node_modules`。该构建使用本机 ad-hoc 临时签名，尚无 Developer ID 签名或公证，仍属于开发测试包。此脚本在当前 Windows 环境不能完成 Mac 构建，运行结果待 Mac 验证。

初次离线首测包无需上述开发依赖。该运行模式的“开机启动”按钮保持禁用；这项验收应使用 Mac 构建的应用包，并在正式签名后再次复核。

## 本轮验证与边界

216 项桌面测试与 4 项 Sites 兼容测试通过，新增 12 项覆盖 Mac 路径、程序发现、启动项参数、窗口配置、启动脚本和实际本机 HTTP 组件通信。Windows 最终安装版 / 免安装版和 1.7.0 升级验证见源码 `docs/verification-1.8.0-beta.1/`。

官方 Electron 44.4.4 ARM64 运行包校验值已核对；Mach-O 架构、最低 macOS 13 和框架链接结构已检查。Windows 上的组件样例、文件结构或回归通过，均不等于 Mac 实机通过。真实 Mac、签名、公证、Mac 安装升级和真实账户核账保持未完成；Intel Mac、Linux、第三方接入不在本版范围。

依据：[Electron 44 的 macOS 要求](https://www.electronjs.org/blog/electron-44-0)、[跨平台构建限制](https://www.electron.build/v26/docs/features/multi-platform-build/)、[钥匙串加密](https://www.electronjs.org/docs/latest/api/safe-storage)、[签名与系统功能](https://www.electronjs.org/docs/latest/tutorial/code-signing)。
