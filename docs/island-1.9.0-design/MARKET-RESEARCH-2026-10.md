# 刘海 / 灵动岛 / 菜单栏仪表类产品市场调研（2026-10）

> - 性质：**只读案头调研**，日期 2026-10-18。没有安装或下载任何软件；本机只运行了系统自带的只读命令（`ioreg`、`sysctl`、`vm_stat`），并用项目已装好的 Electron 44.4.4 跑了一个临时脚本探测 API（脚本和它的临时数据目录用完已删除）。
> - 来源：厂商官网、GitHub README / issue / 源码、第三方评测。很多 2026 年的「横评」页面由竞品厂商发布，下文会注明；这类页面里的批评只作线索。
> - 引用：以中文转述为主，不大段复制原文。凡是没有拿到一手来源或没有亲自核实的结论，标「未核实」。
> - 与旧调研的关系：更新并扩充 [HANDOFF.md](HANDOFF.md) 第 2 节（2026-10-01）。旧表中需要更正的地方集中列在第 6 节，本文**不修改** HANDOFF.md。
> - 背景：T7.1 POC 之后，用户决定以「点菜单栏托盘图标弹出面板」为主（下称 **B**），刘海悬停下落面板作为可选特色（下称 **A**）。本文为「是否加入歌曲信息、CPU/GPU/内存等通用内容」这一取舍提供依据。

---

## 0. 结论速览

1. **用户最看重的是「不点开也能看到」和「平时不打扰」**。口碑最稳的产品都很克制：MediaMate 只在系统事件发生时弹出 HUD；CodexBar 和 Status Trio 让菜单栏图标本身就是仪表。差评集中在**耗电/CPU、系统升级后功能失效、钥匙串弹窗反复出现、数据显示错误**这四类。
2. **AI 编程用量类工具在 2026 年已经很拥挤**（CodexBar 2.26 万星，宣称支持 106 个供应商），但它们几乎都靠**借用本机已有凭据**（钥匙串里的 OAuth 令牌、`~/.codex/auth.json`、浏览器 Cookie）去调**非公开接口**。这条路与本项目的凭据红线正面冲突，也是它们反复出现钥匙串弹窗、接口失效的根源。
3. **直接同行 Vibe Island 的公开 issue 里，最多的一类就是额度显示错误**：多个账户被合并、Codex 的 credits 与美元按固定比例换算导致可能少显示 25 倍、Claude 额度回落成显示 Codex。这些恰好是本项目红线（账户归属、币种不换算、缺失不伪造）在处理的问题，**「数字可信」可以作为本项目的差异点**。
4. **歌曲信息不建议做**：macOS 15.4 起第三方读取「正在播放」需要系统授权，boring.notch 的变通做法要打包自编译的原生 framework，还要借用一个苹果自己承认是疏漏的检查漏洞；按应用走 AppleScript 的退路，在 macOS 26 上对「音乐」App 也坏了。这一项三道筛子都过不去。
5. **整机 CPU/GPU/内存监控技术上能做，但不建议进岛或托盘面板**：Stats（免费，4.26 万星）和 iStat Menus（$11.99）已经做透；macOS 上「空闲内存」的口径会误导人（本机实测 16 GB 机器只报 0.06–0.56 GB 空闲）；周期采样本身就是耗电差评的来源。与 AI 编程相关、值得留意的是「**本机模型占用**」（例如 Ollama 的 `/api/ps`），但它涉及新的本机网络读取契约，需要用户拍板。

---

## 1. 调研范围与分类

| 类别 | 产品 | 与本项目的关系 |
|---|---|---|
| 刘海 / 灵动岛（通用） | NotchNook、boring.notch、NotchNest、NotchDrop、MediaMate（HUD 类）；顺带 Alcove、Atoll | A 的交互参照；功能大多与用量无关 |
| 刘海（AI 编程代理） | Vibe Island；顺带 Coucou、Notchcode、Chimlo、Claude Notch 等 | 直接同行，但定位是「遥控器」 |
| 菜单栏系统仪表 | Stats、iStat Menus 7 | 通用监控取舍的依据 |
| 菜单栏 / 程序坞状态合并 | Status Trio（及其 Codex 额度分叉） | B 的交互参照 |
| 菜单栏 AI 编程用量 | CodexBar、ClaudeBar、claude-limits、Claudius、Usage4Claude、ClaudeUsageBar、cclimit；命令行的 ccusage | 功能最接近，数据来源路线不同 |

交互形态的记法：**刘海悬停**（鼠标移到刘海附近展开）· **菜单栏弹出**（点菜单栏图标弹出面板或菜单）· **程序坞图标**（Dock 图标本身显示状态）· **悬浮窗**（独立浮动窗口或顶部浮动条）· **事件弹出**（只在系统事件发生时短暂出现）。

---

## 2. 产品逐个记录

### 2.0 总表

| 产品 | 价格（2026-10） | 交互形态 | 资源占用口碑 |
|---|---|---|---|
| NotchNook | $25 买断（5 台）或 $3/月，48 小时试用 | 刘海悬停 → 点击或下滑进一步展开；无刘海时为浮动条 | 竞品博客称耗电（未核实） |
| boring.notch | 免费，GPL-3.0 | 刘海悬停展开（细节未核实） | 曾有空闲掉电约 5%/小时（已修） |
| MediaMate | €6.99 起，买断 | 事件弹出（HUD，可放刘海内或独立气泡） | 未见负面 |
| NotchNest | 免费 + 内购（$2.99/月、$14.99/年、$14.99 终身） | 刘海悬停；无刘海和外接屏也能用 | 更新说明里提到降低空闲 CPU |
| NotchDrop | 开源免费，MIT；App Store 有付费版 | 把文件拖到刘海 | 未见 |
| Vibe Island | $19.99 买断（1 台），含约一年更新 | 刘海面板 + 点击跳转 + 快捷键；外接屏为顶部浮动条 | 厂商自称 < 100 MB |
| Stats | 免费，MIT | 每个模块一个菜单栏项 + 弹出详情 | 作者承认部分模块耗电 |
| iStat Menus 7 | $11.99 买断（3 台） | 菜单栏项 + 下拉详情 | 官方称 v7 CPU 约为 v6 的 1/5 |
| Status Trio | 免费，Apache-2.0 | 菜单栏 / 程序坞图标绘制状态；左键弹出面板，右键原生菜单 | 自述以系统事件为主、慢轮询兜底 |
| CodexBar | 免费，MIT | 菜单栏动态条形图标 + 下拉菜单 | 高 CPU、大量写盘、钥匙串弹窗的 issue 较多 |
| ClaudeBar | 免费，Apache-2.0 | 菜单栏百分比 + 倒计时；可选刘海、Touch Bar | 未见 |

### 2.1 NotchNook

- **价格**：$25 买断（最多 5 台 Mac）或 $3/月（2 台），48 小时试用，没有永久免费版；2024 年 1 月上市时 $39.99，后来降价（来源：[FavTray 对比页](https://favtray.com/blog/notchnook-vs-boring-notch)，作者另有竞品 FavShelf）。
- **核心功能**：媒体控制、文件托盘 + AirDrop、日历、天气、快捷指令、镜子（摄像头），1.6 版加入音量/亮度 HUD、计时器、待办。需要 macOS 14.6+。
- **交互**：鼠标悬停在刘海上时展开，点击或双指下滑进一步展开；无刘海 Mac 上显示为浮动条。
- **好评**：iMore（2024-07）称赞文件托盘，觉得它和 macOS 融为一体、终身价值得（[iMore](https://www.imore.com/apps/mac-apps/this-dollar25-app-gives-my-macbook-pro-a-dynamic-island-and-it-was-worth-every-penny)）；How-To Geek（2024-10）评它为 Mac 上功能最全、最精致的灵动岛实现（[How-To Geek](https://www.howtogeek.com/these-apps-turn-your-macbook-notch-into-a-dynamic-island/)）。
- **差评**：价格偏高、不少功能尚在开发（[Root-Nation](https://root-nation.com/en/soft-en/apps-en/en-notchnook-review/)）；Live Activity 会把刘海撑宽（How-To Geek，可关闭）；外接屏上画「假刘海」（[MacNotch 横评](https://macnotch.io/compare/best-mac-notch-apps)，作者是竞品厂商）。
- **2026-09 停摆风波（新）**：MacMagazine 2026-09-16 报道，开发商 lo.cafe 因股权纠纷，授权、域名等系统的控制权出了问题，用户无法打开、激活或退款（[MacMagazine](https://macmagazine.com.br/post/2026/09/16/crise-na-lo-cafe-deixa-notchnook-fora-do-ar-e-usuarios-sem-reembolso/)）；论坛用户反馈授权接口返回 402，已购终身授权变成「未注册」（[MM 论坛](https://forum.macmagazine.com.br/topic/394448-notchnook-n%C3%A3o-registra-a-licen%C3%A7a-network-error-e-api-de-licenciamento-locafe-fora-do-ar/)）。10-07 起在 getnotchnook.com 重新开售，但运营方是谁、旧授权是否有效，FavTray 也没能确认（**未核实**）。Homebrew 9 月停用其 cask 的说法来自搜索摘要（**未核实**）。
- **资源口碑**：Seam 博客称用户反映持续耗电和不稳定（竞品，**未核实**）；NotchNest 的一条 App Store 评论说因 NotchNook 耗电而卸载（单个案例）。
- **启示**：依赖在线授权的应用，授权服务一停就整体不可用。本项目没有在线授权，这本身就是稳定性优势。

### 2.2 boring.notch（The Boring Notch）

- **价格**：免费开源，**GPL-3.0**，约 1.11 万星（[GitHub](https://github.com/TheBoredTeam/boring.notch)）。需要 macOS 14+。
- **核心功能**：带可视化效果的音乐控制、日历/提醒、文件架 + AirDrop、音量/亮度/键盘背光 HUD 替换、充电指示、镜子。路线图里还有扩展系统、锁屏组件等。
- **正在播放的实现**：README 说明借助 [mediaremote-adapter](https://github.com/ungive/mediaremote-adapter) 在 macOS 15.4+ 继续读取正在播放（原理见 §4.2）。
- **好评**：How-To Geek 评它为最好的免费选择；社区大、开发活跃（FavTray 称 2.8 RC 于 2026-09-25 发布）。
- **差评**：
  - 没有付费开发者账号，未公证，首次打开要去系统设置里点「仍要打开」（README、FavTray）。处境与本项目 D4 相同。
  - 多显示器偶有问题，顺滑度不如 NotchNook（FavTray，竞品方）。
  - 系统升级反复打断媒体功能：15.5 上歌曲信息不显示，且系统从不弹出自动化授权（[#574](https://github.com/TheBoredTeam/boring.notch/issues/574)）；macOS 26 上「Apple Music」来源失效（[#779](https://github.com/TheBoredTeam/boring.notch/issues/779)），维护者确认是苹果把「音乐」App 的 AppleScript 弄坏了，项目无法修复，标为 wontfix（[#871](https://github.com/TheBoredTeam/boring.notch/issues/871)）。
- **资源口碑**：[#338](https://github.com/TheBoredTeam/boring.notch/issues/338)：M4 MacBook Pro 空闲时每小时掉电约 5%，另一位用户把负载追到 WindowServer，续航从十几小时掉到几小时；2025-07 修复并经用户确认。FavTray 称 2.8 RC 修复了部分用户的高 CPU 问题（**未核实**）。
- **旧表更正**：旧表写「MIT，5k+ 星」，现为 GPL-3.0、约 1.11 万星。旧表说它把「截屏隐私」当卖点，本次在 README 中没有找到相关描述（**未核实**）。

### 2.3 MediaMate

- **价格**：Gumroad 官方 €6.99 起，1 份授权可用 5 台设备，14 天退款；第三方商店标 $6.99–$8.99（[MacUpdate](https://mediamate.macupdate.com/)、[FindMacApps](https://findmacapps.com/apps/mediamate/)）。需要 macOS 13+，有刘海、无刘海、Touch Bar 机型都能用。
- **核心功能**：重绘音量、亮度、键盘亮度 HUD，新增「正在播放」HUD（可显示在刘海内或独立气泡），多套主题。
- **交互**：**事件弹出**：按音量键、换歌时才出现，平时不占位置。不做文件架等枢纽功能。
- **好评**：Gumroad 显示 4.9 分 / 316 个评分、1.1 万多份销量（来自搜索摘要，Gumroad 页面本次未能直接抓取，**未核实**）；AppsnTips 认为它是同类里工作得最好的（[AppsnTips](https://www.appsntips.com/best-paid-affordable-mac-apps/)）；Crest 横评评价它精致、稳定、实惠（[Crest](https://crestnotch.app/best-mac-notch-apps)，竞品方）。
- **差评**：刻意做得很窄（没有文件架、剪贴板、组件）；Touch Bar 模式开发者自己说可能不太可靠（Crest 转述）；MacUpdate 上一条 2026-10-12 的德语评论说系统更新后失效（单个案例，**未核实**）。
- **启示**：**只做一件事 + 只在有事时出现**，是口碑最稳的组合。

### 2.4 NotchNest

- **价格**：Mac App Store 免费下载，内购 $2.99/月、$14.99/年、$14.99 终身；免费版有数量限制（书签 1 个、剪贴板 5 条、文件托盘 2 个、镜子 3 秒等）（[App Store](https://apps.apple.com/us/app/notchnest-dynamic-notch-bar/id6747612321?mt=12)、[官网](https://notchnest.app/)）。需要 macOS 14+。
- **核心功能**：AI 剪贴板（Apple Intelligence 本机运行）、音乐控制、文件托盘、日历、笔记、番茄钟、书签、镜子。
- **交互**：刘海悬停；无刘海 Mac 和外接屏上也能用。
- **好评**：App Store 评论说它跟手、完成度高、好看（只有 4 条评论，样本很小）。
- **差评**：换歌弹出的曲名一闪就没、来不及看；想关掉播放器的白色光晕；免费版镜子只有 3 秒。
- **资源口碑**：没有评论批评耗电；1.2.5 更新说明提到降低空闲 CPU；版本历史里有多次崩溃修复。
- **旧表更正**：旧表写「$14.99 买断」，现为免费 + 内购（含订阅）。

### 2.5 NotchDrop

- **价格**：开源 MIT，约 2.1k 星，自行编译免费；App Store 有付费版（How-To Geek 2024 年写 $1.99，现价**未核实**）（[GitHub](https://github.com/Lakr233/NotchDrop)）。
- **核心功能**：只做一件事：把文件拖到刘海暂存（默认保留 1 天，可调）并支持 AirDrop。README 称与菜单栏管理器兼容。
- **评价**：How-To Geek 认为它专注但没有媒体功能；自行编译的版本是 ad-hoc 签名，首次打开要右键 → 打开。资源占用未见口碑。

### 2.6 Vibe Island（直接同行）

- **价格**：$19.99 买断（1 台，早鸟价；2 台、3 台档位未标价），含约一年更新，到期后功能保留，有免费试用（[官网](https://vibeisland.app/)）。
- **核心功能**：官网宣称支持 30 个 AI 编程代理（GitHub 仓库写 25 个，旧表写 26 个）。会话状态一览；权限请求审批（Allow/Deny，带编辑 diff 预览）；回答 AskUserQuestion；跳回到对应终端的标签页或分屏；计划审阅；8-bit 提示音；SSH 远程会话；用量显示（Claude、Codex、Kimi、GLM、DeepSeek，5 小时 / 7 天百分比和重置时间）。首次启动会自动给各 CLI 写入 hooks。
- **交互**：刘海面板展开；点击会话跳回终端；快捷键（⌘Y 允许、⌘N 拒绝）；外接屏或无刘海 Mac 上显示为顶部居中的紧凑浮动条；面板是不抢焦点的浮层。
- **好评**（[vibecoding.app 评测，2026-08](https://vibecoding.app/blog/vibe-island-review)）：跳回终端是最大亮点；一次启动就配好；额度和会话状态在同一面板；原生应用，不是 Electron。
- **差评**（同上）：26 个代理里只有 Claude Code、OpenCode、MiMoCode 能在面板里审批和回答，其余只能看；闭源；没找到隐私政策页；试用和授权校验要联网；几乎每天发版，默认设置会被悄悄改掉，例如某个版本默认开启全局快捷键，抢占了 Ctrl-U 等 shell 快捷键；有付费用户新鲜感过后就不用了。
- **资源口碑**：官网自称内存 < 100 MB、空闲 CPU 接近 0（厂商自述，没有独立测量）。
- **额度数据从哪来、错在哪（重点，均为 2026 年仍 open 的 issue）**：
  - [#249](https://github.com/vibeislandapp/vibe-island/issues/249)（10-01）：用户报告中写明，Claude 用量是拿钥匙串里 Claude Code 的 OAuth 凭据去拉取的，结果缓存在 `~/.vibe-island/` 下。同一台机器上三个 `CLAUDE_CONFIG_DIR` 账户被识别成两个，一个账户的数据被并进了另一个账户：B 账户的 7 天用量本应是 33%，却一直显示 A 账户的 2%。用户只能关掉应用、手动删掉库里的记录才恢复。
  - [#259](https://github.com/vibeislandapp/vibe-island/issues/259)（10-15）：Codex 企业版的月度用量疑似少显示 25 倍。应用把 app-server 返回的 `used`/`limit` 按「25 credits = 1 美元」固定换算，但接口响应里没有币种或单位字段。报告人的诉求是：单位不确定时，不要把换算结果当作权威美元金额显示。
  - [#226](https://github.com/vibeislandapp/vibe-island/issues/226)（08-26）：Claude 一直进不了可用供应商列表，额度胶囊回落成显示 Codex；钉选 Claude 后显示「无法读取」，几秒后又被改回 Codex。报告人推测是本机 OAuth 数据和 SSH 远程传来的 statusLine 快照被当成了两个账户。
  - issue 首页能看到的 open issue 中，额度显示类最多（另有 [#254](https://github.com/vibeislandapp/vibe-island/issues/254)、#250、#233），共 96 个 open issue（[issue 列表](https://github.com/vibeislandapp/vibe-island/issues)）。
- **启示**：这三个 bug 分别对应本项目已有的三条红线：多 Key 不自动归组 / 不从活动平台推断归属；USD 与 CNY 分开、不换算；缺失显示「—」、不借用其他来源的数据。**这是本项目可以明确做得更好的地方**。

### 2.7 其他 AI 编程代理刘海类（简记）

2026 年这一品类迅速变得拥挤，大多免费开源，核心卖点是「审批 + 通知」，用量只是附带：

- **Coucou**：MIT，约 5.4k 星（[GitHub](https://github.com/Louis-CFM/coucou)）。刘海里有一个吉祥物，鼠标悬停时探出、空闲时隐藏；支持 Claude Code、Codex 等的审批，显示会话步骤和 diff，有 Claude / Codex 额度胶囊，另有听写、语音助手、AI 聊天、iPhone/Android 联动。通过 hooks 加 Unix socket 接入，写入 `~/.claude/settings.json` 前会先展示 diff；自述无人查看时暂停轮询。
- Notchcode、Chimlo、Claude Notch、CodeIsland、Notchy.ai 等（来源：[Product Hunt：Notchcode](https://www.producthunt.com/products/notchcode)、[Product Hunt：Chimlo](https://www.producthunt.com/products/chimlo-agents-in-your-macbook-notch)、[Claude Notch](https://claude-notch-nik.vercel.app/)、[DEV 文章](https://dev.to/krisying/i-turned-my-macbooks-notch-into-a-control-center-for-ai-coding-agents-2o57)、[Notchy.ai](https://notchy.ai/)）：同类思路，细节**未逐一核实**。
- 通用刘海应用 MacNotch 也加了「AI coding（Beta）」模块（[MacNotch 横评](https://macnotch.io/compare/best-mac-notch-apps)）。

### 2.8 Stats（exelban/stats）

- **价格**：免费开源，MIT，约 4.26 万星（[GitHub](https://github.com/exelban/stats)）。需要 macOS 12+。
- **核心功能**：CPU、GPU、内存、磁盘、网络、电池、风扇（标为不再维护）、传感器（温度/电压/功耗）、蓝牙设备、多时区时钟。GPU 占用通过 IOKit 的 `IOAccelerator` 读取 `PerformanceStatistics` 里的「Device Utilization %」等键（[源码 reader.swift](https://raw.githubusercontent.com/exelban/stats/master/Modules/GPU/reader.swift)，已读源码核实）。
- **交互**：每个模块一个菜单栏项，点击弹出详情面板。
- **好评**：被普遍当作 iStat Menus 的免费替代；HN 上有用户用它查出 GPU 在空闲时耗电约 20W（[HN](https://news.ycombinator.com/item?id=42881342)）。
- **差评与资源**：作者 FAQ 承认周期读取并不便宜，每个模块各有代价，传感器和蓝牙最耗，关掉最多能省一半（README）；[#2554](https://github.com/exelban/stats/issues/2554)：M4 Pro 上只开了传感器，12 小时能耗排到第二，仅次于 Chrome；[#3650](https://github.com/exelban/stats/issues/3650)：macOS 27 上功耗显示 0W；[#2704](https://github.com/exelban/stats/issues/2704)：macOS 26 上菜单栏什么都不显示，要在系统设置里允许它出现在菜单栏。

### 2.9 iStat Menus 7（Bjango）

- **价格**：直购 $11.99 买断（3 台），家庭版 $14.99，从 v6 升级 $9.99；14 天试用；也在 Setapp 订阅里；天气数据另行计费（[Forbes 2024-09](https://www.forbes.com/sites/barrycollins/2024/09/07/istat-menus-7-review-this-great-mac-app-has-just-got-better/)、[Michael Tsai](https://mjtsai.com/blog/2024/08/01/istat-menus-7/)；2026-08 直购价仍为 $11.99 的说法来自搜索摘要，可能出自 [Cindori](https://cindori.com/reviews/istat-menus-vs-sensei-which-monitor-wins)，**未逐页核实**）。官网价格由脚本渲染，本次没有抓到。7.5 版需要 macOS 13.5+（[官网](https://bjango.com/mac/istatmenus/)）。
- **核心功能**：CPU、GPU（占用、显存、温度、频率）、内存（含内存压力、压缩、交换）、磁盘、网络（按应用）、传感器与风扇控制、电池与蓝牙配件电量、天气、世界时钟、规则通知；「Combined」模式把多项合并成一个菜单栏项。
- **交互**：菜单栏项 + 下拉详情。
- **好评**：价格公道、没有改成订阅（Forbes、Michael Tsai、[MPU 论坛](https://talk.macpowerusers.com/t/new-istat-menus-7/38018)）；官方称 7.0 的 CPU 占用低至 v6 的约 1/5（[版本历史](https://bjango.com/mac/istatmenus/versionhistory/)）。
- **差评**：App Store 上有评论说 v7 bug 多、缺选项（来自搜索摘要，**未核实**）；2018–2019 年的老版本被批 CPU 占用 1.4%–2.8%（随刷新频率变化，[Mac-Forums](https://www.mac-forums.com/threads/istat-menus-performance.346900/)、[MacRumors](https://forums.macrumors.com/threads/istat-menus-cpu-usage-power-consumption.2131152/)）；v7 没有找到集中的耗电投诉（**未核实**）。

### 2.10 Status Trio（及其 Codex 额度分叉）

- **价格**：免费开源，Apache-2.0，约 690 星，1.5.1 版发布于 2026-10-09（[GitHub](https://github.com/lingyired/status-trio)、[官网](https://statustrio.lingai.net/)）。
- **核心功能**：把 Wi-Fi、电池、音量合成一个紧凑图标（灵感来自 iPhone 的组合状态栏）；正在播放的蓝牙设备会替换中间图形。
- **交互**：**菜单栏图标 + 程序坞图标**画的是同一个组合状态图标，可只放菜单栏、只放程序坞或两者都放；**左键弹出状态面板**（Wi-Fi、蓝牙、电池详情、音频设备，各区块可排序），**右键弹出原生菜单**；没有主窗口。
- **隐私与发布**：自述状态主要来自系统事件，慢轮询兜底；不要求钥匙串权限；可选的匿名统计在新安装时询问、升级用户默认关闭；发布的 DMG 是 ad-hoc 签名、未公证（与本项目 D4 同样处境）。
- **Codex 额度分叉**（[chinayuren2022-2025/status-trio](https://github.com/chinayuren2022-2025/status-trio)，[说明文档](https://github.com/chinayuren2022-2025/status-trio/blob/main/docs/codex-quota.md)）：可选把图标底部的音量点换成 Codex 5 小时或每周剩余额度（4 个点）。数据来源是读取 `~/.codex/auth.json` 里的访问令牌，请求 `chatgpt.com/backend-api/wham/usage`；文档自己承认这不是有文档的稳定接口。每 60 秒拉取一次；按 `limit_window_seconds` 区分窗口，而不是按槽位顺序；数据缺失、过期或超过 2 分钟一律显示空心点，不显示 0% 或 100%；请求失败会清空数值。
- **启示**：它是 B 的直接参照，说明「图标即仪表 + 左键面板 / 右键菜单」这套形态成立。分叉在「缺失不伪造成 0」上与本项目红线一致；但它**借用 Codex 登录令牌、调用非公开接口**，路线与本项目相反（本项目用 app-server 白名单方法）。另外它失败就清空，而本项目的规则是保留上次成功值及其时间。

### 2.11 菜单栏 AI 编程用量类

**CodexBar**（[GitHub](https://github.com/steipete/CodexBar/)，MIT，约 2.26 万星，macOS 14+）

- **功能**：宣称支持 106 个供应商；每个供应商一个菜单栏图标（带动态条形的小仪表），或合并成一个图标再切换；下拉菜单里有重置倒计时、按历史快照画的配额燃尽、「均匀使用」参考线；本机费用估算扫描、桌面小组件、命令行工具、Linux 版；每周重置时撒彩带。
- **数据来源**：README 说明它借用你已有的凭据：Claude 从钥匙串读 OAuth 凭据，Codex 走 OAuth，Cursor、OpenCode 等读浏览器 Cookie，还有 CLI/RPC、本机日志和 API Key。Safari Cookie 需要完全磁盘访问权限。
- **好评**：星数说明它是这一类里最受欢迎的；用户文章和高校知识库都把它推荐为在菜单栏查看 Codex / Claude 余量的工具（[note.com 用户文章](https://note.com/renkon40/n/n0e45c8b70aba?hl=en)、[UMD 知识库](https://ask.eng.umd.edu/161146)，只看了标题和摘要，正文**未核实**）。
- **差评与资源**：
  - [#3882](https://github.com/steipete/CodexBar/issues/3882)（2026-09）：0.60.4 启动 20 分钟后 CPU 82%–134%、常驻内存约 900 MB；0.56.3 被系统记录持续写盘，约 20 小时写了 8.6 GB。关联原因是每次刷新都重新做一次完整的签名校验。
  - [#1217](https://github.com/steipete/CodexBar/issues/1217)：内嵌网页子进程 CPU 超过 150%、内存约 1.3 GB；[#1311](https://github.com/steipete/CodexBar/issues/1311)：关掉网页相关功能后 CPU 仍然偏高。
  - 钥匙串弹窗反复出现：[#340](https://github.com/steipete/CodexBar/issues/340)、[#679](https://github.com/steipete/CodexBar/issues/679)、[#1877](https://github.com/steipete/CodexBar/issues/1877)、[#1991](https://github.com/steipete/CodexBar/issues/1991)、[#2115](https://github.com/steipete/CodexBar/issues/2115)，其中有「始终允许」之后仍每隔几分钟弹一次的报告。

**ClaudeBar**（[GitHub](https://github.com/tddworks/ClaudeBar)，Apache-2.0，约 1.5k 星，macOS 15+）

- 支持 20 多个供应商，与本项目重合度高（Command Code、MiniMax、Z.ai、DeepSeek、OpenCode Go 等）；菜单栏最多同时显示 3 个供应商的百分比和倒计时，有健康 / 警告 / 危急 / 耗尽四级状态；可选显示在刘海、Touch Bar、iPhone 锁屏；有「排行榜」可分享每日 Token 总量（是否默认关闭**未核实**）。各供应商的数据来源 README 没写，见各自文档（**未核实**）。

**小型 Claude 专用工具**（都是菜单栏形态，免费开源）

- claude-limits：从钥匙串读 Claude Code 的 OAuth 令牌，调用 Claude Code `/usage` 背后的同一个接口，在 50%、80%、90% 时发系统通知（[GitHub](https://github.com/figueiredouc/claude-limits)）。
- Claudius：显示何时用完、按当前速度每天能用多少、哪些会话最耗（[GitHub](https://github.com/Abd-K/claudius-claude-code-usage)）。
- Usage4Claude：双环图标，约 225 星（[AlternativeTo](https://alternativeto.net/software/usage4claude/about)）。
- ClaudeUsageBar 使用会话 Cookie（[官网](https://www.claudeusagebar.com/)）；cclimit 主打用完时间预测和按项目拆分（[官网](https://cclimit.app/)）。

**ccusage**（命令行，[README 镜像](https://b-lab.team/en/content/88c40ba4-4915-47e1-b463-12a4c3a09b3c)）：离线解析 `~/.claude/projects/` 下的会话 JSONL，按日、月、会话、5 小时块估算费用；有 statusline 子命令。注意这些 JSONL 文件里含对话正文。

**这一类的共同模式**：图标即仪表、5 小时 / 每周双窗口加重置倒计时、用完时间预测、阈值通知。**共同风险**：借用凭据（钥匙串弹窗、凭据红线）、依赖非公开接口、资源占用失控（以 CodexBar 为代表）。

### 2.12 顺带记录

- **Alcove**：$13.99–$14.99 买断，需要 macOS 15+，被多家横评评为动画最接近苹果原生，但实用模块少（[官网](https://tryalcove.com/)、[dynamicnotch.tech](https://www.dynamicnotch.tech/best-mac-notch-apps)、[NotchBay](https://notchbay.com/blog/best-mac-notch-apps/)，均为竞品方）。
- **Atoll**：GPL-3.0，基于 boring.notch，把 CPU/GPU/内存/网络/磁盘图表放进刘海，只支持有刘海的 MacBook；MacNotch 横评批评它请求的权限太宽（[GitHub](https://github.com/Ebullioscopic/Atoll)）。
- **同时运行两个刘海应用**会出现闪烁和界面重复（MacNotch 横评）。这一点对 A 有意义：用户很可能已经装了 boring.notch 或 NotchNook。

---

## 3. 用户喜欢什么，差评集中在哪（问题 1）

### 3.1 用户喜欢的特质

| 特质 | 证据 | 对本项目的含义 |
|---|---|---|
| **不点开也能看到**（一眼可见） | iMore 喜欢媒体、日历常驻刘海；CodexBar、Usage4Claude、Status Trio 让图标本身就是仪表；Vibe Island 把额度和会话放在同一个面板 | B 的托盘图标本身应当承载最关键的一个数，而不只是一个入口 |
| **只在有事时出现**（零打扰） | MediaMate 的事件弹出 HUD 口碑最稳；Coucou 空闲时隐藏；Vibe Island 的面板不抢焦点 | A 默认应该是「有告警或有变化时才出现」；但出现的时间要够读完（NotchNest 用户嫌一闪就没） |
| **原生感、动画顺滑** | Alcove 被评最接近苹果；iMore 认为 NotchNook 与系统融为一体 | 首版的 220ms 下落、800ms 柔光方向是对的；不要堆动效 |
| **只做一件事** | MediaMate、NotchDrop；NotchBay 横评认为克制本身就是优点 | 支持「只做 AI 编程用量」的定位 |
| **一次买断、不订阅** | iStat Menus 不转订阅受好评；Vibe Island 到期后功能保留 | 与本项目无直接关系；但应避免任何在线激活依赖 |
| **本机运行、无遥测** | Vibe Island、Coucou、Stats 都把它写在显眼位置 | 本项目已经做到，可以在面板或关于页明示 |

### 3.2 差评的主要集中点

1. **耗电和 CPU**：boring.notch 空闲掉电约 5%/小时（#338）；CodexBar 高 CPU 和大量写盘（#3882、#1217）；Stats 的传感器模块（#2554）；NotchNook 被指耗电。这是口碑分水岭。
2. **系统升级后功能失效**：macOS 15.4 封了「正在播放」；macOS 26 弄坏了「音乐」App 的 AppleScript；Stats 在 macOS 26 上需要额外授权才能出现在菜单栏，在 macOS 27 上功耗读数为 0；MediaMate 也有一条单例报告。**依赖私有或脆弱接口的功能，会随系统升级周期性坏掉。**
3. **权限和钥匙串弹窗**：CodexBar 有一串 issue；本项目自己在 smoke 时也遇到过钥匙串授权窗阻塞（见共享笔记 smoke-widget-race）。
4. **数据显示错误**：Vibe Island 的账户合并、单位换算、来源回落（§2.6）。
5. **稳定性和更新节奏**：Vibe Island 几乎每天发版，默认值随之改变；boring.notch 多显示器下偶有问题；NotchNook 授权服务停摆。
6. **安装门槛**：未公证要手动放行（boring.notch、Status Trio、NotchDrop 自编译版，与本项目 D4 同样处境）。
7. **形态冲突**：外接屏上画假刘海被批；两个刘海应用同时运行会闪烁。
8. **价格**：NotchNook 被嫌贵，试用期短。

---

## 4. 功能逐条过三道筛子（问题 2）

### 4.1 筛子定义

- **① 相关**：是否和「AI 编程用量」（额度、余额、Token、费用、本机编程工具活动）相关。
- **② 可实现**：能否在 Electron 44.4.4 下实现，且不用私有接口、不引入原生依赖（允许调用系统自带的命令行工具，例如 POC 已在用的 `osascript`）。
- **③ 红线**：是否符合 AGENTS.md 第 2 节（数据语义）和第 4 节（隐私与只读）。

记号：✅ 通过 · ⚠️ 有条件通过 · ❌ 不通过 · — 不适用。

### 4.2 关键技术核实

**（1）歌曲信息 / 正在播放**

- macOS 15.4 起，MediaRemote 私有框架要求特殊授权，第三方应用拿不到正在播放的信息；BetterTouchTool 开发者 2025-03 确认了这一点，并退回到 AppleScript 加各应用通知的拼凑方案（[BTT 论坛](https://community.folivora.ai/t/now-playing-is-no-longer-working-on-macos-15-4/42802)）。
- boring.notch 的变通做法 [mediaremote-adapter](https://github.com/ungive/mediaremote-adapter)：用系统自带的 `/usr/bin/perl` 加载一个**需要自行用 CMake 编译、随应用打包的 framework**，借用「bundle ID 以 com.apple 开头即放行」这个检查。BTT 开发者认为这是苹果忘了删的检查，预计会在后续安全更新中被堵上；adapter 的 README 也提醒未来的系统更新可能再次弄坏它，并建议失败时回退到 AppleScript。徽章显示在 macOS 27.0 上测过（徽章文字被截断，**未核实**）。
- 另一种变通是用 JXA 调用私有的 `MRNowPlayingRequest`（BTT 论坛 2025-05 的帖子），不需要原生依赖，但仍然是**私有接口**。
- 按应用走 AppleScript 是公开方式，但每个播放器都要单独申请「自动化」权限，只能覆盖支持脚本的播放器；而且「音乐」App 的脚本接口在 macOS 26 上坏了，苹果 DTS 的答复是需要工程团队调查（[苹果开发者论坛](https://developer.apple.com/forums/thread/801357)、boring.notch [#871](https://github.com/TheBoredTeam/boring.notch/issues/871)）。
- Electron 没有读取系统级正在播放的 API（`navigator.mediaSession` 只用于页面发布自己的媒体信息）。
- **结论**：② ❌（要么原生 framework，要么私有接口，公开退路也不可靠），① ❌。

**（2）GPU 占用：`ioreg` 可以读**

- 本机实测（MacBookPro18,3 / M1 Pro / macOS 15.7.9，**不需要 sudo**）：`ioreg -r -d 1 -w 0 -c IOAccelerator` 输出的 `PerformanceStatistics` 中有 `Device Utilization %`、`Renderer Utilization %`、`Tiler Utilization %`、`In use system memory` 等键，`IOClass` 为 `AGXAcceleratorG13X`。连续运行 3 次，每次耗时约 0.01–0.02 秒。
- Stats 读的是同一组键（源码核实，见 §2.8），说明这在 Apple 芯片和 Intel 上都是通行做法。
- 风险：这些键不是苹果文档化的契约，其他机型和系统版本**未核实**；每次都要起一个子进程，2–5 秒的频率会有持续开销（单次很小，长期影响**未核实**）。
- **结论**：② ✅（系统自带命令，不需要原生依赖），① ❌（整机 GPU 与 AI 编程用量没有直接关系）。

**（3）CPU 和内存：Node 自带接口能用，但内存口径有坑**

Electron 44.4.4 内置 Node 24.21.0、Chrome 152。本机实测：

| 接口 | 结果 | 评价 |
|---|---|---|
| `os.cpus()` 两次采样做差 | 1 秒内整机忙碌 23.8%（8 核） | ✅ 可以算出整机 CPU 占用 |
| `os.loadavg()` | `[4.35, 3.91, 3.38]` | ✅ 可用 |
| `os.totalmem()` | 16 GB | ✅ |
| `os.freemem()` | 0.16–0.56 GB（两次运行） | ⚠️ **误导**：只算空闲页（与紧邻时刻 `vm_stat` 的 free + speculative 页数大致吻合，属推断），不含可回收的 inactive / purgeable |
| `process.getSystemMemoryInfo()` | `free` 约 57 MB，另有 `fileBacked`、`purgeable` | ⚠️ 与 `os.freemem()` 同一时刻相差约 3 倍，口径不同 |
| `process.availableMemory()` | 5.24 GB | ⚠️ 在 macOS 上的确切含义**未核实** |
| `sysctl kern.memorystatus_vm_pressure_level` / `kern.memorystatus_level` | 压力等级 1（正常）/ 可用 63% | ✅ 不需要权限；比「空闲内存」更有意义 |
| `app.getAppMetrics()` / `process.getCPUUsage()` | 本应用各进程的 CPU% 和内存 | ✅ 适合展示**本应用自身**的资源占用 |

- **结论**：② ✅（内存要改用压力等级），① ❌（整机指标与用量无关）；只有「本应用自身占用」对回应耗电差评有价值。

**（4）本机模型资源占用（与 AI 编程部分相关）**

- Ollama 提供 `GET http://localhost:11434/api/ps`，不需要鉴权，返回已加载的模型名、`size`、`size_vram`、`expires_at`、`context_length`（[Ollama 文档](https://docs.ollama.com/api/ps)）。LM Studio 的同类接口**未核实**。
- ② ✅（普通 HTTP 请求）；③ ⚠️：AGENTS.md 第 4 节规定「不开放任意网络地址」。读一个固定的回环地址不算任意地址，但这是一个新的读取契约（和 OTLP 只监听回环地址的性质不同：那是被动接收，这是主动请求），**需要用户拍板**；另外不能据此推断账户归属。
- ① ⚠️：只对用本机模型写代码的用户有意义，而且这是「资源」不是「额度或用量」。

**（5）托盘图标即仪表（B 的技术基础）**

- Electron 托盘 API（[文档](https://www.electronjs.org/docs/latest/api/tray)）：`tray.setTitle(title, {fontType:'monospacedDigit'})` 仅 macOS 支持，可以在图标旁显示等宽数字；`tray.setImage(nativeImage)` 可以更换图标（文档没有限制调用频率，高频更新的开销**未实测**）；`click` 事件会带上图标的 `bounds`，`tray.getBounds()` 在 macOS 上可用，可以据此定位弹出面板；`tray.popUpContextMenu()` 可以在 `right-click` 时弹出原生菜单。
- 现状：Mac 上目前用 `setContextMenu` + 模板图标（`desktop/main.cjs` 约 373、860 行），点击直接弹菜单。文档注明设置了 context menu 后不会触发 `mouse-up`；要做「左键面板 / 右键菜单」，常见做法是不再设置 context menu，改为监听 `click` 弹面板、在 `right-click` 里调用 `popUpContextMenu`（常见做法，本项目**未实测**）。
- 模板图标只能是单色。如果要在图标里画绿色分段条，就得放弃模板图标，自己处理深浅菜单栏的适配，这属于 UI 改动，要走 D10。
- 程序坞图标：`app.dock.setIcon()` 技术上可以动态绘制（Status Trio 的做法），但 AGENTS.md 第 8 节规定「Mac 打包版以 bundle 内的 icns 为准」，与回归保护规则冲突；`app.dock.setBadge()` 只能显示短文字。

### 4.3 三道筛子总表

| 功能 | 代表产品 | ① 相关 | ② 可实现 | ③ 红线 | 结论 |
|---|---|---|---|---|---|
| 窗口配额百分比 + 重置时间 | CodexBar、ClaudeBar、Vibe Island | ✅ | ✅ 已有 | ✅ 走现有固定只读接口 | **已有**，A/B 复用 |
| 余额（按币种分别显示） | CodexBar、ClaudeBar | ✅ | ✅ 已有 | ✅ | **已有** |
| 托盘图标即仪表（动态图标或等宽数字） | CodexBar、Usage4Claude、Status Trio | ✅ | ✅ `setImage` / `setTitle` | ⚠️ 缺失显示「—」，余额不画条 | **建议**（走 D10） |
| 左键弹出面板、右键原生菜单 | Status Trio、Stats、iStat Menus | 交互 | ✅ `click` 带 bounds + `popUpContextMenu` | ✅ | **建议**（B 的形态） |
| 程序坞图标绘制状态 | Status Trio | ✅ | ⚠️ `dock.setIcon` 可用 | ⚠️ 与第 8 节 icns 规则冲突 | 默认不做，需用户决定 |
| 重置倒计时、临期提示 | CodexBar | ✅ | ✅ | ⚠️ `resetAt=0` 显示「未启用」，不编造 | 已规划（增量一） |
| 用完时间预测、均匀使用参考线、燃尽图 | CodexBar、Claudius、cclimit | ✅ | ✅ | ⚠️ 需要足够多的连续新鲜样本；不能把余额差当消费 | 可借鉴（只用于窗口配额） |
| 阈值通知（系统通知） | claude-limits、CodexBar | ✅ | ✅ Notification API | ✅ 缺数据不告警 | 已有应用内告警；系统通知可选（D10） |
| 正在运行的会话（状态 + 步进增量） | Vibe Island、Coucou | ✅ | ✅ 读本机数据库或日志元数据（T7.2） | ⚠️ 只投影白名单元数据；不写 hooks | 已规划（增量一） |
| 每周重置的小动效 | CodexBar 的撒彩带 | 呈现 | ✅ | ✅ | 已规划（800ms 柔光） |
| 截屏与共享保护 | boring.notch（旧调研） | 隐私 | ✅ `setContentProtection` | ✅ | 已规划（首版） |
| 外接屏、无刘海时回退 | NotchNook、Vibe Island 的浮动条 | 交互 | ✅ | ✅ | 已定：回退经典悬浮窗，不画假刘海 |
| 本机费用扫描（解析会话 JSONL） | ccusage、CodexBar | ✅ | ✅ | ⚠️ Claude 的 JSONL 含正文；本项目已改走 statusLine / OTLP | 维持现状 |
| 借用钥匙串 / auth.json / 浏览器 Cookie 读额度 | CodexBar、claude-limits、Vibe Island、Status Trio 分叉 | ✅ | ✅（技术上） | ❌ 凭据只能由用户在应用内配置；非公开接口 | **不做** |
| 权限审批、回答代理提问 | Vibe Island、Coucou | 弱 | ⚠️ 要写 hooks + 本地 socket | ❌ 修改第三方工具全局配置，改变工具行为 | **不做** |
| 跳回终端标签页 | Vibe Island | 弱 | ⚠️ 要靠 AppleScript 或辅助功能驱动别的应用 | ❌ 超出只读监控 | **不做** |
| 计划审阅、diff 预览、会话步骤内容 | Vibe Island、Coucou | ❌ | — | ❌ 读取对话或工具内容 | **不做** |
| SSH 远程会话、手机推送、iCloud 同步、排行榜分享 | Vibe Island、Coucou、ClaudeBar | 弱 | — | ❌ 数据离开本机 | **不做** |
| 歌曲信息、媒体控制、歌词 | boring.notch、MediaMate、NotchNook | ❌ | ❌ 见 §4.2(1) | — | **不做** |
| 音量 / 亮度 HUD 替换 | MediaMate、boring.notch | ❌ | ❌ 推测需要监听媒体键并隐藏系统 HUD，没有公开 API（**未核实**） | — | **不做** |
| 整机 CPU 占用 | Stats、iStat Menus、Atoll | ❌ | ✅ `os.cpus()` 做差 | ✅ | 不做；只考虑「本应用自身占用」 |
| 整机内存 | 同上 | ❌ | ⚠️ 「空闲内存」口径误导，要改用压力等级 | ✅ | 不做 |
| 整机 GPU 占用 | Stats、iStat Menus、Atoll | ❌ | ✅ `ioreg`（键名不是契约） | ✅ | 不做 |
| 本机模型占用（已加载模型、显存） | 竞品里没人主打 | ⚠️ | ✅ Ollama `/api/ps` | ⚠️ 新的回环读取契约 | **待用户决定**，低优先 |
| 温度、风扇、功耗传感器 | Stats、iStat Menus | ❌ | ❌ 需要 SMC 原生代码 | — | **不做** |
| 文件架、AirDrop | NotchNook、boring.notch、NotchDrop | ❌ | ⚠️ | — | **不做** |
| 日历、天气、提醒、计时器 | NotchNook、boring.notch、NotchNest | ❌ | — | — | **不做** |
| 剪贴板历史（含 AI 剪贴板） | NotchNest、Atoll | ❌ | — | ❌ 读取剪贴板内容 | **不做** |
| 镜子（摄像头）、听写、语音助手、AI 聊天 | NotchNook、NotchNest、Coucou | ❌ | — | ❌ 摄像头和麦克风隐私；聊天要调用模型 | **不做** |
| 遥测 | Status Trio（可选，默认关） | — | — | ❌ 现有红线 | **不做** |

---

## 5. 建议（问题 3）

### 5.1 值得借鉴的 5 条

1. **让 B 的托盘图标本身就是仪表，左键弹面板、右键留原生菜单。**
   - 理由：「不点开也能看到」是这一类产品被喜欢的头号原因（CodexBar、Usage4Claude、Status Trio）。菜单栏图标不占用刘海两侧的耳区，正好绕开 ⑦ 的遮挡问题（POC 实测本机刘海右侧只剩一个耳宽）。Electron 的公开 API 足够（§4.2(5)），不需要原生依赖。
   - 约束：只显示一个最关键的槽位（沿用 §3.2 的耳位优先级）；缺失显示「—」；余额用等宽数字，不画条；彩色图标要放弃模板图标、自己适配深浅菜单栏，走 D10。
2. **A 的默认取向是「只在有事时出现」。**
   - 理由：MediaMate 的事件弹出口碑最稳，Coucou 也是空闲时隐藏；两个刘海应用同时运行会闪烁，而用户很可能已经装了 boring.notch 或 NotchNook。这也为 ⑦ 的默认值提供了一个参考：倾向「仅告警时」，但最终由用户决定。
   - 细节：告警、临期、消耗瞬态出现时要停留到能读完（NotchNest 用户嫌一闪就没）；鼠标悬停时推迟收回（已在 §3.4 规划）。
3. **把「数字可信」做成看得见的特性。**
   - 理由：直接同行的错误集中在账户合并、单位换算、来源回落（Vibe Island #249、#259、#226），而这些正是本项目红线在处理的。
   - 做法：面板里每个数都带上来源（账户名或连接名）和新鲜度（「8 秒前」）；查询失败时保留上次成功值并标出时间（不同于 Status Trio 分叉的清空做法，也不显示 0）；单位不明时显示「—」，不换算。CodexBar 的「均匀使用参考线」可以作为窗口配额的可选展示，但要满足预测的样本规则。
4. **资源预算作为验收门槛，并公开本应用自身的占用。**
   - 理由：耗电是这一品类的口碑分水岭（boring.notch #338、CodexBar #3882、Stats #2554）。POC 实测岛的渲染进程空闲 CPU 0.0%、内存 23 MB，起点不错。
   - 做法：高频刷新只在面板可见、或「正在运行」可见时启用（Coucou 无人查看时暂停轮询，CodexBar 有自适应刷新），收起后立即回到常规频率；真机验收时记录活动监视器的「能耗影响」；用 `app.getAppMetrics()` 在诊断信息（T3.3）里展示本应用各进程的 CPU 和内存，回应「会不会耗电」的疑虑。
5. **不碰别人的凭据、不依赖私有接口，作为长期稳定的来源。**
   - 理由：系统升级反复打断依赖私有接口的功能（15.4 的正在播放、26 的「音乐」App 脚本、Stats 在 26/27 上的问题）；借用钥匙串凭据带来弹窗（CodexBar 一串 issue，本项目 smoke 也被钥匙串弹窗卡过）；授权服务一停，整个应用就不可用（NotchNook）。
   - 做法：继续只用固定官方只读接口、statusLine、Codex app-server 白名单方法；在面板里如实标注覆盖范围（例如 OpenCode Go 只支持特定套餐）。

### 5.2 明确不做的清单

| 不做 | 理由 |
|---|---|
| 歌曲信息、媒体控制、歌词 | 与 AI 编程用量无关；macOS 15.4 之后只能靠原生 framework 或私有接口，公开的 AppleScript 退路在 macOS 26 上对「音乐」App 也失效了；必然随系统升级反复坏掉（§4.2(1)） |
| 音量 / 亮度 HUD 替换 | 与用量无关；MediaMate、boring.notch 已经做好；需要的系统能力没有公开 API（**未核实**） |
| 整机 CPU / GPU / 内存 / 温度 / 风扇监控 | 与用量无关，定位会漂移；Stats（免费，4.26 万星）和 iStat Menus（$11.99）已经做透；macOS 上「空闲内存」口径误导（实测）；传感器需要 SMC 原生代码；周期采样本身就是耗电差评的来源（Stats FAQ）。例外：本应用自身的占用可以放在诊断信息里 |
| 权限审批、回答代理提问、跳回终端、计划审阅 | 要往 `~/.claude/settings.json` 等写 hooks、读取会话内容、驱动其他应用，违反「只读、不改第三方配置、不读正文」；Vibe Island 和多个免费开源项目已经覆盖 |
| 借用钥匙串、`auth.json`、浏览器 Cookie 读取额度 | 违反「凭据只由用户在应用内配置」；会触发钥匙串弹窗；依赖的是非公开接口；Vibe Island 的账户合并 bug 也出在这条路线上 |
| 文件架、AirDrop、日历、天气、提醒、计时器 | 与用量无关；是通用刘海应用的主战场，NotchNook、boring.notch、NotchNest 都已做好 |
| 剪贴板历史、镜子、听写、语音助手、AI 聊天 | 与用量无关；剪贴板、摄像头、麦克风涉及隐私；AI 聊天要调用模型生成，违反只读 |
| SSH 远程、手机推送、iCloud 同步、排行榜分享 | 数据离开本机，扩大攻击面；远程 statusLine 快照与本机数据混在一起，正是 Vibe Island #226 的疑似成因 |
| 外接屏上画假刘海 | 被批评过；已定外接屏回退经典悬浮窗 |
| 遥测和在线激活 | 违反现有红线；NotchNook 授权服务停摆说明在线激活是单点故障 |

### 5.3 留给用户决定的事项

1. **本机模型占用**（Ollama `/api/ps`）要不要做：要新增一个固定回环地址的主动读取契约，并且只对用本机模型写代码的用户有意义。建议低优先，最早放到增量二之后。
2. **托盘图标从单色模板图标改为彩色仪表**：这是 UI 改动，要走 D10，出浅色和深色菜单栏下的截图。
3. **程序坞图标显示状态**：与第 8 节「打包版以 bundle 内的 icns 为准」冲突，默认不做；用户想要的话需要先改规则。

---

## 6. 对旧调研（HANDOFF.md 第 2 节）的更正

本文不修改 HANDOFF.md，以下供后续同步：

| 项 | 旧表 | 本次 |
|---|---|---|
| boring.notch 许可证、星数 | 免费 MIT，5k+ 星 | **GPL-3.0**，约 1.11 万星 |
| boring.notch 截屏隐私 | 把它当卖点 | 本次 README 中没找到（**未核实**） |
| NotchNest 价格 | $14.99 买断 | 免费 + 内购：$2.99/月、$14.99/年、$14.99 终身 |
| NotchNook | $25 买断 | 价格不变；2026-09 因开发商纠纷停摆，10-07 在新站重新开售，运营方**未核实** |
| MediaMate 价格 | 约 $5–17 | €6.99 起（第三方 $6.99–$8.99） |
| Vibe Island 代理数 | 26 种 | 官网 30 个（GitHub 写 25） |
| Vibe Island 读取 Claude 登录信息 | 「读本地 Claude 登录信息显示用量」 | 已由 issue #249 / #226 证实：钥匙串 OAuth 凭据 + statusLine 桥 |
| 品类 | 只有刘海类 | 新增「菜单栏 AI 编程用量类」（CodexBar 等）和「AI 代理刘海类」（Coucou 等） |

---

## 7. 局限与未核实事项

- 没有安装任何产品，所有资源占用数字都来自厂商自述或用户 issue，不是本次实测；单个 issue 只能说明「有人遇到」，不代表普遍。
- `ioreg` 读 GPU、`sysctl` 读内存压力只在一台机器上验证过（MacBookPro18,3、macOS 15.7.9），其他机型和 macOS 26/27 **未核实**。
- `process.availableMemory()` 在 macOS 上的确切含义**未核实**；`tray.setImage` 高频更新的开销**未实测**。
- HUD 替换需要哪些系统能力**未核实**；LM Studio 的本机接口**未核实**。
- 很多横评页面（FavTray、Seam、MacNotch、Crest、NotchBay、dynamicnotch.tech、NotchNest 自家对比页）的作者都卖竞品，其中的批评只作线索。
- 价格会变；本文价格以 2026-10 的页面为准，个别价格来自搜索摘要（已注明）。

---

## 8. 本机核实记录（可复现）

```bash
# GPU 占用（不需要 sudo）
ioreg -r -d 1 -w 0 -c IOAccelerator | grep -o '"PerformanceStatistics" = {[^}]*}'
# 内存压力等级（1 = 正常）与可用百分比
sysctl kern.memorystatus_vm_pressure_level kern.memorystatus_level
# 页统计（与 os.freemem() 对照）
vm_stat
```

Electron API 探测：临时脚本放在 `/tmp` 下，用 `app.setPath('userData', 临时目录)` 隔离，不碰项目和用户数据；输出了 `process.versions`、`process.getSystemMemoryInfo()`、`os.freemem()`、`app.getAppMetrics()`、`process.getCPUUsage()`，结果见 §4.2(3)。脚本和临时目录用完已删除。
