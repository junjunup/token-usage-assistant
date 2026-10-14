# 2026-09-25：Mac 首测启动拦截

用户通过微信传输了原 `TokenUsageAssistant-Mac-arm64-Trial-1.8.0-beta.1.zip`。截图显示双击 Start 脚本后，app.asar、官方运行 ZIP、两份脚本、说明和清单均为 OK；随后 macOS 提示“Electron 已损坏，无法打开”，并标注 WeChat 来源。在系统设置选择“仍然打开”仍未解决。macOS 具体版本暂未知。

本机复核：原始官方 Electron 44.4.4 ARM64 ZIP 的主 Mach-O 存在 LC_CODE_SIGNATURE，CodeDirectory flags 为 0x20002（含 ad-hoc 位），无 CMS 证书签名，顶层 App 无 CodeResources。没有声称 Developer ID 签名或公证通过。截图支持“文件传输校验通过但启动受拦截”；尚不能仅凭截图证明用户机器上的隔离属性或所有解压文件状态。

另有 MODULE_NOT_FOUND 出现在终端较早记录，截图未给出缺失模块的完整首行，不能据此断言与本次启动拦截相同。解除当前拦截后如仍出现，需要完整错误首行再定位。

已提供独立支持包 `TokenUsageAssistant-Mac-Startup-Helper-1.8.0-beta.1.zip`，位于本次 outputs 目录。它不更新应用 ASAR 或 Windows EXE，不替代原发布包。

脚本只处理准确匹配以下固定哈希的首测文件：

- app.asar：47ea6661405cbfcd6ee6fcd37e3f52032f62ddc6a1b60c4ea70eeffe74729ebd
- electron-v44.4.4-darwin-arm64.zip：da15aa8c48f3eeb1622c820249e57a2b7b85048adc7ac792d8b97da86e6edcf8
- 解压后 Electron 主程序：60dbb0f7c649404f61c987a0ddcd8a051c8268aee502f44da2ffdd0ede03bd0e

校验通过后解压至新建私有目录，仅移除新 Electron.app 内文件 / 目录上的 com.apple.quarantine；备份旧运行目录并放入新目录，然后启动原 ASAR。不删除用户凭据，不修改二进制或其他扩展属性，不重签名，不使用 sudo，不关闭全局 Gatekeeper。校验失败时停止。报告仅记录系统版本 / 架构、校验和处理状态、退出码。

Windows 侧只验证固定哈希、原始 ZIP 内软链接边界、脚本 LF / 无 BOM / ZIP 可执行位、Bash 语法和非 Mac 平台提前退出。没有将这些检查称为 Mac 原生验证。脚本实际效果、Mac 启动和阶段 5 验收仍待用户反馈；没有新增长期稳定性测试。

参考：[Apple 的安全提示说明](https://support.apple.com/zh-cn/102445)、[Electron 的签名与公证说明](https://www.electronjs.org/docs/latest/tutorial/code-signing)。
