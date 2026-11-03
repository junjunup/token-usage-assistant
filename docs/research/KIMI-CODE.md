# Kimi Code 订阅额度接口（T12.2，D19 ②）

> 2026-11-03 调研。Kimi **没有公开**这个接口的文档；下面的结构来自第三方工具的源码与说明，按 D19 ② 作为「非官方接口」接入。

## 接口

- `GET https://api.kimi.com/coding/v1/usages`（国内），`GET https://api.kimi.ai/coding/v1/usages`（国际）。
- 鉴权：`Authorization: Bearer <Kimi Code API Key>`。Key 在 Kimi Code 控制台（`kimi.com/code/console` / `kimi.ai/code/console`）创建，与 Kimi 开放平台（Moonshot）的 Key 不通用，两个站点的 Key 也不通用。
- 本助手只用用户在应用里填写的 Key；**不**读取 Kimi Code CLI 的登录凭据（`~/.kimi-code/credentials/`）或浏览器 Cookie——这两种做法有第三方工具在用，但违反 AGENTS §4。

## 已知的两种返回结构

1. **比例池**（较新）：`usages.limit_5h`、`usages.limit_7d`、`usages.limit_month_total`（另有 `limit_month_code`，是 Kimi Code 在月度总额度里占的份额，不是独立限额，本助手不显示），每项含 `used_ratio`（0–1）与 `reset_time`（ISO 8601）。
2. **计数**（较旧）：`usage`（每周额度，`limit` / `used` / `remaining` / `resetTime`）与 `limits[]`（`window.duration` + `window.timeUnit`（`TIME_UNIT_MINUTE` / `HOUR` / `DAY`）和同样的 `detail`）。

两种结构可能同时出现；第三方工具报告数字有时是字符串、重置时间有 `resetTime` / `resetAt` / `reset_time` / `reset_at` 四种写法，ISO 或纪元秒。`user.membership.level`（如 `LEVEL_INTERMEDIATE`）是会员等级，`version` 为 `GOODS_VERSION_V1` 时可按官方商品目录映射成名称（Adagio / Andante / Moderato / Allegretto / Allegro）。

## 本助手的读取规则

- 比例池优先；计数只补比例池没有的窗口。只显示百分比：计数的单位（次数？）官方没有说明，不换算。
- 至少解出一个窗口，否则整体视为「格式不兼容」，保留上次成功的数据；任何数字或时间格式不对也一样，不猜。
- 每月总额度与 Kimi 的其他功能（对话、Agent 等）共用，和 5 小时、每周窗口同时约束，不能相加。
- 验证等级：样例验证（样例来自第三方工具，不是 Kimi 官方），没有真实账户核对过。

## 依据

- CodexBar：[docs/kimi.md](https://github.com/steipete/CodexBar/blob/main/docs/kimi.md)、[KimiModels.swift](https://github.com/steipete/CodexBar/blob/main/Sources/CodexBarCore/Providers/Kimi/KimiModels.swift)、[KimiUsageFetcher.swift](https://github.com/steipete/CodexBar/blob/main/Sources/CodexBarCore/Providers/Kimi/KimiUsageFetcher.swift)（API Key 方式：`GET` + `Authorization: Bearer`）。
- CodeBurn：[src/quota/kimi.ts](https://github.com/getagentseal/codeburn/blob/main/src/quota/kimi.ts)（旧结构、数字为字符串、重置时间多种写法）。
- 同一接口还被 claude-code-router、OpenChamber、Raycast agent-usage 等项目使用（GitHub 代码搜索 `api.kimi.com/coding/v1/usages`）。
