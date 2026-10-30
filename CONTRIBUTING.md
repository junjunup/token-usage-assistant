# 参与贡献 / Contributing

[中文](#中文) · [English](#english)

## 中文

欢迎反馈问题、请求新平台或提交修改。提问题请用 issue 模板；安全问题请按 [SECURITY.md](SECURITY.md) 私下报告。

### 开发环境

- Node.js 24（Apple Silicon 上用 ARM64 版本）、pnpm 11.19.0。Electron 版本以 `package.json` 为准，依赖锁定在 `pnpm-lock.yaml`。
- 安装与常用命令：

```bash
pnpm install
pnpm run dev            # 浏览器预览（示例数据，不需要真实账户）
pnpm run desktop        # 未打包的开发版（Mac 上用独立的数据目录和钥匙串条目）
pnpm run test:desktop   # 测试
pnpm run lint           # ESLint
pnpm run typecheck      # 纯领域模块的严格类型检查
pnpm run format:check   # Prettier（pnpm run format 自动格式化）
```

- 原生 smoke 必须配一个新建的隔离目录：`pnpm exec electron . --smoke-test --test-directory="$(mktemp -d)"`。不要让测试读写你真实的应用数据。
- Harness 的 6 项运行时测试需要另装官方测试运行时，见 [插件说明](integrations/deepseek-harness/README.md)；没装时会跳过，跳过不算通过。

### 提交修改前

1. CI 在 Windows 与 macOS 上跑格式、ESLint、类型检查和全部测试，都要通过。
2. 测试数只增不减，不要放宽已有断言；行为变了就同时改测试并在 PR 里说明原因。
3. **界面改动**先附浅色和深色两张截图（可用 `pnpm run dev` 的预览），维护者确认后再合并。
4. 改了读取范围、存储位置或联网行为，同步更新 [docs/PRIVACY.md](docs/PRIVACY.md)。

### 必须遵守的数据规则（完整版见 [AGENTS.md](AGENTS.md)）

- 缺失显示「—」，不显示 0；查询失败不伪造 0，保留上次成功的值和时间。
- USD 与 CNY 分开，不换汇、不相加；余额变化不是消费；平台汇总与本机工具统计不相加。
- 费用只是按本机单价的估算，不是账单；覆盖范围是本机观察到的范围，不是完整账单。
- 不读取、不记录、不导出对话正文、提示词、回复、工具内容、原始请求、原始错误或凭据；第三方数据库只读。
- 只用平台官方的只读接口：不调用模型、不消耗额度、不修改账户。

### 新平台

先开「新平台请求」issue，附官方只读接口的文档。实现时要有：固定的官方地址、合成样例的契约测试（不用真实账户数据）、验证等级（只有用真实账户核对过才能标「已实测」）、PRIVACY 更新。

### 平台验证报告

表里标「样例验证」的平台还没和真实账户核对过。如果你用自己的账户对照过应用和平台官方控制台，请用「平台验证报告」issue 模板告诉我们一致与否、差异在哪里；不要贴 Key、Cookie、账户邮箱或截图里的账户信息。维护者会据此复核，验证等级是否调整由维护者确认。

### 语言

界面和文档以中文为主；README 与隐私、安全说明有英文版。issue 和 PR 用中文或英文都可以。

---

## English

Bug reports, platform requests and pull requests are welcome. Please use the issue templates; report security problems privately as described in [SECURITY.md](SECURITY.md). The app's interface is Chinese only for now.

### Setup

Node.js 24 (ARM64 on Apple Silicon) and pnpm 11.19.0; Electron and all dependencies are pinned in `package.json` / `pnpm-lock.yaml`.

```bash
pnpm install
pnpm run dev            # browser preview with sample data, no real account needed
pnpm run test:desktop   # tests
pnpm run lint && pnpm run typecheck && pnpm run format:check
```

The native smoke test must use a fresh isolated directory: `pnpm exec electron . --smoke-test --test-directory="$(mktemp -d)"`.

### Before opening a pull request

1. CI (Windows and macOS) must pass: format, ESLint, type check and all tests.
2. Never reduce the number of tests or loosen existing assertions; if behaviour changes, change the tests and explain why.
3. Interface changes need light and dark screenshots first (the `pnpm run dev` preview is fine); they are merged after the maintainer agrees.
4. If you change what is read, where it is stored or what the app connects to, update [docs/PRIVACY.md](docs/PRIVACY.md).

### Data rules (full version in [AGENTS.md](AGENTS.md), Chinese)

Missing values show "—", never 0; failed queries never become 0. Currencies are never converted or added; a balance change is not spending; platform totals and local tool statistics are never added together. Costs are local estimates, not bills. Conversation content, prompts, replies, tool content, raw requests, raw errors and credentials are never read, logged or exported; third-party databases are opened read-only. Only official read-only endpoints are used: no model calls, no quota spent, no account changes.

### Platform verification reports

Platforms marked "Sample-tested" have not been checked against a real account. If you compared the app with a platform's official console on your own account, use the "platform verification report" issue template to say whether it matches and what differs; do not paste keys, cookies, account emails or account details from screenshots. The maintainer reviews each report and decides whether a verification level changes.

### New platforms

Open a "new platform request" issue with a link to the official read-only endpoint first. An implementation needs a fixed official address, contract tests on synthetic samples (no real account data), an honest verification level, and a PRIVACY update.
