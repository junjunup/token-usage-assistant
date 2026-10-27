# 安装与升级 / Install and upgrade

[中文](#中文) · [English](#english)

## 中文

安装包在 [安装包仓库的 Releases](https://github.com/junjunup/TokenUsageAssistant/releases)。当前是测试版，界面只有中文。

### macOS（Apple Silicon，macOS 13 及以上）

1. 下载 `TokenUsageAssistant-Mac-arm64-<版本>.dmg`，打开后把「Token 用量助手」拖进「应用程序」。
2. **第一次打开**：双击后系统提示无法验证开发者，弹窗里**没有「打开」按钮**。先关掉提示，打开**「系统设置 → 隐私与安全性」**，在页面下方找到这个应用，点**「仍要打开」**并按提示确认。每个版本只需要一次。（2026-10-25 在 macOS 15.7.9 上实测；「右键 → 打开」在这个系统上放行不了。）
3. **升级**：下载新版 DMG，同样拖进「应用程序」并替换旧版，再按第 2 步放行一次。第一次读取已保存的密钥时会弹出**钥匙串授权**，输入 Mac 登录密码后点**「始终允许」**。账户、设置和历史都会保留。

为什么每次升级都要放行和授权：应用没有 Apple 的开发者签名，系统把每个新版本当成新程序。这是已知限制，不影响功能。

### Windows（x64）

- **安装版** `TokenUsageAssistant-Setup-<版本>.exe`：按向导安装，可选安装位置，会建桌面和开始菜单快捷方式。升级时直接运行新版安装包覆盖安装。
- **免安装版** `TokenUsageAssistant-Portable-<版本>.exe`：直接运行，不写入安装目录。
- 程序没有代码签名。运行时 Windows 可能提示「Windows 已保护你的电脑」，点**「更多信息」→「仍要运行」**。（**此步骤未在 Windows 真机上实测**，如果你看到的不一样，欢迎开 issue 告诉我们。）

### 核对下载的文件

每个版本都附 `SHA256SUMS.txt`。在终端里算出文件的 SHA256，和其中对应的一行比对：

```bash
shasum -a 256 TokenUsageAssistant-Mac-arm64-<版本>.dmg
```

Windows 可用：`certutil -hashfile TokenUsageAssistant-Setup-<版本>.exe SHA256`

### 常见问题

**为什么没有签名？安全吗？** 签名需要付费的开发者证书，目前没有购买。应用是开源的（MIT），安装包由 GitHub Actions 从公开的源码构建，哈希可以对照 `SHA256SUMS.txt`。应用读什么、不读什么、联网访问哪里，见 [隐私说明](PRIVACY.md)。

**会自动更新吗？** 不会。应用启动时和每 24 小时检查一次新版本，有新版时提示你，由你下载安装（可在「账户与设置」里关闭检查）。

**数据存在哪？** 全部在本机，见 [隐私说明](PRIVACY.md#数据存在哪)。

**怎么卸载干净？**
- macOS：退出应用，把「应用程序」里的「Token 用量助手」移到废纸篓，再删除 `~/Library/Application Support/TokenUsageAssistant/`。钥匙串里名为 `TokenUsageAssistant Safe Storage` 的条目也可以在「钥匙串访问」里删除。
- Windows：安装版在「设置 → 应用」里卸载，免安装版直接删除 exe；再删除 `%APPDATA%` 下本应用的文件夹。
- 用过 DeepSeek Harness 插件的，另删 `~/.token-usage-assistant/`，并在 Harness 中卸载插件。

**遇到问题怎么反馈？** 用 [issue 模板](https://github.com/junjunup/token-usage-assistant/issues/new/choose) 提交；可以附「账户与设置 → 导出诊断信息」（不含密钥和对话内容，保存前可完整预览）。

---

## English

Installers are on the [installer repository's Releases](https://github.com/junjunup/TokenUsageAssistant/releases). These are beta builds; the interface is Chinese only.

### macOS (Apple Silicon, macOS 13+)

1. Download `TokenUsageAssistant-Mac-arm64-<version>.dmg`, open it and drag "Token 用量助手" into Applications.
2. **First launch**: macOS says the developer cannot be verified and the dialog has **no Open button**. Close it, go to **System Settings → Privacy & Security**, find the app near the bottom and click **Open Anyway**, then confirm. Once per version. (Tested on macOS 15.7.9 on 2026-10-25; right-click → Open does not work there.)
3. **Upgrade**: drag the new version into Applications to replace the old one and allow it once more as in step 2. When it first reads your saved keys, a **Keychain** prompt appears: enter your Mac login password and click **Always Allow**. Accounts, settings and history are kept.

Why every upgrade asks again: the app has no Apple developer signature, so macOS treats each version as a new program. This is a known limitation and does not affect functionality.

### Windows (x64)

- **Setup** `TokenUsageAssistant-Setup-<version>.exe`: installer with a choice of folder and shortcuts; run a newer Setup to upgrade in place.
- **Portable** `TokenUsageAssistant-Portable-<version>.exe`: runs without installing.
- The program is not code-signed. Windows may show "Windows protected your PC"; click **More info → Run anyway**. (**Not yet tested on a real Windows machine** — please open an issue if you see something different.)

### Verify the download

Each release includes `SHA256SUMS.txt`. Compute the file's SHA256 and compare it with the matching line: `shasum -a 256 <file>` on macOS, `certutil -hashfile <file> SHA256` on Windows.

### FAQ

**Why unsigned? Is it safe?** Signing requires paid developer certificates, which the project does not have yet. The app is open source (MIT); installers are built from the public source by GitHub Actions, and their hashes are listed in `SHA256SUMS.txt`. What the app reads and connects to is described in [Privacy](PRIVACY.md).

**Does it update itself?** No. It checks for new versions at start and every 24 hours and tells you; you download and install (the check can be turned off in settings).

**How do I remove it completely?** macOS: quit, move the app to the Trash, delete `~/Library/Application Support/TokenUsageAssistant/`, and optionally the `TokenUsageAssistant Safe Storage` item in Keychain Access. Windows: uninstall Setup in Settings → Apps (or delete the Portable exe) and delete the app's folder under `%APPDATA%`. If you used the DeepSeek Harness plugin, also delete `~/.token-usage-assistant/` and remove the plugin in Harness.

**How do I report a problem?** Use the [issue templates](https://github.com/junjunup/token-usage-assistant/issues/new/choose); you can attach the diagnostics export (no keys or conversation content, previewed before saving).
