> 当前开发版 **1.8.0-beta.5**：新增 OpenCode Go 官方额度和 OpenCode 本机用量统计，保留现有 UI、刻度环及 beta.4 的任务栏修复。入口、统计边界与全套餐后续计划见 [OpenCode 说明](docs/OPENCODE-1.8.0-beta.5.md)，交付位于 `release-v1.8.0-beta.5`。Mac 交付改走本机构建的真实 `.app` + DMG（见 [Mac 安装说明](docs/MAC-APP-1.8.0-beta.5.md)）。Go 真实账户、OpenCode 真实使用及 Mac 实机验收未完成。以下为历史记录。

> **1.8.0-beta.4**：修复侧栏 Logo 偏移与 Windows 任务栏图标，见 [修复记录](docs/BRAND-FIX-1.8.0-beta.4.md)。旧交付仍保留。

> 当前版本 **1.7.0**：阶段 4 人工账户归组、工具关联和核对依据。入口及限制见 [使用与验证说明](docs/ACCOUNT-ASSOCIATION-1.7.0.md)，验证见 `docs/verification-1.7.0`。下方均为保留的历史说明。

> 当前版本 **1.6.0**：阶段 3 DeepSeek 官方按量余额。参见 [使用与验证说明](docs/DEEPSEEK-BALANCE-1.6.0.md)。以下为历史版本说明。

> 当前版本 **1.5.1**：Codex 自动发现配置、应用内多配置选择、额度与工具来源分开显示状态。参见 [使用与验证说明](docs/CONNECTION-UX-1.5.1.md)。历史版本信息保留如下。

> 当前桌面开发版本为 **1.5.0**。ChatGPT / Codex、Claude / Claude Code 的订阅入口、采集方式和限制见 [1.5.0 使用说明](docs/SUBSCRIPTIONS-1.5.0.md)，交接以 PROJECT_HANDOFF.md 的新增订阅里程碑为准。下方保留原版本说明。

# Token 用量助手 · Windows 1.4.1

独立的本机桌面助手：一条线查看平台额度与接口汇总，一条线统计编程工具用量。保持 Geist 字体、细线、绿色额度条、紫色 Token、深浅色、托盘与悬浮窗。

1.4.1 修复悬浮窗展开后收起不能回到原底边的问题。1.4.0 实现的**阶段 1、2**功能保持不变；完整支持范围、统计口径、验证边界见 [1.4.0 交付说明](docs/TOOL-SOURCES-1.4.0.md)。接续开发先读 [交接文档](PROJECT_HANDOFF.md)。

## 使用

`release-v1.4.1` 提供：

- `TokenUsageAssistant-Portable-1.4.1.exe`：免安装版。
- `TokenUsageAssistant-Setup-1.4.1.exe`：安装版。

两个 EXE 的版本和载荷一致性记录见 [1.4.1 包校验](docs/verification-1.4.1/package-integrity.json)。

目标 Windows x64，当前验证环境为 Windows 11。运行程序不需要 Node.js。仍是本地开发版本，未对外发布或签名。

1. 在“账户与设置”添加平台账户。Command Code、GLM 国内/国际、MiniMax 国内/国际、火山个人 Agent Plan 北京继续支持；最多 20 个账户独立刷新与提醒。凭据仅在应用内配置，无需发到聊天。
2. 在独立的“工具数据源”区域连接用量文件。旧 Zcode 选择自动保留；也可新增来源、改名、更换位置、启停、同步或移除。
3. Harness 使用随附的[本地统计插件](integrations/deepseek-harness/README.md)，目前锁定官方 `dsh 0.1.7-rc.1`。插件启用后选择导出目录中的 `usage.jsonl`，不读取原始历史会话。
4. 在“用量分析 → 工具分析”选择一个或多个来源，再按时间、模型、项目或会话筛选。模型排行可配置 USD / CNY 单价。
5. 总览可开启悬浮窗；点击展开更多数据。关闭面板继续驻留托盘，右键托盘退出。默认每 60 秒刷新。

## 数据口径

- 平台额度、账户汇总与本机工具明细独立，不能相加；工具记录不会归到当前选中账户。
- 工具采用“已报告用量”：失败和取消时明确返回的用量也计入。成功率与完成请求均值单独计算。
- 缓存与推理子分类不重复加进总量。缺失字段保持未知，并显示覆盖范围与已知部分。
- 本机费用是用户单价估算，不是账单。旧价格沿用 USD；币种分别保留，不换汇。
- 工具尚未关联账户，所以本账期不可用；覆盖不足时不计算虚假的对比误差。
- 相同尝试的流式/最终值更新替换，重试独立。重复扫描与重启不重复计数；副本重叠会明确提示。

## 存储与升级

账户密钥继续使用 Windows DPAPI 加密；设置和窗口位置保留，工具不读取提示词、回复、工具结果或凭据。Zcode SQLite 只读；Harness 导出只读，助手仅更新自己的元数据索引。

继续使用原 Electron userData。新增 `tool-sources.json`、`tool-source-status.json`、`tool-usage.sqlite`；旧 `local-source.json` 保留供回退。DPAPI 文件绑定当前 Windows 用户，不应作为跨电脑密钥备份。不要把实际用户数据打入源码包。

首批平台的真实套餐核账仍待账户可用；样例和真实环境验收分别记录。安装程序生成不等于已完成安装覆盖升级或系统重启测试。详见 [验证说明](docs/TOOL-SOURCES-1.4.0.md)。

## 开发与验证

Node 24.12.0、pnpm 11.19.0、Electron 44.4.4；依赖锁定于 `pnpm-lock.yaml`。

```powershell
pnpm install
pnpm run test:desktop
pnpm run build
pnpm run test:sites
pnpm run desktop
pnpm exec electron-builder --win --x64 --config.electronDist=node_modules/electron/dist
```

Mac 构建只在 arm64 macOS 本机进行：运行 `scripts/Build-Mac-App.command`（构建 .app + DMG + ZIP），随后 `scripts/Verify-Mac-Native.command` 校验签名与原生 smoke；见 [Mac 安装说明](docs/MAC-APP-1.8.0-beta.5.md)。

桌面应用使用 `dist/client`，改动界面后需要重新构建。`src/generated` 由 `scripts/prepare-analytics-preview.mjs` 生成，应编辑 desktop 中对应纯模块。

Harness 官方发布包与 CLI 的完整验证需单独安装隔离测试运行时，步骤见插件 README。普通测试明确报告未安装运行时导致的跳过，不应把跳过视为完成。所有测试使用隔离目录，不读取用户真实账户。

- `tests/tool-analytics.test.cjs`：计数、分类、状态、币种、过滤、来源隔离。
- `tests/tool-sources.test.cjs`：迁移、实际 exporter → reader、去重、异常隔离、隐私、十万条、取消与恢复。
- `tests/harness-plugin.test.cjs`：插件与官方事件/CLI 契约、重试、分叉、多进程及隐私。
- `scripts/verify-upgrade-native.cjs`：实际旧版/新版 ASAR 与 Windows DPAPI 的隔离迁移验证。
- `scripts/soak-tools.cjs`：实际墙钟两小时的合成双工具/多账户持续测试。
- `docs/verification-1.4.0`：构建、测试、原生与发布验证记录。

保留 Sites 兼容文件只是构建兼容，不代表已经公开部署。历史版本资料见 `docs/README-1.3.0-history.md`、`docs/PROJECT_HANDOFF-1.3.0-history.md` 和 `docs/PROVIDER-ADAPTATION-1.3.0.md`。

## 后续范围

下一阶段首先接 DeepSeek 官方余额接口，再做账户关联/可比数据核对。Windows 数据链稳定后适配 Apple Silicon macOS，之后评估第三方中转。云同步、对话正文采集、请求代理、Intel Mac、Linux 和任意中转地址不在本版范围。
