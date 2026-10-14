# 1.8.0-beta.5 验证记录

- 桌面回归：249 项通过、0 跳过（含 15 项新增 OpenCode 契约/SQLite 检查）。
- Sites 兼容：4 项通过；生产构建通过。
- 最终 Windows 免安装程序：隔离样例运行，实际结果见 portable-smoke.json 的 opencode 和 branding。
- 两个 Windows EXE 的 ASAR 与源码一致性：package-integrity.json、payload-integrity.json。
- 原 CSS、品牌组件和图标未改变：opencode-scope-integrity.json。
- Mac 全量包、脚本及哈希：mac-full-kit-integrity.json（历史试用包记录；该流程已于 2026-09-30 被取代）。
- Mac 本机 `.app` 签名与原生 smoke 证据：mac-app-integrity.json（codesign --deep --strict、CodeResources、entitlements、Info.plist、隔离目录原生 smoke、spctl 如实记录）。
- 所有图片和账户数据均为隔离样例，Go 真实账户、OpenCode 真实安装、Mac 实机及安装向导未验证。未进行长期稳定性测试。
