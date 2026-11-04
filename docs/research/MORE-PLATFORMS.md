# 更多平台调研（T13.3，2026-11-05）

依据：各平台官方 API 文档；字段含义没写明的地方参考了开源项目的读法（CC Switch `src-tauri/src/services/balance.rs`、new-api `controller/channel-billing.go`）。都没有用真实账户核对。

| 平台 | 接口 | 结论 |
|---|---|---|
| 硅基流动 | 官方 `GET /v1/user/info`（`api.siliconflow.cn` / `api.siliconflow.com`），Bearer。`data.balance` / `chargeBalance` / `totalBalance` 为十进制字符串，官方没写含义；示例 0.88 + 88.00 = 88.88，开源项目都取 `totalBalance` 作余额 | 已接：总余额 + 赠金（`balance`）+ 充值（`chargeBalance`），界面写明含义按示例推断；国内 CNY、国际 USD（与 CC Switch 一致） |
| 阶跃星辰 | 官方 `GET https://api.stepfun.com/v1/accounts`：`balance`（可用余额，数字）、`type`（prepaid / postpaid）、`total_cash_balance` / `total_voucher_balance`（累计充值 / 累计赠送） | 已接：只显示可用余额；只开国内站（国际站 `api.stepfun.ai` 未写币种）。Step Plan 套餐（`/step_plan/v1`）按月 Credit，文档没有额度查询接口 |
| ZenMux | 官方 Management API（需要 Management API Key）：`GET /api/v1/management/subscription/detail`（`quota_5_hour` / `quota_7_day` 的 `usage_percentage` 0–1、`resets_at`；`quota_monthly` 只有上限）、`GET /api/v1/management/payg/balance`（USD `total_credits` = `top_up_credits` + `bonus_credits`） | 已接：订阅（两个窗口）与按量余额分成两个平台条目 |
| 小米 MiMo | Token Plan（`tp-` Key、按 Credit 计）与按量（`sk-` Key）都没有公开的余额 / 用量查询接口，只能在控制台看 | 不做 |
| 阿里云百炼 Coding Plan | Coding Plan 专属 Key（`sk-sp-`）与 `coding.dashscope.aliyuncs.com` 只提供推理；没有公开的额度查询接口。账户余额要阿里云 AccessKey（权限远超只读查询），第三方工具多用控制台 Cookie | 不做（与 T9.9 结论一致）；有官方只读接口后再评估 |
