# DeepSeek Harness 本地用量导出插件 1.4.0

此插件把 **启用后观察到的请求用量元数据** 写入本机专用目录，供 Token 用量助手读取。它不调用模型，不代理请求，不查询账户余额，也不读取已有会话文件。它是可选的 Harness 插件，卸载不会影响助手中的其他数据源。

## 支持范围

- 已锁定 Harness / `@deepseek-ai/dsh-session` **0.1.7-rc.1**，会话格式 **4**。
- 已复核上游源码提交 `46a7f68b0922371ce7144b668b90e377d8e799f4`；运行时检查安装包版本及会话格式。npm 发布包没有可核验的 `gitHead` 字段，因此 `harnessCommit` 表示本次复核的源码基准，不表示运行时对二进制提交的认证。
- Windows 首版；不宣称其他 Harness 版本、非官方同名应用或真实付费请求已验收。
- 已使用官方发布的 SessionStore 与 Cordis 实际事件派发进行无模型调用的集成验证，并用样例验证重试、取消、分叉、重复事件及隐私边界。
- 已使用官方 `dsh` CLI 实测独立 profile 中的本地目录安装、默认配置组合及卸载；另在只包含 SessionStore、插件和样例事件发生器的最小 profile 中完成实际启动、链接依赖解析及退出写盘验证。没有启动用户的现有 profile，也没有发起真实模型请求。
- 新增版本应先复核事件协议并运行测试；请勿通过手工修改 `source.json` 绕过版本检查。

## 安装与连接

普通使用只需已经正常运行的官方 **dsh 0.1.7-rc.1**，无需安装下文的开发测试运行时，也无需在插件目录单独执行 `npm install`。官方 `dsh plugin` 安装命令需要可用的 pnpm，可先运行 `pnpm --version` 检查。

先将插件 ZIP 完整解压到一个准备长期保留的位置，找到**直接包含 `package.json` 和 `index.js` 的那一层目录**；该目录同时还应有 `exporter.js`、`cordis.patch.yml`、`README.md` 和 `upstream-contract.json`，共 6 个文件。不要选择 ZIP 文件本身，也不要只复制 `index.js`。示例路径为 `D:\TokenUsageAssistant\integrations\deepseek-harness`，你的实际解压位置可以不同。

以下操作在本机终端执行；不需要把密钥交给助手或写进插件。请将 `my-profile` 替换成你**已配置并实际使用的 Harness profile 名称**，将命令中的路径替换为上述插件目录。先退出该 profile 当前运行的 Harness，再安装并重新启动同一 profile：

```powershell
dsh --version
dsh plugin --profile my-profile add "D:\TokenUsageAssistant\integrations\deepseek-harness"
dsh --profile my-profile --dump-config
dsh --profile my-profile
```

`--dump-config` 输出的组合应含 `dsh-token-usage-assistant` 层及 `token-usage-assistant` 行。正常加载后默认写入：

```text
%USERPROFILE%\.token-usage-assistant\harness\source.json
%USERPROFILE%\.token-usage-assistant\harness\usage.jsonl
%USERPROFILE%\.token-usage-assistant\harness\status.json
```

在 Token 用量助手的工具数据源设置中新增 **DeepSeek Harness**，选择该目录的 **`usage.jsonl`**。同目录 `source.json` 必须保留，它标识这套导出来源。`status.json` 提供固定错误码及采集缺口。新建空文件表示尚无已采集记录，不表示过去没有使用。

本地目录安装使用链接，所以安装后应保留插件目录；移动插件本身后，需要用新目录重新执行 `plugin add`。不必为了验证连接专门发起付费请求，空的导出文件也可连接。

需要改变导出位置时，在 Harness profile 的 `cordis.patch.yml` **合并**以下覆盖，保留文件中原有的其他配置（此插件仅支持 `outputDirectory` 一项配置）。该文件通常位于 `%USERPROFILE%\.dsh\profiles\my-profile\cordis.patch.yml`；若自行设置过 `DSH_HOME`，则位于其 `profiles\my-profile` 目录下：

```yaml
- id: token-usage-assistant
  config:
    outputDirectory: 'D:\TokenUsageData\Harness'
```

迁移已有来源时，先停止 Harness，再整体移动专用目录中的三个文件，然后修改配置与助手中的路径；保留 `source.json` 的身份。不应复制同一个来源后作为第二套独立用量相加。复制目录保留的身份使助手能够识别重复来源。

暂停导出时，先退出该 profile 的 Harness，再卸载插件；随后可以照常启动 Harness：

```powershell
dsh plugin --profile my-profile remove dsh-token-usage-assistant
```

卸载保留导出文件。恢复采集时，保留原来的导出目录、`source.json` 和自定义 `outputDirectory` 配置，重新执行本节的 `plugin add` 并启动同一 profile，即可延续原来源身份；但**不补采停用期间的历史**。

助手端对数据源的“停用”或“移除”只停止助手读取；它不会卸载 Harness 插件，也不会删除导出记录。需要停止文件继续增长时，应按上面的步骤停用导出插件。

**更新插件**（2026-10-19，T4.7）：Windows 上多个 Harness 进程同时导出到同一目录时，旧版插件偶尔会因为锁文件或 `status.json` 被另一个进程占用而停止导出（助手显示该来源 `io-error`）。新版会在短时间内重试，导出格式与 `source.json` 身份都不变（导出器版本仍为 1.4.0）。更新方法：先退出该 profile 的 Harness，按上面的步骤 `remove` 再 `plugin add` 重新安装插件，然后启动同一 profile；已有导出目录和来源身份保持不变。

## 采集和计数规则

插件监听官方 `session/event(session, event)` 提交后事件。只访问会话身份、项目目录、事件序号与时间、turn/step、provider/model、状态及 usage 计数白名单。对话正文、工具参数与结果、系统提示词、凭据、错误正文和回放数据均不访问或导出；测试用会抛异常的 getter 验证这些字段没有被读取。

- 仅在观察到 `step/start` 或 `llm/retry-started` 后建立尝试；启用时已在进行的尝试如果缺少起点，会标记 `missing-attempt-boundary`，不会伪造归属或扫描历史。
- 流式数据在 Harness 完成一次尝试并提交事件后采集；不是逐个文本块实时刷新。优先使用最终 `data.usage`，否则取流中最后一条 usage。相同尝试后续更新用更大 `revision` 替换，不能把每一行相加。
- `llm/retry-started` 开始新的尝试；已失败尝试的已报告用量仍保留。取消前报告的用量也保留，完成率只使用完成请求口径。
- 会话分叉的 `seq < inheritedEventCount` 不计入子会话；子任务自己的新调用使用独立 session 身份。不同会话中的相同 turn/step 不会撞号。
- Harness 的 `inputTokens` 是**未缓存输入**；导出命名为 `uncachedInputTokens`。缓存读取、缓存写入与它互斥；推理 Token 是 output 的子集，不能再次累加。缺失计数写 `null`，不是 0。
- 记录不关联账户，`accountId` 固定为 `null`。项目、会话、模型的统计属于工具报告用量，不是平台全量账单。
- 文件写入通过异步队列和跨进程文件锁串行完成，事件观察器不等待磁盘。队列满、磁盘错误或未知协议会暂停该插件的导出并记录固定错误码，不阻断 Harness 请求。异常退出可能留下尚未写入的尾部记录，这类覆盖缺口不能当成零用量。
- 同一目录支持最多 24 个活动插件实例；状态文件汇总各实例，关闭一个实例不会将其他活动实例误标为停止。已知采集缺口会保留，重启或另一个健康实例不能抹去这段缺失。只有来源开始后的记录可用于分析，不能将缺口消失视为已补采。

## JSONL 协议 v1

`source.json` 中的 `schema` 为 `token-usage-assistant.harness-source`，`schemaVersion` 为 1，包含 `sourceId`、`tool`、`harnessVersion`、`harnessCommit`、`sessionFormatVersion`、`exporterVersion` 和 `createdAt`。

`usage.jsonl` 每行是一个尝试的**完整替换快照**：

| 字段 | 含义 |
|---|---|
| `schema` / `schemaVersion` | `token-usage-assistant.harness` / `1` |
| `sourceId` / `tool` | 稳定来源身份 / `deepseek-harness` |
| `harnessVersion` / `exporterVersion` | `0.1.7-rc.1` / `1.4.0` |
| `sessionId` / `requestId` / `attemptId` | 会话 / 会话与 turn、step / 再加本次尝试起点事件序号 |
| `revision` | 本次更新对应的会话事件序号；同尝试取最大值 |
| `timestamp` / `updatedAt` | 尝试起点 / 本次事件时间，Unix 毫秒 |
| `provider` / `model` / `project` | 有依据时填写；没有时为 `null` |
| `status` | `pending`、`completed`、`failed`、`cancelled` 或 `unknown` |
| `usageReported` | 是否至少观察到一次明确 usage |
| `usage` | `uncachedInputTokens`、`outputTokens`、`cacheReadTokens`、`cacheWriteTokens`、`reasoningTokens`、`totalTokens`，非负整数或 `null` |
| `coverageStart` | 本次插件激活时间；不是完整历史覆盖承诺 |
| `provenance` / `accountId` | `harness-plugin/provider-reported` / `null` |

记录键为 `(sourceId, attemptId)`。消费者必须校验版本、来源一致性及字段类型；同键只保留最大 `revision`。未知格式须明确报不支持。金额、密钥、正文及原始请求对象不在协议内。

## 无模型调用的复验

本节供开发复验，普通安装无需执行。以下命令要求解压**完整助手源码包**并在其根目录运行；独立插件 ZIP 不包含 `tests/`，不能单独运行这些源码测试。

从助手源码根目录运行常规样例：

```powershell
node --test tests/harness-plugin.test.cjs
```

安装**隔离的开发测试运行时**并运行真实 SessionStore 契约测试（仅安装包，不触发模型请求；不要安装到用户现有 Harness profile）：

```powershell
npm install --prefix work/harness-runtime-1.4 --ignore-scripts --no-audit --no-fund --save-exact @deepseek-ai/dsh-session@0.1.7-rc.1 @deepseek-ai/cordis@4.0.4
$env:TUA_HARNESS_CONTRACT_RUNTIME = (Resolve-Path work/harness-runtime-1.4).Path
node --test tests/harness-plugin.test.cjs
```

未设置此环境变量时，安装包契约测试明确显示跳过；这不等同于通过。完整 Harness profile 中的长期运行、真实工具请求与真实账户核账另行记录。

还可复验官方 CLI 的本地安装及实际启动路径：

```powershell
npm install --prefix work/harness-cli-validation-1.4 --ignore-scripts --no-audit --no-fund --save-exact @deepseek-ai/dsh@0.1.7-rc.1
$env:TUA_HARNESS_CLI_RUNTIME = (Resolve-Path work/harness-cli-validation-1.4).Path
node --test tests/harness-plugin.test.cjs
```

此项测试自动在临时目录设置独立 `DSH_HOME`，执行 `plugin add`、`--dump-config`、最小 profile 启动、`plugin remove` 后清理，绝不修改用户现有 Harness 配置。两个测试环境变量均设置时，本文件的 16 项测试全部执行；未设置的外部运行时检查会明确跳过。助手的 CI 自 T8.10 起按本节方法安装这两个运行时，这些测试在 CI 上每次都运行。

## 上游依据

- [事件与生命周期](https://github.com/deepseek-ai/deepseek-harness/blob/46a7f68b0922371ce7144b668b90e377d8e799f4/packages/core/session/src/types.ts)
- [官方 TokenUsage 定义](https://github.com/deepseek-ai/deepseek-harness/blob/46a7f68b0922371ce7144b668b90e377d8e799f4/packages/llm/llm/src/types.ts)
- [用量投影与重试替换规则](https://github.com/deepseek-ai/deepseek-harness/blob/46a7f68b0922371ce7144b668b90e377d8e799f4/packages/llm/token-meter/src/usage-projection.ts)
- [官方插件安装说明](https://github.com/deepseek-ai/deepseek-harness/blob/46a7f68b0922371ce7144b668b90e377d8e799f4/docs/user/develop/basic/publish.md)

复核信息另见 `upstream-contract.json`。
