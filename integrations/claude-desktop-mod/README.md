# Token 用量助手 · Claude 额度同步模组

**中文** · [English](#english)

Claude 桌面版的 Code 标签不运行自定义状态栏命令，所以 Token 用量助手以前拿不到桌面版会话的套餐额度。这个模组装在 Claude 里，把 Claude Code 引擎提供给模组的官方实时额度（`$.session.usage()` 的 `rateLimits`：5 小时、每周窗口的已用百分比与重置时间）经本机回环地址交给助手。数值和重置时间都是 Claude 给出的原样，没有估算。

## 安装

在终端运行一行（以后新开的 Claude 会话都会加载）：

```bash
claude plugin install token-usage-quota-sync --marketplace junjunup/token-usage-assistant
```

需要 Token 用量助手已经连接 Claude 账户（它会在本机准备接收端）。助手没在运行时，模组什么也不做。

## 它会发送什么、发到哪里

- 只在额度窗口变化时（每变 1 个点，或每轮结束）发送一次，目的地只有本机 `127.0.0.1` 上助手自己的接收端，带助手生成的令牌。
- 只有：Claude Code 版本、会话编号、会话所在目录、5 小时与每周窗口的已用百分比和重置时间。
- 不发送对话、提示词、回复、工具内容，也不读取或发送任何凭据；不额外调用模型、不消耗额度。
- 它读取的唯一文件是助手的接收端设置（端口与令牌）：macOS `~/Library/Application Support/TokenUsageAssistant/claude-collector/collector.json`，Windows `%APPDATA%\commandcode-companion\claude-collector\collector.json`（Windows 尚未实测）。

## 卸载

```bash
claude plugin uninstall token-usage-quota-sync
```

## English

The Code tab of the Claude desktop app does not run custom status-line commands, so Token Usage Assistant could not see the plan quota of desktop sessions. This mod runs inside Claude and passes the official live quota the Claude Code engine gives mods (`rateLimits` from `$.session.usage()`: the five-hour and weekly windows' percent used and reset time) to the assistant over the loopback address. Values and reset times are Claude's own; nothing is estimated.

Install, in a terminal (sessions opened afterwards load it):

```bash
claude plugin install token-usage-quota-sync --marketplace junjunup/token-usage-assistant
```

What it sends: only when a window moves (each whole point, or at the end of a turn), only to the assistant's own receiver on `127.0.0.1` with the assistant's token, and only the Claude Code version, the session id, the session's directory and the two windows' percent used and reset time. Never conversation content, prompts, replies, tool data or credentials; no extra model calls. The one file it reads is the assistant's receiver settings (port and token). Uninstall with `claude plugin uninstall token-usage-quota-sync`.
