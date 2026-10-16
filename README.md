# Token 用量助手

中文本机桌面助手（Windows x64 + Apple Silicon macOS），分两条线：一条查看 AI 编程平台的额度和余额，一条统计本机编程工具的用量。两条线各自独立，数字不相加。有托盘/菜单栏图标、置顶悬浮窗、深浅色主题；凭据只保存在本机并加密。非任何平台的官方客户端。

当前版本：**1.8.0-beta.6**（开发测试版，未签名公证）。更新历史见 [CHANGELOG.md](CHANGELOG.md)。

## 支持的平台与工具

证据等级：①合成契约测试；②打包原生 smoke（隔离样例）；③真实账户或真机验收。没有 ③ 的项，不代表已经和真实账户核对过。

| 类型 | 名称 | 方式 | 证据等级 |
|---|---|---|---|
| 平台额度 | Command Code | 官方用量接口 | ①②；Windows 上观察过真实账户快照，未与官网逐项核账 |
| 平台额度 | GLM Coding Plan（国内/国际） | 官方额度接口 | ①② |
| 平台额度 | MiniMax Token Plan（国内/国际） | 官方额度接口 | ①② |
| 平台额度 | 火山个人 Agent Plan（北京） | 官方 AFP 额度接口 | ①② |
| 按量余额 | DeepSeek 官方 | `GET /user/balance` | ①② |
| 平台额度 | OpenCode Go | `GET /zen/go/v1/usage`（三个周期的百分比） | ①② |
| 订阅额度 | ChatGPT · Codex | 本机 Codex 只读 app-server | ①②；Windows 上做过真实 Pro 只读查询；Mac 待验收 |
| 订阅额度 | Claude · Claude Code | statusLine + 本机 OTLP 组件 | ①②（无真实 Claude 账户） |
| 工具用量 | Zcode | 只读 SQLite 元数据 | ①②；Windows 上用真实数据库验证过聚合 |
| 工具用量 | OpenCode | 只读 SQLite 元数据 | ①② |
| 工具用量 | DeepSeek Harness | 可选本机插件导出（锁定 `0.1.7-rc.1`） | ①②；官方运行时测试需单独安装 |
| 工具用量 | Codex rollout、Claude 导出 | 本机文件元数据 | ①② |

Mac 版整体为 ②：真机上的安装、Keychain、托盘、睡眠唤醒、登录项等验收尚未完成。

## 安装

**Windows（x64）**：使用 `TokenUsageAssistant-Setup-<版本>.exe`（安装版）或 `TokenUsageAssistant-Portable-<版本>.exe`（免安装版）。不需要 Node.js。程序未签名。

**macOS（Apple Silicon，macOS 13+）**：
1. 打开 DMG，把「Token 用量助手」拖进「应用程序」。
2. 首次打开时，在「应用程序」中**右键 → 打开 → 打开**。因为没有 Apple Developer 账号，系统会提示「无法验证开发者」；同一版本只需确认一次。
3. 覆盖升级后，macOS 可能会弹出 Keychain 授权，请选「始终允许」。

详见 [Mac 安装说明](docs/MAC-APP-1.8.0-beta.5.md)。历史安装包存放在仓库外的 `~/Documents/TokenUsageAssistant-releases/`。

## 使用要点

1. 在「账户与设置」添加平台账户，最多 20 个，各自独立刷新和提醒。凭据只在应用内配置，不要发到聊天中。
2. 在「工具数据源」连接本机用量来源（Zcode、OpenCode、Harness、Codex、Claude）。
3. 在「用量分析」中按时间、模型、项目、会话筛选；模型单价可分别配置 USD / CNY。
4. 在总览可以开启悬浮窗，点击展开更多数据。关闭主窗口后继续驻留托盘/菜单栏。默认每 60 秒刷新一次。

## 数据口径摘要

- 缺失显示「—」，不显示 0；`resetAt=0` 显示「未启用」，不编造倒计时。
- 平台额度和工具用量不相加。工具记录默认不归属任何账户，只有用户确认的关联规则才会归属。
- USD 与 CNY 分开，不换汇；余额差不当作消费；本机费用只是按单价估算，不是账单。
- 工具采用「已报告用量」：失败或取消的请求如果报告了用量，也会计入；缓存和推理子项不重复计入总量。
- 覆盖范围不足时不做对比，也不给出误差率。
- 不读取对话正文、提示词、回复、工具内容或凭据；第三方数据库只读。

完整规则见 [AGENTS.md](AGENTS.md)。

## 开发

环境：Node 24.x、pnpm 11.19.0、Electron 44.4.4（依赖锁定在 `pnpm-lock.yaml`）。

```bash
pnpm install
pnpm run test:desktop      # 桌面与分析测试（当前基线 246 通过 / 0 失败 / 3 跳过）
pnpm run lint              # ESLint
pnpm run format:check      # Prettier 检查（pnpm run format 自动格式化）
pnpm run build             # 构建 dist/client（改动界面后必须重新构建）
pnpm run dev               # 浏览器预览模式（使用示例数据）
```

- **原生 smoke**：`pnpm exec electron . --smoke-test --test-directory="$(mktemp -d)"`，必须使用新建的隔离目录。
- **Mac 开发版数据隔离**：`pnpm run desktop`（未打包的开发版）使用独立的数据目录 `~/Library/Application Support/TokenUsageAssistant-Dev` 和独立的 Keychain 条目 `TokenUsageAssistant-Dev Safe Storage`，不读写打包版的真实数据，第一次运行需要重新连接测试账户。打包版仍使用 `TokenUsageAssistant`。
- **Mac 打包**（只能在 arm64 Mac 本机进行）：先运行 `scripts/Build-Mac-App.command`，再运行 `scripts/Verify-Mac-Native.command`，校验签名并跑打包后的 smoke。
- **Windows 打包**：`pnpm exec electron-builder --win --x64 --config.electronDist=node_modules/electron/dist`
- **生成文件**：`src/generated/` 由 `scripts/prepare-analytics-preview.mjs` 生成，要改就改 `desktop/` 下对应的纯模块。
- **Harness 测试**：完整测试需要设置 `TUA_HARNESS_CONTRACT_RUNTIME` 和 `TUA_HARNESS_CLI_RUNTIME`，指向隔离安装的官方测试运行时，步骤见[插件说明](integrations/deepseek-harness/README.md)。没有设置时测试会跳过，跳过不算通过。

## 文档索引

| 文档 | 内容 |
|---|---|
| [AGENTS.md](AGENTS.md) | 长期有效的项目规则（数据语义、隐私、契约、交付、UI、测试） |
| [IMPROVEMENT_PLAN.md](IMPROVEMENT_PLAN.md) | 当前改进计划、用户决策、执行记录 |
| [PROJECT_HANDOFF.md](PROJECT_HANDOFF.md) | 当前状态快照：证据等级、模块结构、存储、未完成验收项 |
| [CHANGELOG.md](CHANGELOG.md) | 版本历史 |
| [docs/island-1.9.0-design/HANDOFF.md](docs/island-1.9.0-design/HANDOFF.md) | Mac 刘海灵动岛设计交接 |
| `docs/*-<版本>.md`、`docs/verification-<版本>/` | 各版本的专题说明和验证记录 |
| [docs/history/](docs/history/) | 归档的旧版 AGENTS、README、交接文档和规则迁移表 |
