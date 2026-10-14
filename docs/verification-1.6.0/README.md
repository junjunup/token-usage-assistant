# 1.6.0 阶段 3 验证

- `desktop-tests.txt`：186 项桌面回归，0 失败 / 跳过；新增 21 项 DeepSeek 余额合同和异常用例。
- `sites-tests.txt`：4 项 Sites 兼容检查。
- `portable-smoke.json`：最终免安装版原生自检。DeepSeek 使用合成响应；测试真实打包界面、加密保存、重新加载和原模块回归。
- `upgrade-native.json`：1.5.1 → 1.6.0，23 项 Windows 原生模块升级检查。覆盖原四家 API 账户、配置、窗口位置、缓存、价格及 Zcode；Codex / Claude 回归由桌面测试和原生订阅自检覆盖。
- `package-integrity.json`：打包文件逐一与当前源码 / 前端构建对照，记录两个 EXE 的 SHA-256。
- `payload-integrity.json`：从 Setup 与 Portable 分别提取 app.asar，确认与被验证载荷一致。
- `balance-*.png`：原生浅 / 深色、多币种、悬浮窗、零余额及查询失败。全部为样例数据。

初次原生检查因隐藏悬浮窗的 requestAnimationFrame 截图等待超时而未通过；已将该自检等待改为捕获页面后短暂等待并重新捕获，最终结果以本目录报告为准。没有将失败轮次计为通过。

没有真实 DeepSeek 账户实测，也没有付费模型调用；没有新增长时间稳定性测试。正式用户数据、凭据、原始工具正文不进入交付记录。本轮没有实际执行 NSIS 覆盖安装、系统登录启动或休眠恢复。原生检查使用测试参数 --disable-gpu。
