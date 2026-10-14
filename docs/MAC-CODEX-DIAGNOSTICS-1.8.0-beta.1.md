# 2026-09-25：Mac 连接本机 Codex 超时排查

## 后续：诊断启动失败已复现，支持包更新为 r2

用户截图显示 Node 诊断提示未完成，报告目录为空，且未出现“1/3 检查 Codex”阶段。开发端用同版 Electron 44.4.4 的 Node 模式复现：`fs.readFileSync(app.asar)` 返回 ENOENT，而 `original-fs.readFileSync(app.asar)` 能读取原始归档并得到正确校验值。上一版只测了 ASAR 模块导入和观察层，遗漏了整个入口的归档校验流程。

r2 支持包改用 original-fs 校验物理 ASAR；先写基础报告，再校验和加载模块；启动错误记录固定错误码及阶段，不输出原始异常或账户内容。Shell 也在调用 Node 前预先生成基础报告，Node 未进入时保留退出码。完整原生入口使用含空格 / 中文的路径与合成进程验证，含缺归档、错误归档、模块失败、未找到程序及程序启动失败，共 9 项检查通过；观察层 10 项样例回归通过。所有原生验证在 Windows Electron 完成，Mac 效果仍待反馈，无真实账户或模型调用。

新支持包为 `TokenUsageAssistant-Mac-Codex-Diagnostics-1.8.0-beta.1-r2.zip`。原诊断包保留为历史，用户应完整解压新目录并使用其中脚本。应用原包和 Windows EXE 没有改动。这修复了诊断工具，尚未确定 Mac 原始 Codex 连接超时原因。

依据：[Electron 官方 ASAR 校验说明](https://www.electronjs.org/docs/latest/tutorial/asar-archives#treating-an-asar-archive-as-a-normal-file)。以下保留原排查记录。

用户确认使用 Mac Codex 桌面端；“超时、检查版本”提示出现在 Token 用量助手，不是官方 Codex 登录页面。官方客户端当前是否已成功登录尚未明确。

已审查 `desktop/codex-rpc.cjs`：`spawn` 失败、进程退出、stdin 错误、输出超限和 20 秒计时器都调用同一个 stop，并对外显示“Codex 查询中断或超时，请确认客户端版本与登录状态”。20 秒为整条连接总预算，未区分启动 / initialize / account/read / account/rateLimits/read。当前官方文档与已有只读调用顺序一致；这并未确认用户 Mac 的实际根因。

提供独立支持包 `TokenUsageAssistant-Mac-Codex-Diagnostics-1.8.0-beta.1.zip`。加载用户已校验的原 ASAR 连接代码，用观察层记录白名单阶段、耗时、退出码与固定错误分类。保留原 20 秒检查；只有真实到达超时时才用 60 秒对照。报告不包含原始 stderr、邮箱、身份、额度内容、文件路径、代理地址或凭据。只调用版本检查与初始化 / 账户读取 / 额度读取，不发起模型请求或登录变更。

此次未修改应用代码、超时设置、Windows EXE 或原 Mac 首测包；没有以延长超时充当根因修复。诊断自动发现默认 Codex 程序，不读取已保存加密程序路径，需注意与用户曾手动选择的程序以及终端环境的差异。

10 项合成诊断检查通过；真实 Mac 与真实账户结果待用户返回 `codex-diagnostics-report.json`。未新增长期稳定性测试。下一步根据最后成功阶段、错误码、两种限时对照以及 Mac 客户端状态定向修复。

官方依据：[Codex App Server](https://learn.chatgpt.com/docs/app-server)，2026-09-25 核对 initialize / initialized、account/read(refreshToken=false) 和 account/rateLimits/read。
