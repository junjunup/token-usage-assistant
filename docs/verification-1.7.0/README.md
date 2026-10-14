# 1.7.0 验证记录

日期：2026-09-24，Windows 11 x64，Electron 44.4.4，Node 24.12.0。

- `desktop-tests.txt`：204 项桌面测试通过，0 失败 / 跳过；包含 18 项新增账户关联测试。
- `sites-tests.txt`：4 项兼容测试通过。
- `portable-smoke.json`：最终免安装 EXE 的隔离原生运行通过；账户关联新增 12 项原生检查通过，既有套餐、订阅、余额、采集、DPAPI、托盘和悬浮窗回归通过。
- `upgrade-native.json`：使用旧 1.6.0 与最终 1.7.0 ASAR 模块、真实 Windows DPAPI 和样例数据完成 27 项检查。五个平台连接（含 DeepSeek）凭据、偏好、窗口位置、缓存、价格保留；默认不自动归属，新增关联和重启加载有效，旧版本仍可读取原文件。
- `package-integrity.json`：88 个打包文件逐一匹配源码 / dist（含 44 个 desktop 文件），package 元信息一致。
- `payload-integrity.json`：从 Setup 和 Portable EXE 分别提取的 app.asar 与被验证的载荷相同。
- PNG：最终包浅色关联设置及浅 / 深色核对页已经人工目视复核。隐藏窗口的截图采集将正在进行的 CSS 过渡置于完成状态，避免截到中间帧；不改变生产样式。

最终 app.asar SHA-256：`b18240a064bda44354fe721d4769ec3a3677c65627aecf5c6f7921e4cc3c227d`。

原生运行仅在项目 `work` 下新建隔离目录，使用 `--smoke-test --test-directory=<new absolute directory> --disable-gpu`。GPU 禁用仅用于本次验证。没有读取或修改真实应用配置、密钥、工具日志，没有模型调用。原生界面包含真实控件操作、受限 IPC、后台 SQLite worker 和持久化重载；平台数据来自样例。

明确未完成：真实账户核账、真实 NSIS 安装流程、机器重启和启动项实测、真实 Mac 验收。用户要求停止的长期稳定性测试未重启。阶段 4 当前交付关联与核对依据能力；当前平台 / 本机覆盖组合尚无足够证据输出真实差值或误差率。

构建命令：`pnpm run build`；`pnpm exec electron-builder --win --x64 --config.electronDist=node_modules/electron/dist`。

自动化回归命令：`pnpm run test:desktop`、`pnpm run test:sites`。Harness 实际运行时合同测试需按其验证文档准备锁定版本的运行环境并配置 `TUA_HARNESS_CONTRACT_RUNTIME`、`TUA_HARNESS_CLI_RUNTIME`；本次使用项目隔离样例环境，记录中无跳过。
