# Token 用量助手 1.8.0-beta.2 · Mac 全量修复包

适用 Apple Silicon（M 系列），macOS 13 或更高版本。包含修复后的完整应用与官方 Electron 44.4.4 ARM64 运行环境，无需旧包、Node 或 pnpm。

## 使用方法

1. 完全退出旧的用量助手（Command-Q 或菜单中的退出）。
2. 将本 ZIP 完整发送到 Mac，解压到一个新的固定文件夹，保留包内所有文件。
3. 双击 Start-Mac-Trial.command 启动。若被当作文本打开，可在终端输入 /bin/bash 和一个空格，将脚本拖入终端，再回车。
4. 如果再次提示“Electron 已损坏”，取消该提示，双击同目录的 Repair-Mac-Trial.command。它会校验应用和运行环境、备份旧运行目录、重新解压，并只处理这份 Electron 的下载隔离标记，然后启动助手。后续仍使用 Start-Mac-Trial.command。
5. 官方 Codex 桌面端应已登录 ChatGPT。在助手点击“连接本机 Codex”；已有连接使用“更新连接”。若弹出程序选择框，选择官方 Codex.app（通常在“应用程序”），无需展开包内容，不要选择 .codex 配置目录。
6. 确认助手内版本为 1.8.0-beta.2，并检查是否显示套餐额度。若仍失败，反馈新的完整错误文字即可。

应用沿用 ~/Library/Application Support/TokenUsageAssistant 保存的账户和设置，不需要复制旧包中的应用文件、Windows 凭据或对话记录。请保留旧包，直到新版在 Mac 验证成功。

## 本次修复与验证

诊断发现 Homebrew Codex CLI 0.39.0 在约 49 毫秒内因启动参数不兼容退出，被旧版助手误报为超时。新版增加初始化预检、其他已知程序回退、直接选择 Codex.app，并区分启动失败、协议不兼容、进程退出与分阶段超时。不会自动安装或升级 Codex / Homebrew。

234 项桌面测试、4 项兼容测试、最终 Windows 发布包检查、27 项升级保留检查已通过。全量包使用同一个已测 ASAR；新增启动支持脚本已核对固定哈希、Bash 语法、非 Mac 提前退出、ZIP 文件完整性和执行权限。

真实 Mac 的连接、钥匙串、菜单栏、休眠恢复与安装等仍待测试；没有新增长期稳定性测试。本包仍是开发试运行版，没有完成独立 Mac 应用的 Developer ID 签名和公证，登录自动启动在此运行模式禁用。启动修复不关闭全局 Gatekeeper、不使用 sudo、不修改官方二进制，也不处理用户凭据。
