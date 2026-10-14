# 1.5.1 验证记录

- `desktop-tests.txt`：165 项桌面回归，含 14 项本机连接发现 / 隔离测试。Harness 测试使用本机已验证的官方固定版本运行时；0 跳过。
- `sites-tests.txt`：4 项兼容测试。
- `portable-smoke.json`：最终免安装 EXE 的隔离原生自检，包含真实打包界面的选择、取消、键盘操作和等待状态。账户响应全部为样例；实际执行本机 PowerShell 组件，不调用真实模型。
- `upgrade-native.json`：1.5.0 → 1.5.1，Windows safeStorage 与最终 ASAR 模块的 23 项隔离升级检查。非 NSIS 实际安装。
- `local-discovery.json`：当前机器的配置发现结果，仅含数量和判断值。未读取凭据文件、未查询账户、未导出真实路径。
- `package-integrity.json`：83 个文件与源码 / 构建匹配，以及 EXE 哈希。
- `payload-integrity.json`：从 Setup 与 Portable 各自提取 `app.asar`，与自检目标一致。
- `subscription-*.png`：原生浅 / 深色界面、Claude 首次等待、配置选择及无历史日志的独立额度状态。均使用隔离样例数据。

不以样例冒充真实账户核账。本轮没有新的长时间稳定性测试，没有重新查询真实 Codex 额度，也没有真实 Claude 账户。之前真实 Pro 只读观察保存在 1.5.0 记录中。未签名，实际安装覆盖、系统启动和休眠恢复仍待专门验收。最终原生检查使用测试参数 `--disable-gpu`。
