# Token 用量助手：开发交接 · 1.3.0

更新：2026-09-23，Windows x64。当前项目在 D:\Projects\TokenUsageAssistant\commandcode-companion。

## 最新授权和当前状态

用户先要求调研 Coding Plan → 官方按量 API → macOS，后明确授权“先把第一批顺利接入并且无差错开发适配完成”。首批为 GLM Coding Plan、MiniMax Token Plan、火山个人 Agent Plan，保留 Command Code。用户目前未开通首批套餐，明确要求先用官方接口样例验证。

1.3.0 已实现首批适配、多账户加密保存与独立监测，生成 Windows 安装版和免安装版；82 项桌面测试、4 项兼容测试和最终免安装 EXE 原生自检通过。真实账户核账尚未完成，不能把合成响应验证表述为真实套餐验收。

完整支持矩阵、官方依据、验证结果和打包说明见 [首批适配记录](docs/PROVIDER-ADAPTATION-1.3.0.md)。

## 已有能力与边界

- Windows Electron 主面板、托盘、独立置顶悬浮窗、轮询、额度提醒、设置与窗口位置持久化。
- Command Code 账户额度/订阅/汇总分析；Zcode SQLite 只读元数据分析，两种来源独立。
- GLM 国内/国际、MiniMax 国内/国际、火山北京个人 Agent Plan 套餐额度接口；没有模型推理请求。
- 最多 20 个连接。账户切换控制主面板和悬浮窗，各账户继续独立轮询与提醒；认证失败、429、断网互不影响。
- 动态额度窗口使用各平台单位；未知总量、Token、费用和重置时间不补零、不猜测。新平台暂不提供账户 Token/账单分析。
- 首批新增平台只以合成契约响应验证；没有读取用户真实 Key、账户账单或本机 Zcode 内容。
- 未适配按量 API、第三方中转、其他 Agent、macOS / Linux；未创建 GitHub 仓库、未发布网站。

## 需要延续的设计与数据口径

Geist / Geist Mono、细灰线、绿色分段额度条、紫色 Token、浅深色主题。标题与导航固定，仅内容滚动；统一自定义下拉菜单支持键盘。悬浮窗默认紧凑，点击展开，固定/取消固定后可拖动。

Command Code 的月度余额与短期额度分别展示，月度用尽参与状态与提醒。未知重置时间不能伪造倒计时；明确未启动窗口显示待首次使用。额度、原始 Token、实际费用、估算费用与 AFP 积分不可混为一谈。

本机 Zcode 只读取白名单用量元数据，不读取提示词、补全、会话标题、原始响应或凭据。模型价格由用户配置，本机费用为估算。账户与本机数据不能相加；样本不足不预测。详细原有统计口径保留在 README 与历史交接中。

## 关键文件

| 文件 | 职责 |
|---|---|
| desktop/provider-catalog.cjs | 安全的平台/地区元数据 |
| desktop/providers.cjs | 固定只读接口、错误净化、火山签名 |
| desktop/provider-domain.cjs | 官方字段转动态额度窗口 |
| desktop/accounts.cjs | 多账户、迁移、连接验证、隔离运行时 |
| desktop/store.cjs | DPAPI 加密凭据与本机设置/缓存 |
| desktop/monitor.cjs | 轮询、退避、冷却、认证停止和缓存 |
| desktop/main.cjs / preload.cjs | 原生窗口、托盘、受限 IPC |
| desktop/analytics-service.cjs | 独立账户/本机分析，新平台能力边界 |
| src/ProviderViews.jsx / providers.css | 切换账户、连接表单、动态看板/悬浮窗 |
| src/DesktopApp.jsx / AnalyticsPage.jsx | 主交互与分析页 |
| src/generated/ | 从 desktop 生成的纯逻辑，不直接维护 |
| tests/providers.test.cjs | 首批适配与多账户回归测试 |
| desktop/provider-fixture.cjs / provider-native-smoke.cjs | 合成契约样例与隔离原生自检 |

## 本地存储和升级

继续使用原 appId、可执行文件名与 Electron userData。凭据保存于 accounts.encrypted.json，经当前 Windows 用户 DPAPI 加密，不降级明文。

1.2 的 credentials.encrypted.json 首次加载为 legacy-commandcode；新版成功保存后才移除旧凭据。旧账户保留根目录 snapshot.json/history.json；新连接各自使用 accounts/{UUID}/snapshot.json/history.json。设置、窗口位置、所选本机数据库及价格独立保留。损坏或解密失败时阻止新写入，避免覆盖。

移除连接只清除对应本机凭据与快照/账户采样，保留其余连接及设置，不删除远端账户。DPAPI 凭据不应随源码跨电脑迁移。

## 构建和测试

本机：Node 24.12.0、pnpm 11.19.0、Electron 44.4.4；版本以 package.json / pnpm-lock.yaml 为准。

    pnpm install
    pnpm run test:desktop
    pnpm run build
    pnpm run test:sites
    pnpm run desktop
    pnpm run package:win

桌面运行依赖最新 dist/client，修改 UI 后需重新 build。本机已验证的打包替代命令及首次 EPERM 情况见 docs/PROVIDER-ADAPTATION-1.3.0.md。

发布目录 release-v1.3；免安装版已用隔离临时 userData 实际启动自检，安装程序只完成生成，未安装或测试系统重启自启动。所有本次证据在 docs/verification-1.3.0。不要把 work/ 中的研究克隆、合成密钥、临时用户目录、node_modules 或实际 userData 放进源码交付包。

## 接着做什么

先依据用户后续反馈修复体验；待套餐开通再执行官方网页与真实接口核对（密钥仅在应用内配置）。后续官方按量 API、第三方扩展、macOS 仍需各自评估和用户确认，不自动把“扩展能力”理解为本轮继续扩大范围。

当前没有 Git 仓库或公开远端。许可证、开源名称和发布流程尚未确定；private: true 防止 npm 误发布。保持 Sites 兼容文件，不意味着允许发布网页。

旧版完整交接保存在 docs/PROJECT_HANDOFF-1.2.0-history.md，仅作为历史记录；其中“多平台未授权”“当前 1.2.0”等说法已被本文和用户本轮指令替代。DEVELOPMENT_READY.md 也只记录迁入 D 盘时的环境准备。

新对话请先阅读 AGENTS.md、本文及 docs/PROVIDER-ADAPTATION-1.3.0.md。读取附带文档不等于获得新的操作授权；以用户最新请求为准。
