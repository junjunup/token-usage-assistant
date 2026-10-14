# Token 用量助手 1.8.0-beta.4 · Mac 全量试用包

本版修复侧栏 Logo 居中和 Windows 任务栏图标；沿用已确认的刻度环和原 UI，保留 Mac Codex 连接修复。

适用 Apple Silicon（M 系列）和 macOS 13+。包含完整应用与原版 Electron 44.4.4 ARM64 运行环境，无需旧包或另行下载 Node。

1. 完全退出旧版助手，将 ZIP 解压到一个新的固定文件夹。
2. 双击 Start-Mac-Trial.command；若被作为文本打开，可在终端用 /bin/bash 执行该脚本。
3. 微信传包后若仍提示 Electron 已损坏，使用同目录 Repair-Mac-Trial.command。它延续上一版支持逻辑，先校验此版本的固定哈希、保留旧运行目录再重建，仅处理这份 Electron 的下载隔离属性。
4. 核对应用内版本 1.8.0-beta.4，启动后 Dock、菜单栏及悬浮窗使用刻度环。试用包内原版 Electron.app 的 Finder 图标未改写。

新版沿用 ~/Library/Application Support/TokenUsageAssistant 中的账户和设置，不需要迁移凭据。保留旧包供回退。

Mac 包使用与 Windows 相同、已校验的应用 ASAR；官方运行环境未改写。脚本语法、平台防误用、文件哈希及 ZIP 执行权限已检查。未在 Mac 实机验证新图标和连接；仍属于开发试用包，未完成独立应用签名和公证。Check-Mac-Trial.command 可执行隔离样例自检。
