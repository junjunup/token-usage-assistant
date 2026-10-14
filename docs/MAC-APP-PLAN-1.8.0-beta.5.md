# Mac 打包链路修复实施方案（1.8.0-beta.5 原位修复）

> 本文件是跨机器交接用的实施方案。目标：把 Mac 交付物从「手工拼装 ZIP + 修复脚本」改为本机 electron-builder 产出的**真实 `.app` + DMG**，彻底消除「应用已损坏，需要修复脚本」。
>
> 实施前先读 `AGENTS.md`、`PROJECT_HANDOFF.md`。本方案与 `AGENTS.md` 中 2026-09-24「Stage 5 Mac trial」条目冲突的部分，以本方案为准（该条目需在本方案实施时同步标注被取代）。

---

## 1. 问题根因（已核实）

当前交付的 `TokenUsageAssistant-Mac-arm64-Full-1.8.0-beta.5.zip` **不是一个 Mac 应用包**，而是手工拼装的数据 ZIP，由 `scripts/deliver-opencode-beta5.py:32-68` 生成，内容仅 5 类：

| 内容 | 状态 |
|---|---|
| `app.asar` | 应用代码，无签名、无 seal |
| `electron-v44.4.4-darwin-arm64.zip` | Electron 官方运行时 ZIP，**上游仅 ad-hoc 签名，顶层无 `CodeResources` seal** |
| `Start-Mac-Trial.command` | 实际执行 `Electron <path>/app.asar` |
| `Check-Mac-Trial.command` | 上者的 `--self-test` 包装 |
| `Repair-Mac-Trial-*.command` | 唯一作用：`xattr -d com.apple.quarantine` |

故障链：

1. 没有 `.app`、没有 `Info.plist`、没有 `CFBundleIdentifier`、没有图标 → macOS 提示写的是「**Electron** 已损坏」，不是「Token 用量助手」。
2. 微信传输打上 `com.apple.quarantine`，`ditto -xk`（`scripts/Start-Mac-Trial.command:14`）把隔离标记传播到整棵解压树。
3. 上游 Electron 是 ad-hoc 签名且顶层无 `CodeResources` seal → Gatekeeper 判定「已损坏」；系统设置里的「仍要打开」拦不住（那只放行单个文件，不放行整棵目录树）。
4. `Start-Mac-Trial.command` **没有任何 `xattr` 调用**，所以 `Repair-*.command` 在隔离传输下是必经步骤；它钉死 `app.asar` 哈希，故每个版本必须重新生成（仓库已堆 4 份，beta.2/3/4/5）。

关键佐证：`docs/MAC-STARTUP-1.8.0-beta.1.md` 记录官方 Electron 44.4.4 ARM64 主 Mach-O 的 CodeDirectory `flags=0x20002`（含 ad-hoc 位）、无 CMS 证书签名、顶层 App 无 `CodeResources`。

另：`electron-builder.yml:35-41` 其实已配真实 mac target，但从未用于交付；`electron-builder.mac-test.yml` 的 `identity: "-"` + `hardenedRuntime` 方向正确，只是没人拿它出包。

---

## 2. 目标与边界

**目标**：本机 electron-builder 直接产出**完整 ad-hoc 签名、带 `CodeResources` seal** 的 `Token 用量助手.app` + DMG，消除「应用已损坏」和一切修复脚本。

**诚实边界（必须写进交付文档，不得含糊）**：
- 没有 Apple Developer Program 账号 → **无法**做到零提示双击启动。用户首次仍需 **右键 → 打开 → 确认打开**（一次性，Gatekeeper 按 cdhash 记住；同版本重装无需再做）。
- 本方案**不能**消除「无法验证开发者」提示本身，只能消除「应用已损坏 + 修复脚本」这一类。
- 只有拿到账号后，用 `CSC_LINK` + `notarize: true` + `afterSign: stapler staple` 才能到零提示。本方案已为其预留配置位置，届时 DMG 形态不变。

**版本决策（用户已确认）**：**保持 `1.8.0-beta.5`，不升 beta.6**。

理由：
- `scripts/verify-package-beta5.cjs:18/20`、`scripts/verify-opencode-package-beta5.ps1`、交付脚本、`docs/verification-1.8.0-beta.5/*` 全部钉死 beta.5。
- Windows 产物无法在 Mac 上构建，升版会留下「源码 beta.6 / Windows 包 beta.5」的不一致，违反 `AGENTS.md` 的交付一致性要求。
- 新 DMG 与旧 `Full-*.zip` 并存，由文档注明替代关系；旧包保留供回退。

---

## 3. 实施步骤

### 3.1 构建配置

**`electron-builder.yml`** — 只改 `mac:` 段，其余（`appId`、`productName`、`executableName`、`directories.output`、`files`、`asar`、`win`、`nsis`、`portable`）**全部不动**：

```yaml
mac:
  icon: desktop/assets/app.icns
  category: public.app-category.developer-tools
  minimumSystemVersion: "13.0"
  target:
    - target: dmg
      arch: [arm64]
    - target: zip
      arch: [arm64]
  artifactName: TokenUsageAssistant-Mac-arm64-${version}.${ext}
  identity: "-"
  hardenedRuntime: true
  entitlements: build/entitlements.mac.plist
  entitlementsInherit: build/entitlements.mac.plist
  gatekeeperAssess: false
  notarize: false
```

要点：
- `dmg` 与 `zip` **两个都要**：dmg 用于正常安装体验，zip 便于微信等渠道传输。
- `identity: "-"` = ad-hoc 本机签名（electron-builder 会签嵌套代码并生成 bundle seal）。
- `gatekeeperAssess: false` 是把默认行为显式写出来，避免歧义。
- `artifactName` 保持不变；`dmg`/`zip` 文件名由 `${ext}` 区分。

**实施备注（2026-09-30，Mac 本机实测）**：
1. electron-builder 26 的 `.app` 目录名与 `Contents/MacOS` 内可执行名同源于 `executableName`（顶层 `executableName: TokenUsageAssistant` 会让 bundle 变成 `TokenUsageAssistant.app`）。为实现本方案「`Token 用量助手.app`」的交付目标，在 `mac:` 段内新增 `executableName: "Token 用量助手"` 覆盖；顶层键保持不动，Windows 命名不受影响。校验脚本从 `Info.plist` 的 `CFBundleExecutable` 动态读取可执行名，不硬编码。
2. 首次打包后的原生 smoke 在 macOS 上暴露历史 `nativeMacTest:false` 掩盖的两个问题，均已修复：(a) `desktop/main.cjs` smoke 模式现把 `--test-directory` 归一化为 `realpathSync`——macOS 的 `/tmp`、`/var` 是符号链接，fixture 的严格路径断言会因 `/private/var` 前缀失配；Windows 路径无符号链接，该变换为恒等，不影响 Windows smoke。(b) `scripts/Verify-Mac-Native.command` 不在 `$变量` 后紧邻多字节标点（macOS 自带 bash 3.2 在 `set -u` 下会误并入变量名）。
3. 本机到 GitHub 的下载连接会长时间 stall（electron-builder 每次构建会重新验证下载）。`scripts/Build-Mac-App.command` 默认 `ELECTRON_MIRROR` 与 `ELECTRON_BUILDER_BINARIES_MIRROR` 到 npmmirror（仅设默认值，用户显式设置的镜像优先）；所有下载均经 electron-builder 内置 sha256 校验，dmgbuild bundle 已按官方校验和预置缓存。

**`build/entitlements.mac.plist`** — **保持原样不动**：

```xml
<key>com.apple.security.cs.allow-jit</key><true/>
<key>com.apple.security.cs.disable-library-validation</key><true/>
```

明确**不要**加 `com.apple.security.network.client` / `automation.apple-events` 等。那些是 **App Sandbox** 权益；本应用未开沙箱、也不公证，加了只会扩大权限面。Electron 在 hardened runtime 下只需上述两项。

**删除 `electron-builder.mac-test.yml`** — 其 mac 段与新 base 配置等价，保留只会造成两处配置漂移。
**注意**：`scripts/deliver-opencode-beta5.py:77` 的 `names` 列表引用了该文件，必须同步移除，否则源码交接包构建直接报错。

**`package.json`**（`version` 保持 `1.8.0-beta.5` 不动）：
- 新增 `"package:mac": "electron-builder --mac dmg zip --arm64"`
- 新增 `"verify:mac": "bash scripts/Verify-Mac-Native.command"`
- 删除 `"package:mac:test"`

### 3.2 构建与校验脚本

**新增 `scripts/Build-Mac-App.command`**（替代并删除 `scripts/Build-Mac-Test.command`）

保留现有前置校验（已验证正确）：Darwin 平台、arm64 架构、Node ≥24 且 arm64、pnpm 存在。结尾改为：

```bash
pnpm install --frozen-lockfile
pnpm run build
pnpm run package:mac
echo '构建完成。产物在 release-v1.8.0-beta.5：DMG 用于安装，ZIP 用于传输。'
echo '本包使用本机 ad-hoc 临时签名，未做 Developer ID 签名与公证；首次打开需右键 → 打开。'
```

注意修掉原脚本第 15 行那句过时的 `release-v1.8.0-beta.1` 回显。

**新增 `scripts/Verify-Mac-Native.command`**（替代并删除 `scripts/verify-mac-updater-1.8-beta2.py`）

定位 `release-v1.8.0-beta.5/` 下的 `Token 用量助手.app`，逐项校验，落盘 `docs/verification-1.8.0-beta.5/mac-app-integrity.json`：

| # | 检查 | 期望 |
|---|---|---|
| 1 | `codesign --verify --deep --strict --verbose=4` | **必须通过**（当前 kit 在此失败，这是核心断言） |
| 2 | `_CodeSignature/CodeResources` 存在；`codesign -dv` 显示 ad-hoc | 通过 |
| 3 | `codesign -d --entitlements -` 含 `allow-jit` + `disable-library-validation` | 通过 |
| 4 | `Info.plist`：`CFBundleIdentifier` == `local.commandcode.tokenusageassistant`，`CFBundleIconFile` 存在 | 通过 |
| 5 | **原生 smoke 测试**：`"Token 用量助手.app/Contents/MacOS/TokenUsageAssistant" --smoke-test --test-directory=<临时隔离目录>` | `smoke-result.json` 中 `ok: true` |
| 6 | 默认 `userData` 仍为 `~/Library/Application Support/TokenUsageAssistant`（旧凭据沿用） | 确认一次 |
| 7 | `spctl -a -vvv -t exec` | **预期 rejected（未公证）**，照实记录，**不判通过** |

第 5 项会把历史报告中的 `nativeMacTest: false` 首次变成真实值。第 7 项必须诚实记录失败，不得粉饰。

### 3.3 删除旧修复脚本链路（8 个文件）

- `scripts/Repair-Mac-Trial-1.8-beta2.command`
- `scripts/Repair-Mac-Trial-1.8-beta3.command`
- `scripts/Repair-Mac-Trial-1.8-beta4.command`
- `scripts/Repair-Mac-Trial-1.8-beta5.command`
- `scripts/Start-Mac-Trial.command`
- `scripts/Check-Mac-Trial.command`
- `scripts/Update-Mac-Trial.command.in`（`@@NEW_ASAR@@` 占位模板，仓库内无生成器引用，已是死文件）
- `scripts/verify-mac-updater-1.8-beta2.py`（引用的 `work/delivery-beta2/update` 早已不存在）

**保留**历史交付文档：`docs/MAC-TRIAL-*.md`、`docs/MAC-STARTUP-*.md`、`docs/MAC-FULL-1.8.0-beta.{2,3,4,5}.md`、各 `docs/verification-*/` 旧报告 —— 它们是已发布事实的记录，符合「保留既有版本」。

但在以下两处顶部各加一行指向新方案的说明：
- `docs/MAC-FULL-1.8.0-beta.5.md`
- `docs/MAC-TRIAL-1.8.0-beta.1.md`（第 61 行引用了 `Build-Mac-Test.command`）

### 3.4 精简 `scripts/deliver-opencode-beta5.py`（不改名、不升版）

| 位置 | 改动 |
|---|---|
| 第 32–68 行 mac 分支 | **整段删除**。它依赖已不存在的 `work/mac-runtime.json`，做的就是「拼 ZIP + 生成 Repair 脚本」。其调用的 Windows 专用 `E:\Git\bin\bash.exe`、`subprocess.CREATE_NO_WINDOW` 随之消失 |
| 第 75 行 | `assert read(E/'mac-full-kit-integrity.json')['ok']` → `assert read(E/'mac-app-integrity.json')['ok']`（新报告由 Mac 本机生成后拷回；旧 `mac-full-kit-integrity.json` 保留为历史，不再被引用） |
| 第 77 行 `names` | 移除 `'electron-builder.mac-test.yml'`（文件已删，否则源码包构建报错） |
| 第 89 行 | `files.extend` 中的 `TokenUsageAssistant-Mac-arm64-Full-*.zip` 改为新 DMG 文件名（若 DMG 已拷入 `OUT` 则纳入清单；否则只记源码包）。**不要为凑清单伪造记录，以实际文件为准** |
| 第 90 行 manifest | `nativeMacTest: False` → 读取 `mac-app-integrity.json` 的实际值；`scope` 描述追加一句「Mac 改走本机 `.app` + DMG」 |

**零改动**：`scripts/verify-package-beta5.cjs`、`scripts/verify-opencode-package-beta5.ps1`（Windows 链路，钉死 beta.5 的断言继续有效）。

### 3.5 一处小修（现在才正确）

`desktop/main.cjs:156`：

```js
if(isMac)app.dock?.setIcon(nativeImage.createFromPath(path.join(__dirname,'assets','app.png')));
```

改为仅在 `!app.isPackaged` 时执行。理由：之前没有 bundle 图标，需要它撑场面；有了 `app.icns` 后应让 bundle 图标权威生效（多分辨率，比 asar 内 PNG 清晰）。与 `desktop/branding.cjs:15` 已有的 `app.isPackaged` 判断风格一致。

开发模式（`pnpm run desktop`）下 `isPackaged` 为 false，行为不变。

**已核实无遗漏**：`companion://` 是 in-app 的 `protocol.handle`（`desktop/main.cjs:144`），不涉及 `setAsDefaultProtocolClient`，因此 `Info.plist` **不需要**协议声明。

### 3.6 文档更新

- **新增** `docs/MAC-APP-1.8.0-beta.5.md`：
  - 安装流程：挂载 DMG → 拖到「应用程序」→ **首次右键 → 打开 → 确认打开**（仅一次）
  - 明确**不再需要任何修复脚本**
  - 凭据沿用 `~/Library/Application Support/TokenUsageAssistant`，无需迁移
  - 明确列出仍未验收项（真实账户/工具、Mac 实机安装升级、休眠、Keychain、登录项、签名与公证）
  - 声明与旧 `Full-*.zip` 的替代关系，旧包保留供回退
- **改** `PROJECT_HANDOFF.md`：
  - 第 39 行「当前 Windows 打包工具拒绝构建 Mac 应用，未伪造签名、DMG」→ 本机原生构建 + ad-hoc 签名 + 未公证的真实状态
  - 第 41 行提到的 `Start-Mac-Trial.command` / `Check-Mac-Trial.command` / `Build-Mac-Test.command` 同步更新
  - 第 126 行阶段 5 描述同步
- **改** `AGENTS.md`：新增 Stage 5 修订条目，明确取代 2026-09-24「ship 自包含 Mac trial kit + 官方未改动运行时 ZIP」的约定，改为本机 electron-builder 产出真实 `.app` + DMG。旧条目**保留**但标注被取代。
  - 注意：`AGENTS.md` 中「Windows 双包必交」「不恢复长期稳定性测试」「保留既有版本」等约束**继续有效**。
- **改** `README.md`：
  - 第 1 行版本横幅追加一句：Mac 改走本机 `.app` + DMG
  - 第 63 行 Windows 打包命令**不动**，旁边加一句 Mac 用 `scripts/Build-Mac-App.command`（仅 Mac 本机）
- **不动** `DEVELOPMENT_READY.md`（beta.1 历史横幅）
- **改** `docs/verification-1.8.0-beta.5/README.md` 追加一行：`mac-app-integrity.json` 为本机 `.app` 签名 + 原生 smoke 证据；旧 `mac-full-kit-*.json` 为历史试用包记录

---

## 4. 验证方式

在 **arm64 Mac** 上依次执行：

```bash
pnpm install --frozen-lockfile    # 不可复制 Windows 的 node_modules
pnpm run build
bash scripts/Build-Mac-App.command
bash scripts/Verify-Mac-Native.command
```

核心断言：`codesign --verify --deep --strict` 通过 + `_CodeSignature/CodeResources` 存在 + 原生 smoke `ok: true` + 落盘 `mac-app-integrity.json`。

**人工隔离验收（无法自动化，必须实做）**：
微信传输 DMG → 挂载 → 拖入「应用程序」→ 右键打开 → 确认 → 验证启动正常、图标正确、登录项可用、旧凭据仍在。

**回归约束**：
- `pnpm run test:desktop` 全绿（249+ 用例）。其中 `tests/platform.test.cjs` 的 Mac 登录项断言（`loginOptions` darwin 分支、`launcherName('darwin')` 等）**零改动**。
- `pnpm run test:sites` 不受影响。
- Windows 链路代码零改动。`pnpm run package:win` 在 Mac 上跑不了，Windows beta.5 产物不受影响（本次未动版本号）。

---

## 5. 交付清单

**新增**：
- `scripts/Build-Mac-App.command`
- `scripts/Verify-Mac-Native.command`
- `docs/MAC-APP-1.8.0-beta.5.md`
- `docs/verification-1.8.0-beta.5/mac-app-integrity.json`（由校验脚本生成）
- `release-v1.8.0-beta.5/TokenUsageAssistant-Mac-arm64-1.8.0-beta.5.dmg`
- `release-v1.8.0-beta.5/TokenUsageAssistant-Mac-arm64-1.8.0-beta.5.zip`（`.app` 打包，非旧 kit）

**修改**：
- `electron-builder.yml`、`package.json`
- `desktop/main.cjs`（1 行）
- `scripts/deliver-opencode-beta5.py`
- `AGENTS.md`、`PROJECT_HANDOFF.md`、`README.md`
- `docs/verification-1.8.0-beta.5/README.md`
- `docs/MAC-FULL-1.8.0-beta.5.md`、`docs/MAC-TRIAL-1.8.0-beta.1.md`（各加一行指向）

**删除**：
- `electron-builder.mac-test.yml`
- `scripts/Build-Mac-Test.command`
- `scripts/Start-Mac-Trial.command`、`scripts/Check-Mac-Trial.command`
- `scripts/Repair-Mac-Trial-1.8-beta{2,3,4,5}.command`
- `scripts/Update-Mac-Trial.command.in`
- `scripts/verify-mac-updater-1.8-beta2.py`

**保留不动**：所有旧 `release-*` 目录、旧 `docs/verification-*`、`docs/MAC-*` 历史文档、Windows 全部打包与校验脚本。

---

## 6. 后续（账号到位后）

拿到 Apple Developer Program 账号后，追加：

```yaml
mac:
  identity: "Developer ID Application: <NAME> (<TEAMID>)"
  notarize: true
```

并设 `CSC_LINK` / `CSC_KEY_PASSWORD` / `APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD` / `APPLE_TEAM_ID`，增加 `afterSign: xcrun stapler staple`。届时用户拖入「应用程序」双击即用，零提示。DMG 产物形态不变。
