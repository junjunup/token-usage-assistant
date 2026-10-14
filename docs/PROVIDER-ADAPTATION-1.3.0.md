# 首批 Coding Plan 适配 · 1.3.0

日期：2026-09-23。用户已授权首批开发，并确认当前未开通这些套餐，先以官方接口样例进行验证。本次实现与验证不等于真实账户核账通过。

## 已实现的范围

| 平台 | 地区与凭据 | 看板数据 |
|---|---|---|
| GLM Coding Plan | 国内智谱 / 国际 Z.ai，所选站点套餐 Key | 平台返回的短期、周等额度窗口，以及工具额度；不把 TOKENS_LIMIT 直接当作原始 Token |
| MiniMax Token Plan | 国内 / 国际站，Token 或 Coding Plan 专属 Key | 通用共享池与各模型的当前、周窗口；百分比、次数、不限额、未包含与加赠倍率 |
| 火山个人 Agent Plan | 国内北京，有 GetAFPUsage 权限的 AK/SK | 5 小时、近一天、近一周、近一月 AFP 积分窗口 |
| Command Code | 原有 API Key 与可选组织 ID | 保留原有余额、额度、订阅、统计及预测逻辑 |

同一平台可保存多个连接，最多 20 个。账户切换控制主看板与悬浮窗；所有已连接账户继续独立刷新、退避和提醒。更换或移除一个连接不影响其他连接及外观偏好。

凭据整体经 Windows safeStorage / DPAPI 加密写入 accounts.encrypted.json。1.2 的 Command Code 凭据、缓存、采样和设置可迁移；只有新版加密文件保存成功后才移除旧凭据文件。损坏或不可解密的文件会阻止覆盖。不同连接的缓存和采样隔离。

## 接口与口径

- GLM：GET /api/monitor/usage/quota/limit，固定域名 open.bigmodel.cn 或 api.z.ai。百分比按已用转剩余，缺失总量与重置时间保持未知。无法识别的窗口单位使用通用标签。旧版单 TOKENS_LIMIT 沿用官方脚本的 5 小时标识。
- MiniMax：GET /v1/token_plan/remains，固定域名 api.minimaxi.com 或 api.minimax.io。优先使用明确的 remaining_percent；只有计数与百分比相符时才显示计数。兼容历史 usage_count 实际表示“剩余”的口径；0/0 不代表用尽。
- 火山：POST GetAFPUsage，Version=2024-01-01，固定域名 ark.cn-beijing.volcengineapi.com，空对象请求体，HMAC-SHA256 签名。这是只读查询，不会调用模型。
- 所有窗口分别展示，不能相加。AFP、平台额度单位、次数、Token 与金额不互相冒充；月窗口不自动作为自然月账单周期。
- 新平台的额度接口不提供已确认的 Token / 账单汇总，账户分析页明确标记不可用；本机 Zcode 分析仍是独立来源，不表示所选套餐的完整账单。
- 缺字段保持未知；断网、异常 JSON、超大响应、认证失败、限流与供应商 HTTP 200 错误均安全降级。固定 HTTPS 地址，不跟随重定向，不把原始错误响应或密钥回传界面。

## 官方依据

以下仓库在本次开发中只用于阅读契约与离线参考核对，没有加入运行时依赖。

- [GLM 官方用量查询脚本](https://github.com/zai-org/zai-coding-plugins/blob/0446d0bb0bc537d97d3ab3664c4b8b9c4a0e1254/plugins/glm-plan-usage/skills/usage-query-skill/scripts/query-usage.mjs)：地区、请求路径、认证及旧版窗口口径。
- [GLM 套餐说明](https://docs.bigmodel.cn/cn/coding-plan/overview)：套餐额度规则。
- [MiniMax 官方 CLI](https://github.com/MiniMax-AI/cli/tree/33453cf123927f41c00e1935450e504d8a630763)：src/types/api.ts、src/utils/quota.ts、src/output/quota-table.ts 和 src/client/endpoints.ts。
- [火山 GetAFPUsage 文档](https://docs.volcengine.com/docs/ark/get-afp-usage-api?lang=zh)：请求、AFP 字段和响应样例。
- [火山官方签名实现](https://github.com/volcengine/volc-sdk-nodejs/blob/6e8d98cfca31b83f2f920570882785b3283b57ce/src/base/sign.ts)：已用合成 AK/SK 离线比对完整 Authorization 一致；按 GetAFPUsage 示例额外签入 Content-Type，固化为回归向量。

## 本次验证

| 检查 | 结果 |
|---|---|
| 桌面与适配自动化测试 | 82 项通过，包括原有 50 项与新增 32 项 |
| Sites 构建兼容测试 | 4 项通过 |
| Vite 生产构建 | 通过 |
| 官方 SDK 签名离线比对 | 通过 |
| 原生 Electron 隔离 smoke | 通过，GLM 3、MiniMax 4、火山 4 个合成窗口 |
| 最终 Portable 1.3.0 EXE 隔离 smoke | 通过，Windows 系统加密往返、保存重载、独立轮询、移除隔离、深色主题、沙箱和托盘检查通过 |
| 悬浮窗尺寸 | 紧凑 324×366，展开 324×552，收起恢复；超出内容可滚动 |
| 界面检查 | 账户切换、地区/平台表单、AK/SK 掩码、动态额度、浅深色、分析不可用文案与悬浮窗 |
| 真实账户与平台网页逐项核对 | 未执行：用户尚未开通首批套餐 |
| 安装器交互与重启后开机启动 | 安装包已生成，未执行安装和系统重启验收 |

接口样例为依据官方字段构造的合成数据，故意包含缺字段、零额度、限流、权限错误等边界，不是用户账单，也不是官方实时账户返回。测试不请求模型生成，不读取用户真实密钥或 Zcode 正文。

## 构建与复现

    pnpm install
    pnpm run test:desktop
    pnpm run build
    pnpm run test:sites
    pnpm run package:win

本机首次打包遇到 electron-builder 在解压临时目录重命名时 EPERM；使用已经安装的同版官方 Electron 分发包完成打包，未修改依赖源码或关闭系统防护：

    pnpm exec electron-builder --win --x64 --config.electronDist=node_modules/electron/dist

输出位于 release-v1.3，包含 Setup 和 Portable。版本均为 1.3.0，Windows x64，未签名开发版本。免安装版经实际启动验证；不需要 Node.js 即可使用。

隔离原生自检需显式指定空测试目录，不应指向真实 userData：

    pnpm exec electron . --smoke-test --test-directory=D:\临时测试目录\quota-smoke

## 后续验收与范围

套餐可用后，在本机应用配置凭据，按所选站点对照官方页面核查当前/周/月额度、重置时间、加赠与耗尽状态，再记录实测验收。无需将密钥发到聊天。

目前尚未适配官方按量 Token 账单、第三方中转、其他本机 Agent 或 macOS。后续顺序保持为：首批真实账户核对 → 官方按量 API → 第三方扩展 → macOS；是否开始下一阶段由用户继续确认。
