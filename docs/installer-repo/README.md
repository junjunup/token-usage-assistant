# Token 用量助手 · 安装包

**中文** · [English](#english)

**一个本机桌面小工具：同时看清 AI 编程平台的剩余额度，和你本机编程工具实际用掉的 Token。** 支持 Windows x64 与 Apple Silicon macOS；凭据只保存在本机并加密，没有服务器、不收集遥测、不调用任何模型。非任何平台的官方客户端。

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/junjunup/token-usage-assistant/main/docs/readme/overview-dark.png">
  <img src="https://raw.githubusercontent.com/junjunup/token-usage-assistant/main/docs/readme/overview-light.png" alt="用量总览：月度套餐额度、5 小时额度窗口、今日 Token（示例数据）" width="900">
</picture>

<sub>截图使用应用内置的示例数据，不是真实账户。</sub>

本仓库只发布安装包，不含源码。源码、支持的平台与验证等级、数据口径见 **[源码仓库](https://github.com/junjunup/token-usage-assistant)**。

## 下载

在 **[Releases](https://github.com/junjunup/TokenUsageAssistant/releases)** 下载：

- **Windows（x64）**：安装版 `TokenUsageAssistant-Setup-<版本>.exe` 或便携版 `TokenUsageAssistant-Portable-<版本>.exe`，不需要 Node.js。程序未签名，如果看到「Windows 已保护你的电脑」，点「更多信息 → 仍要运行」。
- **macOS（Apple Silicon，macOS 13+）**：DMG 或 ZIP，把「Token 用量助手」拖进「应用程序」。ad-hoc 签名、未公证：首次打开时弹窗里没有「打开」按钮，关掉提示，到「系统设置 → 隐私与安全性」点「仍要打开」。同一版本只需操作一次；升级后可能弹一次钥匙串授权。

每个版本附带 `SHA256SUMS.txt`，下载后可以核对。完整步骤、升级与常见问题见 [安装与升级](https://github.com/junjunup/token-usage-assistant/blob/main/docs/INSTALL.md)。

当前为测试版。已安装的客户端「检查更新」只读取本仓库的 Releases，不会自动下载或安装。

## 隐私

- 只调用固定的官方**只读**接口；不读取、不导出对话正文、提示词、回复、工具内容或凭据；第三方数据库只读。
- 凭据只在应用里由你自己填写，用系统能力加密保存（Windows DPAPI、macOS 钥匙串）。
- 没有服务器、没有遥测。逐项说明见 [隐私说明](https://github.com/junjunup/token-usage-assistant/blob/main/docs/PRIVACY.md)。

问题与建议请到源码仓库[提 issue](https://github.com/junjunup/token-usage-assistant/issues/new/choose)；安全问题请按 [SECURITY.md](https://github.com/junjunup/token-usage-assistant/blob/main/SECURITY.md) 私下报告。

---

## English

**A small local desktop app that shows, side by side, how much quota you have left on AI coding platforms and how many tokens your local coding tools actually used.** For Windows x64 and Apple Silicon macOS. Credentials stay on your machine, encrypted; no server, no telemetry, no model calls. Not an official client of any platform.

> **The interface is Chinese only for now.**

This repository only publishes installers; it has no source. Source code, supported platforms with verification levels, and how numbers are counted: **[source repository](https://github.com/junjunup/token-usage-assistant/blob/main/README.en.md)**.

### Download

From **[Releases](https://github.com/junjunup/TokenUsageAssistant/releases)**:

- **Windows (x64)**: `TokenUsageAssistant-Setup-<version>.exe` or `TokenUsageAssistant-Portable-<version>.exe`; no Node.js needed. The program is unsigned; if you see "Windows protected your PC", click **More info → Run anyway**.
- **macOS (Apple Silicon, macOS 13+)**: DMG or ZIP; drag "Token 用量助手" into Applications. Ad-hoc signed, not notarized: on first launch the dialog has no Open button; close it, then click **Open Anyway** in **System Settings → Privacy & Security**. Once per version; an upgrade may ask for Keychain access once.

Each release includes `SHA256SUMS.txt` for checking downloads. Full steps, upgrades and FAQ: [Install and upgrade](https://github.com/junjunup/token-usage-assistant/blob/main/docs/INSTALL.md#english).

These are beta releases. "Check for updates" in the app only reads this repository's Releases; it never downloads or installs anything by itself.

### Privacy

- Only fixed, official **read-only** APIs are called. Conversation text, prompts, replies, tool content and credentials are never read or exported; third-party databases are opened read-only.
- You enter credentials in the app yourself; they are encrypted with the system's facilities (Windows DPAPI, macOS Keychain).
- No server and no telemetry. Details: [Privacy](https://github.com/junjunup/token-usage-assistant/blob/main/docs/PRIVACY.md#english).

Issues and suggestions: [open an issue](https://github.com/junjunup/token-usage-assistant/issues/new/choose) in the source repository. Report security issues privately as described in [SECURITY.md](https://github.com/junjunup/token-usage-assistant/blob/main/SECURITY.md).
