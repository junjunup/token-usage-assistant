# 代码签名 / Code signing

[中文](#中文) · [English](#english)

## 中文

### 现状

- **Windows**：安装版 `TokenUsageAssistant-Setup-<版本>.exe` 和免安装版 `TokenUsageAssistant-Portable-<版本>.exe` **没有代码签名**。运行时 Windows 可能显示「Windows 已保护你的电脑」（SmartScreen），点「更多信息 → 仍要运行」。
- **macOS**：本机构建时只做临时（ad-hoc）签名，**没有** Apple Developer ID 签名，也**没有**公证；首次打开要到「系统设置 → 隐私与安全性」点「仍要打开」。项目目前不购买 Apple 开发者账号。
- 所以系统提示「无法验证发布者 / 开发者」是预期的，不代表文件被改过；是否被改过，请用下面的哈希核对。

### 怎样核对下载的文件

1. [安装包仓库](https://github.com/junjunup/TokenUsageAssistant/releases)的每个发布页都附有 `SHA256SUMS.txt`，列出四个安装包的 SHA256。
2. 计算你下载的文件的哈希：
   - Windows（PowerShell 或命令提示符）：`certutil -hashfile TokenUsageAssistant-Setup-<版本>.exe SHA256`
   - macOS：`shasum -a 256 TokenUsageAssistant-Mac-arm64-<版本>.dmg`
3. 与 `SHA256SUMS.txt` 中对应的一行比对，完全一致才使用。

### 安装包从哪里来

- 安装包由 GitHub Actions 的 Release 工作流从本仓库打了标签的公开源码构建（Windows 在 `windows-latest`、macOS 在 `macos-15` 上），构建时运行打包后的原生自检、核对包内版本、许可证文件和 Electron 安全开关（fuses）；发布步骤见 [RELEASING](RELEASING.md)（中文）。
- 源码仓库的 Release 附带这批安装包和核对报告；公开下载放在 [安装包仓库](https://github.com/junjunup/TokenUsageAssistant/releases)，由 Publish 工作流把源码仓库 Release 里的同一批文件原样复制过去（不重新构建），并生成 `SHA256SUMS.txt`。
- 应用读取什么、不读取什么、访问哪些地址，见 [隐私说明](PRIVACY.md)。

### 计划

- 首次正式发布之后，计划向 [SignPath Foundation](https://signpath.org/) 申请免费的开源项目代码签名（Windows）。申请由维护者本人提交；获批前本页的「现状」不变。
- 获批后会在这里写明：签名由谁提供、证书属于谁、哪些人可以批准签名、签名只用于从本仓库源码在 CI 中构建的文件。在那之前，本项目的任何文件都没有使用 SignPath 签名。
- 安装包也会提交到 winget（Windows 程序包管理器）；winget 会核对安装包的 SHA256，但这不等于代码签名。

## English

### Current state

- **Windows**: the Setup (`TokenUsageAssistant-Setup-<version>.exe`) and Portable (`TokenUsageAssistant-Portable-<version>.exe`) programs are **not code-signed**. Windows may show "Windows protected your PC" (SmartScreen); click **More info → Run anyway**.
- **macOS**: local builds are ad-hoc signed only, **without** an Apple Developer ID signature and **without** notarization; on first launch click **Open Anyway** in **System Settings → Privacy & Security**. The project does not buy an Apple developer account for now.
- An "unknown publisher / developer" warning is therefore expected and does not mean a file was altered; check the hash below for that.

### Checking a download

1. Every release in the [installer repository](https://github.com/junjunup/TokenUsageAssistant/releases) includes `SHA256SUMS.txt` with the SHA256 of the four installers.
2. Compute the hash of the file you downloaded: `certutil -hashfile <file> SHA256` on Windows, `shasum -a 256 <file>` on macOS.
3. Compare it with the matching line; use the file only if they are identical.

### Where the installers come from

- They are built by the GitHub Actions Release workflow from tagged public source in this repository (`windows-latest` and `macos-15`), with a packaged native self-test and checks of the packaged version, license files and Electron fuses; see [RELEASING](RELEASING.md) (Chinese).
- The source repository's release carries these installers and the verification reports; the Publish workflow copies the same files unchanged (no rebuild) to the [installer repository](https://github.com/junjunup/TokenUsageAssistant/releases) for public download and writes `SHA256SUMS.txt`.
- What the app reads and connects to: [Privacy](PRIVACY.md).

### Plans

- After the first stable release the maintainer plans to apply to the [SignPath Foundation](https://signpath.org/) for free open-source code signing (Windows). Until it is granted, the "current state" above stands.
- If it is granted, this page will say who provides the signature, who owns the certificate, who can approve signing, and that only files built in CI from this repository's source are signed. No file of this project has been signed through SignPath so far.
- The installer will also be submitted to winget (Windows Package Manager); winget checks the installer's SHA256, which is not code signing.
