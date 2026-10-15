# 发版流程

所有安装包统一由 CI 产出（`.github/workflows/release.yml`）。版本节奏见 [AGENTS.md](../AGENTS.md) §7 与改进计划 D3。

## 产出内容

| 平台 | 产物 | 校验 |
|---|---|---|
| Windows x64 | `TokenUsageAssistant-Setup-<版本>.exe`、`TokenUsageAssistant-Portable-<版本>.exe` | 便携版在隔离目录跑原生 smoke（`smoke-result-windows.json`）；`scripts/verify-package.cjs` 核对包内每个文件与源码一致，以及包内版本与 `package.json` 一致（`package-integrity.json`，含 ASAR 哈希） |
| macOS arm64 | `TokenUsageAssistant-Mac-arm64-<版本>.dmg`、`.zip` | `scripts/Verify-Mac-Native.command`：`codesign --verify --deep --strict`、ad-hoc 签名与 bundle seal、entitlements、Info.plist（ID / 图标 / 版本）、打包后原生 smoke、默认 userData 路径；`spctl` 预期为 rejected，只记录，不作为门禁（`mac-app-integrity.json`） |

最后的 `release` 作业会核对以上各报告中的版本号都等于 `package.json` 的版本；打标签触发时，还会核对标签名等于 `v<版本>`。

## 步骤

1. 在 main 上改好版本号（只在阶段的最后一个任务合并时修改，见 D3），提交并推送。
2. 打标签并推送：`git tag -a v<版本> -m "<版本>"`，然后 `git push origin v<版本>`。
3. 等待 Release 工作流完成。成功后，私有仓库中会出现一个 **draft prerelease**，附带 4 个安装包和完整性 JSON。
4. 下载产物，把 `package-integrity.json`、`smoke-result-windows.json`、`mac-app-integrity.json` 放进 `docs/verification-<版本>/`，提交。
5. 安装包另存一份到 `~/Documents/TokenUsageAssistant-releases/release-v<版本>/`（不覆盖、不删除旧版本）。
6. 对外分发（D8）：发布到公开安装包仓库 [junjunup/TokenUsageAssistant](https://github.com/junjunup/TokenUsageAssistant)，只放安装包，不放源码。
   1. 审核私有仓库中的 draft prerelease；没问题后点「Publish release」（它仍然只在私有仓库可见）。Publish 工作流只读取已发布的私有 Release，这一步就是人工审核关口。
   2. 在 Actions 页面手动运行 **Publish** 工作流，`tag` 填 `v<版本>`，`dry_run` 保持勾选：只演练，在 job summary 中列出将要发布的 4 个安装包和 `SHA256SUMS.txt`。
   3. 确认无误后再运行一次，取消勾选 `dry_run`：在公开仓库创建同名 Release（版本带 `-` 的自动标为 prerelease）。
   - 上传的是私有 Release 中**同一批**安装包（不重新构建），加上 `SHA256SUMS.txt` 和简短说明；**不上传**源码、完整性 JSON（含 runner 路径）和 smoke 报告。
   - 需要 secret `PUBLIC_RELEASE_TOKEN`：fine-grained token，只授权 `junjunup/TokenUsageAssistant`，权限只给 Contents: Read and write。令牌由用户自己创建和设置，不经过聊天。
   - 推送标签时**不会**自动公开发布。

不打标签、只想拿到安装包时，可以在 Actions 页面手动运行 Release 工作流（workflow_dispatch）：只产出构建产物（Artifacts），不创建 Release。

## 证据等级（必须如实写）

- CI 的 smoke 属于 **②（打包原生 smoke，隔离样例）**，运行在 GitHub 的 runner 上，**不代表**真实账户或真机验收（③）。
- runner 上托盘、通知等的表现可能和真机不同。smoke 因 runner 环境失败时，先记录是哪个检查项失败；**不要为了让 CI 变绿而放宽 smoke 断言**。确实是环境不支持的，在报告中注明「CI 环境不支持该项」并给出依据。
- Mac 包是 ad-hoc 签名、未公证（D4）：首次打开需要右键 → 打开；`spctl` 为 rejected 是预期结果。

## 本机构建（备用）

- Mac：`scripts/Build-Mac-App.command`，然后运行 `scripts/Verify-Mac-Native.command`。默认输出到 `release-v<版本>/`，报告写入 `docs/verification-<版本>/`；可以用环境变量 `TUA_RELEASE_DIR`、`TUA_REPORT_DIR` 改变位置。本机构建会默认使用 npmmirror 下载 Electron（国内网络）；CI 不使用镜像。
- 按 D1，阶段中间改变行为的任务在本机出 Mac 包时，文件名加 `-dev.<短 commit>`，不升版本号。
