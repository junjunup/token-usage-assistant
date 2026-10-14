# 1.8.0-beta.1 验证记录

本轮为阶段 5 Apple Silicon / macOS 13+ 开发首测交付。Mac 实机验收尚未执行。

- `desktop-tests.txt`：216 项通过，0 失败、0 跳过；包含 12 项平台与 Claude 白名单组件检查。
- `sites-tests.txt`：4 项兼容测试通过。
- `portable-smoke.json`：最终 Windows Portable 原生样例通过；含平台、工具、订阅、DeepSeek 余额、关联核对，以及 DPAPI、窗口、悬浮窗和界面。仅使用隔离样例。
- `trial-runner-windows.json`：官方 Windows Electron 直接执行交付 ASAR 的同入口样例通过；该证据不等于 Mac 运行通过。
- `upgrade-native.json`：1.7.0 → 1.8.0-beta.1 最终包模块的 27 项升级检查通过，覆盖设置、凭据、来源和关联规则。
- `package-integrity.json`：91 个应用文件与构建源码一致，含 47 个 desktop 文件；两份 Windows EXE 哈希已记录。
- `payload-integrity.json`：Setup 与 Portable 内 ASAR 均等于最终已测 ASAR。
- `mac-runtime.json`：官方 Electron 44.4.4 ARM64 ZIP 与官方校验值一致，Mach-O 为 ARM64、最低 macOS 13，保留 14 个框架软链接。
- `mac-kit-integrity.json`：Mac 首测包内容逐文件哈希通过，`.command` 为 LF 无 BOM / Unix 0755，原始官方运行 ZIP 未改写；ASAR 与 Windows 已测包相同。

首轮同入口自检曾发现滚动页面与展开下拉菜单在同一任务内触发导致自检误报。已将滚动完成与点击分开，并重新打包、执行最终 Portable 和独立 ASAR 入口检查；最终结果见上述记录。没有将失败结果当作通过。

Windows 原生检查使用 `--disable-gpu`；未执行实际 NSIS 安装。没有真实账户核账、模型调用、真实 Mac 运行、Mac 安装升级、钥匙串实测、休眠恢复、登录启动、Developer ID 签名、公证或新增长期稳定性测试。Mac 开机启动在开发运行模式禁用，待 Mac 独立应用包验证。

Mac 首测操作与逐项待测清单见 `../MAC-TRIAL-1.8.0-beta.1.md`。不要将 Windows 样例和压缩包检查称作阶段 5 完整验收。
