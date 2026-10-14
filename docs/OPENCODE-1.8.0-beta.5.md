# OpenCode 接入 · 1.8.0-beta.5

用户于 2026-09-26 确认分步实施 OpenCode 全套餐兼容计划。本版交付 Go 官方额度与 OpenCode 本机统计；Zen、Black 和企业网关的数据源评估结论见下文。保留现有 UI、刻度环 Logo、应用 ID、加密账户和数据目录。

## 使用入口

1. **Go 额度**：账户与设置 → 添加账户 → OpenCode · Go → 输入自己的 OpenCode API Key。使用订阅成员对应工作区的 Key，在本机验证并保存；无需将 Key 发到聊天，也不需要安装 OpenCode。
2. **本机统计**：账户与设置 → 工具数据源 → OpenCode → 选择 `opencode.db`。可在 OpenCode 所在环境运行 `opencode db path` 查找位置。选择可访问的数据库文件即可，不要求 Go 订阅。WSL 数据库需要选择可访问的对应文件，当前不自动启动 WSL 或跨远程主机采集。
3. Go 总览显示 5 小时、本周、本账期三个共享额度窗口。紧凑悬浮窗沿用原行为，优先显示剩余比例最低的两个窗口；展开显示全部三个。按现有设置独立刷新、缓存和提醒。
4. 工具分析可选择 OpenCode 来源，按模型、项目、会话及时间查看 Token。Go 账户与本机来源不会自动关联；仍可使用现有显式账户关联规则。

## Go 的数据边界

- 固定 HTTPS GET `/zen/go/v1/usage`，Bearer API Key，禁止跟随重定向；不调用模型、登录、购买或修改账户接口。
- 映射服务端 `usage.rolling / weekly / monthly` 中的 `percent`、`status`、`resetsAt`，不硬编码金额或模型列表。
- 三个窗口约束同一套餐，不能相加。不同模型扣减倍率由服务端处理，本地不反算“剩余美元”或 Token。
- 原接口按整数报告已用百分比；零百分比不能证明滚动窗口尚未开始。此时不显示一个可能随刷新后移的确定倒计时，而显示窗口起点待确认。
- 明确的 EntitlementError 提示检查成员/工作区的 Go 订阅；一般 403 保持权限错误。401、429、服务错误和结构变更单独处理，绝不显示上游原始报错或凭据。
- 失败保留最近成功额度及更新时间；缺少或格式异常的关键字段不能变成“额度充足”。
- Go 用尽后，若用户在官方控制台开启 Use balance，可能继续使用 Zen 余额。当前接口不返回余额金额、该开关状态、账单或续费日；本版不声称读取了这些信息。

## 本机统计实现与边界

- 只读打开 SQLite，关闭扩展加载，启用 query_only，并在独立 Worker 中执行；应用只写自己的配置/索引。
- 在 SQLite 内按明确路径投影标识、时间、模型、项目和 Token 等叶子字段。不将整段消息 JSON、正文、工具结果、原始错误或凭据读入应用。
- 覆盖已核对的 legacy `message / part` 与新 `session_message` 结构。旧记录优先读取每个 step-finish，没有步骤记录时回退到消息保存的用量；不叠加步骤、消息和会话总量。
- 同会话有新版助手记录时，使用新版表示并排除旧版镜像。早于当前会话创建时间的复制历史被排除，并显示排除条数。此规则也可能排除导入的旧历史，覆盖范围明确不完整。
- OpenCode 的 input 为非缓存输入、output 为可见输出。适配时将缓存读写加回输入、推理加回输出，再纳入统一统计；缓存与推理在总量中各计一次。
- 缺失字段保留未知，明显不一致的总量不参与有效 Token 汇总。费用仍按用户设置的本机单价估算，不冒充平台实扣。
- 此来源统计已落盘的助手步骤/用量观察，不能认证完整 HTTP 调用次数、失败重试数或请求成功率。未报告的失败消耗无法补齐，健康与完成请求均值保持不可核对。
- 每次最多读取 100000 条记录，超限明确标记；重复读取不会重复累计，复制数据库出现同源重叠时暂停合并。数据库缺失、损坏、不支持的结构与其他来源隔离。
- 未连接真实 OpenCode 安装持续使用；本次依据固定官方代码和合成数据库验证，不声称兼容所有历史版本或未来数据库格式。

## 全套餐后续阶段

| 类型 | 本版结果 | 开放功能的前提 |
| --- | --- | --- |
| Go | 适配代码、模拟契约和桌面集成完成 | 真实订阅成员的成功响应与控制台核对仍待验证 |
| Zen | 明确账户类型和本机模型统计可分离；不显示虚构余额 | 确认可维护的余额查询接口、认证方式与权限 |
| Black | 预留后续适配方向，不显示已支持 | 官网暂停新订阅；需既有账户及独立额度查询契约 |
| 免费模型 / BYOK | OpenCode 本机来源可统计相应保存记录 | 账户额度由实际供应商接口决定，未返回不推断无限 |
| 企业网关 | 延用供应商能力与显式关联设计 | 对实际网关和计费协议逐项适配 |

Go 与其他类型不会因为同属 OpenCode 而共享同一“已支持”标记。后续可以增加统一平台分组；当前只开放已完成适配的 Go 账户入口，不用不可工作的占位套餐误导用户。

## 验证与交付

本版新增 15 项定向测试；桌面回归 249 项全通过，含固定版本 Harness 契约测试，未跳过；原 Sites 兼容测试 4 项通过。前端生产构建完成。最终包另检查 Go 深浅主题、三个额度窗口、悬浮窗排序/展开、失败保留旧数据、加密重载、OpenCode Worker SQLite 读取和历史去重。最终结果以 `verification-1.8.0-beta.5` 中实际报告为准。

交付：两种 Windows x64 EXE、Mac ARM64 全量开发试用包、源码交接 ZIP。保留旧发布包。Mac 仍需实机验证；未执行真实 Go 查询、真实 OpenCode 连续使用、Windows 安装向导或长期稳定性测试。

## 官方依据

调研源码固定为 `anomalyco/opencode@b65de4d6943ef35337f8f2bfdbb369f6d25e7e9f`，查看日期 2026-09-26。

- [Go 官方文档](https://opencode.ai/docs/go/)
- [Go 额度查询](https://github.com/anomalyco/opencode/blob/b65de4d6943ef35337f8f2bfdbb369f6d25e7e9f/packages/console/app/src/routes/zen/go/v1/usage.ts)
- [新旧控制台路由迁移](https://github.com/anomalyco/opencode/blob/b65de4d6943ef35337f8f2bfdbb369f6d25e7e9f/packages/console/app/src/lib/inference-proxy.ts)
- [SQLite 表定义](https://github.com/anomalyco/opencode/blob/b65de4d6943ef35337f8f2bfdbb369f6d25e7e9f/packages/core/src/session/sql.ts)
- [旧版 Token 转换与分叉复制](https://github.com/anomalyco/opencode/blob/b65de4d6943ef35337f8f2bfdbb369f6d25e7e9f/packages/opencode/src/session/session.ts)
- [旧版步骤落盘](https://github.com/anomalyco/opencode/blob/b65de4d6943ef35337f8f2bfdbb369f6d25e7e9f/packages/opencode/src/session/processor.ts)
- [新版 Token 转换](https://github.com/anomalyco/opencode/blob/b65de4d6943ef35337f8f2bfdbb369f6d25e7e9f/packages/core/src/session/runner/publish-llm-event.ts)
- [新版消息字段](https://github.com/anomalyco/opencode/blob/b65de4d6943ef35337f8f2bfdbb369f6d25e7e9f/packages/schema/src/session-message.ts)
- [Zen 余额接口需求](https://github.com/anomalyco/opencode/issues/10448)、[Black 当前状态](https://opencode.ai/black)
