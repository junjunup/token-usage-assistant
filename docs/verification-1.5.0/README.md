# 1.5.0 验证记录

| 记录 | 结果与范围 |
|---|---|
| desktop-tests.txt | 151 通过、0 失败、0 跳过；包含 21 项订阅专项检查及原有完整回归 |
| sites-tests.txt | 4 通过、0 失败 |
| frontend-build.txt | Vite / Sites 构建通过；保留既有 bundle 大小提示 |
| package-build.txt | Windows x64 NSIS、Portable 构建完成 |
| portable-smoke.json | 最终免安装包原生自检；合成账户、用量和实际本机 PowerShell 组件，不发模型请求 |
| upgrade-native.json | 最终 ASAR 从 1.4.1 旧模块升级的 23 项隔离样例检查通过 |
| package-integrity.json | 81 个包内文件与源码 / dist 一致，包含程序哈希 |
| payload-integrity.json | 从两个 EXE 提取 ASAR，均与被测 ASAR 一致 |
| codex-live.json | 经授权只读查询本机官方 Codex 真实 Pro 登录及额度；对白名单用量字段作有限实读，不导出账户邮件、正文、路径或 Token 数值 |
| subscription-*.png | 最终包的合成界面截图，已人工目视复核 |

最终 ASAR SHA-256：`74575938170f124a3293846d44ea103d2b6c047f521a56578d188a30c0cff9fa`。

原生图形测试带 `--disable-gpu`，标准发行启动参数保持不变。未做真实 Claude 套餐核账、真实 Claude 模型调用、实际 NSIS 覆盖安装、系统重启/休眠或新的长期稳定性测试。用户已明确停止长测，此项保持未验收。

测试环境：Windows x64、Node 24.12.0、Electron 44.4.4。Codex 0.155.0-alpha.16.4；Claude 字段合同为 2.1.251+ 的 2.1.x，并非真实 Claude 客户端/账户端到端认证。
