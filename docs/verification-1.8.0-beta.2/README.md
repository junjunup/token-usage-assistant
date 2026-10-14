# 1.8.0-beta.2 验证记录

2026-09-26。Mac Codex 程序选择与连接错误分类修复；真实 Mac 额度连接待用户复测。

- `desktop-tests.txt`：234 项通过、0 失败、0 跳过；新增 18 项连接 / RPC 回归。
- `sites-tests.txt`：4 项通过。
- `packaged-rpc-tests.txt`：通过 Electron Node 模式加载最终 ASAR 内 RPC 模块，13 项协议、只读方法、早退、超时及脱敏测试通过。使用合成进程事件。
- `official-codex-initialize.json`：最终包模块对本机官方 Codex 0.158.0-alpha.2.1 初始化预检通过；使用新建的隔离 CODEX_HOME，不读取真实账户或额度，不调用模型。该结果仅针对 Windows 初始化。
- `portable-smoke.json`：最终 Windows Portable 原生界面 / DPAPI / 平台 / 工具 / 关联样例通过，版本 beta.2；使用隔离样例及 `--disable-gpu`。
- `upgrade-native.json`：最终包 beta.1 → beta.2 的 27 项原生模块升级检查通过，包含设置、加密凭据、来源和关联规则保留。
- `package-integrity.json`：91 个包内文件与源码 / 构建内容一致（47 个 desktop 文件），包内版本和两份 Windows EXE 哈希已核对。
- `payload-integrity.json`：Setup 与 Portable 内 ASAR 哈希均等于最终已测 ASAR。
- `mac-kit-integrity.json`：Mac 完整包与小型升级包逐文件校验通过，命令脚本 LF / 无 BOM / Unix 0755，官方 ARM64 Electron 原始 ZIP 未改写；使用相同已测 ASAR。
- `mac-updater-tests.json`：7 项脚本语法与合成升级检查通过，包括成功备份、重复执行、未知旧包、损坏补丁、半途失败回滚、取消不修改。Windows Git Bash 下替换 OS 探测 / 选择器 / hash 命令名与旧样例哈希后执行，不等同于 macOS 原生验证。

最终原生检查初次发现自检 fixture 的假程序没有同步注入初始化预检。已补齐仅供隔离自检的注入，重新生成两份 EXE 并复验通过；没有用假程序替代实际生产预检，也没有把首次失败算作通过。

用户报告确认的是 beta.1 诊断运行：Homebrew CLI 0.39.0 在 49 ms 以 code 2 退出、启动参数错误分类；并未确认 beta.2 在真实 Mac 成功连接。未保留用户路径、账户、原始 stderr 或正文。

没有执行真实 Mac 钥匙串、选择器、菜单栏、休眠、安装升级、登录项、Developer ID 签名、公证，亦无实际 NSIS 安装、真实核账、模型调用或新增长期稳定性测试。
