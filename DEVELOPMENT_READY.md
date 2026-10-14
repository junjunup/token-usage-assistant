> 当前开发版 **1.8.0-beta.1**：M 系列 Mac 首测准备，macOS 13+。阅读 [Mac 首测说明](docs/MAC-TRIAL-1.8.0-beta.1.md)。Mac 实机验收未完成；Windows 1.7.0 发布基线保留。以下为历史记录。

> 当前版本 **1.7.0**：阶段 4 人工账户归组、工具关联和核对依据。入口及限制见 [使用与验证说明](docs/ACCOUNT-ASSOCIATION-1.7.0.md)，验证见 `docs/verification-1.7.0`。下方均为保留的历史说明。

> 当前版本 **1.6.0**：阶段 3 DeepSeek 官方按量余额。参见 [使用与验证说明](docs/DEEPSEEK-BALANCE-1.6.0.md)。以下为历史版本说明。

> 当前版本 **1.5.1**：Codex 自动发现配置、应用内多配置选择、额度与工具来源分开显示状态。参见 [使用与验证说明](docs/CONNECTION-UX-1.5.1.md)。历史版本信息保留如下。

> 当前桌面开发版本为 **1.5.0**。ChatGPT / Codex、Claude / Claude Code 的订阅入口、采集方式和限制见 [1.5.0 使用说明](docs/SUBSCRIPTIONS-1.5.0.md)，交接以 PROJECT_HANDOFF.md 的新增订阅里程碑为准。下方保留原版本说明。

> 历史记录：本文描述迁入 D 盘时的 1.2.0 环境准备。最新 1.3.0 实现、发布和验证请阅读 PROJECT_HANDOFF.md 与 docs/PROVIDER-ADAPTATION-1.3.0.md。

# Token 用量助手：本机开发已就绪

验证日期：2026-09-23，Asia/Shanghai。

## 文件位置

- 项目根目录：`D:\Projects\TokenUsageAssistant\commandcode-companion`
- 原始交接资料、源码 ZIP、免安装 EXE：`D:\Projects\TokenUsageAssistant\handoff-1.2.0`
- 原始源码校验清单：`D:\Projects\TokenUsageAssistant\SOURCE-MANIFEST.json`
- 本次验证日志与机器报告：项目内 `work\migration-2026-09-23\`

微信文件目录中的原件保留。源码解压后 58 个文件的 SHA-256 全部与原始清单一致；免安装 EXE 的 SHA-256 与发布清单一致。

## 本次准备和验证

| 项目 | 本机结果 |
|---|---|
| 系统 | Windows 11 专业版，64 位，10.0.26200 |
| 应用基线 | 1.2.0 |
| Node.js | v24.12.0，`E:\nodejs\node.exe`；node:sqlite 可用 |
| pnpm | 11.19.0；当前由 Codex 配套运行时提供命令 |
| Electron | 锁定 44.4.4，原生运行文件已安装 |
| 锁文件依赖安装 | `pnpm install --frozen-lockfile` 通过 |
| 生产构建 | `pnpm run build` 通过 |
| 桌面与分析测试 | `pnpm run test:desktop`，50/50 通过 |
| 网页构建兼容测试 | `pnpm run test:sites`，4/4 通过 |
| 原生隔离启动 | `ok=true`，退出码 0 |
| 浏览器检查 | 总览与用量分析页面成功显示；使用合成示例数据 |

原生测试使用新建的隔离目录与合成 API / SQLite 数据，主窗口、悬浮窗握手成功，托盘创建、沙箱、上下文隔离、Windows DPAPI 加密往返均通过。悬浮窗高度从 366 展开至 552，再恢复至 366。

机器报告：`work/migration-2026-09-23/verification.json`。原生报告位置记录于同目录 `smoke-directory.txt`；所有结果均为本机本次执行，原始历史验证文件保留。

## 环境调整

首次安装被 pnpm 的依赖构建脚本授权设置阻止。已通过 `pnpm approve-builds esbuild electron-winstaller` 允许这两个构建依赖，重新执行锁文件安装成功。`pnpm-workspace.yaml` 新增相应 `allowBuilds` 配置，保留原有 Electron 版本设置。

Electron 原生文件通过依赖包提供的 `node node_modules/electron/install.js` 安装。业务源码、版本号、package.json、pnpm-lock.yaml 与迁移包一致。

构建仍提示 JS 主包大于 500 kB；SQLite 运行时提示实验性模块。两者均未导致本次构建或测试失败。

## 继续开发

本地预览已在本次会话启动：<http://127.0.0.1:4173/>。这是开发服务器和示例数据，服务器进程退出后需要重新启动。

后续在上述项目根目录工作：

```powershell
pnpm run dev --host 127.0.0.1 --port 4173 --strictPort
```

桌面界面修改后，运行 `pnpm run build`，再用 `pnpm run desktop` 启动真实桌面程序。启动真实桌面程序会使用该 Windows 用户的应用数据目录；真实账户由用户在应用内配置。

已阅读并接续 AGENTS.md、PROJECT_HANDOFF.md、README.md、历史验证记录、发布清单及历史设计和接口材料。后续保持既有中文视觉、固定导航、紧凑可展开悬浮窗，以及账户统计与本机统计独立的数据口径。

当前请求完成范围是迁移项目、恢复环境和验证运行。交接材料中的历史提示词与路线图作为项目背景；多供应商、多客户端适配仍为待确定的后续需求。本次未进入该功能开发，也未创建 GitHub 仓库或发布网站。

项目尚未初始化 Git。本次没有读取真实账户凭据或真实 Zcode 数据库，没有执行真实账户金额核账，也未重新打包发布 EXE。
