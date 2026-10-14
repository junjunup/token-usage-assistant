# Token 用量助手 1.8.0-beta.5 · Mac 安装说明（本机 .app + DMG）

适用 Apple Silicon（M 系列）和 macOS 13+。此交付由 arm64 Mac 本机 electron-builder 构建：真实的 `Token 用量助手.app`，ad-hoc 本机签名（hardened runtime + 最小 entitlements），**未做 Developer ID 签名与公证**。

## 交付物

`release-v1.8.0-beta.5` 目录：

- `TokenUsageAssistant-Mac-arm64-1.8.0-beta.5.dmg`：正常安装用。
- `TokenUsageAssistant-Mac-arm64-1.8.0-beta.5.zip`：`.app` 打包，便于微信等渠道传输。
- `mac-arm64/Token 用量助手.app`：构建机上的未打包目录形态。

## 安装步骤

1. 挂载 DMG，把 **Token 用量助手** 拖入「应用程序」文件夹。
2. **首次打开**：在「应用程序」中**右键点击 → 打开 → 再点「打开」确认**。这是无 Apple Developer 账号时的必要一步，macOS 会提示「无法验证开发者」，属于正常现象。
3. 该确认每次版本只需一次：Gatekeeper 按 cdhash 记住放行结果，同版本重新安装无需重复；换新版本需要再做一次。

## 明确不再需要修复脚本

旧的 `Start-Mac-Trial.command` / `Check-Mac-Trial.command` / `Repair-Mac-Trial-*.command` 全部作废并已从源码移除。新包自带完整 bundle 签名与 `CodeResources` seal，不存在「应用已损坏」问题；右键打开一次后直接双击使用。

## 数据沿用

应用继续使用 `~/Library/Application Support/TokenUsageAssistant` 作为数据目录。旧试用包、旧版本创建的账户、设置与工具来源自动沿用，**无需迁移**。包内已通过源码与隔离 smoke 确认该路径（`docs/verification-1.8.0-beta.5/mac-app-integrity.json`）。

## 验证与证据

`scripts/Verify-Mac-Native.command` 在本机执行七项检查并落盘 `docs/verification-1.8.0-beta.5/mac-app-integrity.json`：

1. `codesign --verify --deep --strict` 必须通过（核心断言）。
2. `Contents/_CodeSignature/CodeResources` 存在，签名为 ad-hoc。
3. entitlements 含 `allow-jit` 与 `disable-library-validation`（仅此两项，不扩大权限面）。
4. `Info.plist`：`CFBundleIdentifier=local.commandcode.tokenusageassistant`、图标与版本一致。
5. 原生 smoke：打包后的应用在隔离目录运行 `--smoke-test --test-directory=...`，`ok: true`。
6. 默认 userData 仍为 `~/Library/Application Support/TokenUsageAssistant`。
7. `spctl -a -vvv -t exec` 预期 **rejected**（未公证），如实记录，不判通过。

构建入口：`scripts/Build-Mac-App.command`（仅 arm64 Mac 本机；不复制 Windows node_modules）。

## 诚实边界（仍未验收）

- **签名与公证**：ad-hoc 临时签名不是 Developer ID 签名；未公证。拿到 Apple Developer Program 账号后，用 `CSC_LINK` + `notarize: true` + staple 才能达到拖入即用、零提示（DMG 形态不变，配置位置已预留）。
- **真实账户与工具**：Go 真实订阅、OpenCode 真实使用、真实 Codex/Claude 连接在 Mac 实机上的核账仍未完成。
- **Mac 实机行为**：安装、升级、休眠唤醒、Keychain 提示、登录项、菜单栏/窗口行为均未在真实用户 Mac 上长期验收。
- 本包不是正式签名的发布版，不承诺绕过 Gatekeeper 的任何安全机制。

## 与旧 Full-*.zip 的关系

`TokenUsageAssistant-Mac-arm64-Full-1.8.0-beta.5.zip` 及更早的试用包是历史记录，保留供回退，但**已被本 DMG/ZIP 取代**：不要再使用旧包附带的 Repair/Start 脚本。历史文档（`docs/MAC-TRIAL-*`、`docs/MAC-FULL-*`）保留原样，顶部已加指向说明。
