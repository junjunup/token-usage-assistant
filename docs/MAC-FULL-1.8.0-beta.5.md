# Token 用量助手 1.8.0-beta.5 · Mac 全量试用包

> **本包已被取代（2026-09-30）**：Mac 交付改由本机 electron-builder 产出的真实 `Token 用量助手.app` + DMG/ZIP（`TokenUsageAssistant-Mac-arm64-1.8.0-beta.5.dmg/.zip`），不再使用手工拼装 ZIP 与修复脚本。见 `docs/MAC-APP-1.8.0-beta.5.md` 与 `docs/MAC-APP-PLAN-1.8.0-beta.5.md`。本文保留为历史记录。

本版新增 OpenCode Go 官方额度和独立 OpenCode 本机统计，沿用已确认的刻度环、原 UI 和 Mac Codex 连接修复。

适用 Apple Silicon（M 系列）和 macOS 13+。包含完整应用与原版 Electron 44.4.4 ARM64 运行环境，无需旧包或另行下载 Node。

1. 完全退出旧版助手，将 ZIP 解压到一个新的固定文件夹。
2. 双击 Start-Mac-Trial.command；若被作为文本打开，可在终端用 /bin/bash 执行该脚本。
3. 微信传包后若仍提示 Electron 已损坏，使用同目录 Repair-Mac-Trial.command。它延续上一版支持逻辑，先校验此版本的固定哈希、保留旧运行目录再重建，仅处理这份 Electron 的下载隔离属性。
4. 核对应用内版本 1.8.0-beta.5。在账户与设置中选择 OpenCode · Go 添加密钥；工具数据源中选择 OpenCode 和 opencode.db。试用包内原版 Electron.app 的 Finder 图标未改写。

新版沿用 ~/Library/Application Support/TokenUsageAssistant 中的账户和设置，不需要迁移凭据。保留旧包供回退。

Mac 包使用与 Windows 相同、已校验的应用 ASAR；官方运行环境未改写。脚本语法、平台防误用、文件哈希及 ZIP 执行权限已检查。Go 真实订阅、OpenCode 真实使用及 Mac 实机连接均未验收；仍属于开发试用包，未完成独立应用签名和公证。Check-Mac-Trial.command 可执行隔离样例自检。
