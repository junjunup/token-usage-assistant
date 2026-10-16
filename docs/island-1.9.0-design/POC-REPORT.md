# 灵动岛 POC 报告（T7.1）

> **证据性质：开发机 POC**。以下结果由执行模型在开发机（MacBook Pro 14 寸 `MacBookPro18,3`，macOS 15.7.9，内建屏默认缩放 1512×982 pt，@2x）上运行未打包的开发版得到。手感和最终参数要由用户在真机上确认，**不得据此写成「真机已验证」**。
> 日期：2026-10-16 · 代码：`desktop/island-poc/`（只在开发版中启用，不随包发布）

## 0. 如何运行

```bash
TUA_ISLAND_POC=1 ./node_modules/.bin/electron . --hidden --test-directory=$(mktemp -d)
```

- 必须同时满足：未打包、`TUA_ISLAND_POC=1`、macOS，并且带隔离的 `--test-directory`（不带会直接报错退出），不会碰打包版或开发版的数据目录。
- 岛内显示**写死的示例数据**（面板角落标注「POC 示例数据，非真实账户」），不读取任何账户。
- 可调环境变量：

| 变量 | 取值（默认在前） | 作用 |
|---|---|---|
| `TUA_ISLAND_LEVEL` | `status` / `pop-up-menu` / `floating` | 窗口层级 |
| `TUA_ISLAND_EARS` | `always` / `alert` | ⑦ 收纳态耳区：常显 / 仅告警时 |
| `TUA_ISLAND_ALERT` | `0` / `1` | 模拟告警（左耳整耳替换为琥珀告警内容） |
| `TUA_ISLAND_PROTECT` | `1` / `0` | `setContentProtection` |
| `TUA_ISLAND_PANEL` | `0` / `1` | 面板常开（截图用） |
| `TUA_ISLAND_GEOMETRY` | `nsscreen` / `heuristic` | 刘海几何来源 |
| `TUA_ISLAND_NOTCH_WIDTH` | `185` | 仅在启发式回退时使用的手动刘海宽度 |

- 运行时向 stdout 打印 `[island-poc] {...}` 行（几何、实际窗口位置、悬停、显示器事件、每 10 秒的 workArea 采样），不含任何账户数据。

## 1. 窗口层级

用 CGWindowList（JXA，不需要录屏权限）读取窗口所在的层：

| `setAlwaysOnTop` 层级 | 实际窗口层 | 与菜单栏（层 24）的关系 |
|---|---|---|
| `floating`（现有悬浮窗） | 3 | 在菜单栏**之下** |
| **`status`** | **25** | 在菜单栏之上，与各应用状态栏图标同层 |
| `pop-up-menu`（对照） | 101 | 在菜单栏之上，也会盖住应用的下拉菜单 |

- 结论：用 `status`。窗口请求放在 y=0，实际位置与请求完全一致（`{x:521,y:0,width:470,height:228}`），没有被系统挤到菜单栏下面。
- 截图：[poc/1-status-level.jpg](poc/1-status-level.jpg)

## 2. 刘海几何（NSScreen）

- **JXA 能桥接 `NSScreen` 的结构体**，不需要原生依赖。实测内建屏：`safeAreaInsets.top = 32`，`auxiliaryTopLeftArea = (0, 950, 663, 32)`，`auxiliaryTopRightArea = (848, 950, 664, 32)`（AppKit 坐标，原点在左下）。
- 换算到 Electron（原点在左上）：刘海 = `{x:663, y:0, width:185, height:32}`。换算由 `desktop/island-poc/geometry.cjs` 完成，有单元测试 `tests/island-geometry.test.cjs`（4 项）。
- **菜单栏高度与刘海高度不同**：`workArea.y − bounds.y = 38`，而 `safeAreaInsets.top = 32`。POC 的岛体高度取刘海高度 32。
- 耳区：每侧 72pt，内容距刘海边缘 12pt（内容宽 60pt），满足「不进刘海区、≥12px 缓冲」。
- **未测**：其他显示缩放档位（改分辨率属于系统设置，留给用户在真机上切换后重跑一次 POC，看 `[island-poc] geometry` 行）。

## 3. 自动隐藏菜单栏、全屏应用、外接屏

| 场景 | 结果 |
|---|---|
| **全屏应用**（访达进入全屏） | **岛仍然显示**。只调用 `setVisibleOnAllWorkspaces(true)`、不传 `visibleOnFullScreen`，并不能让岛离开全屏空间；而且全屏切换时没有触发任何 `display-*` 事件，`workArea` 也没变（仍为 38）。因此**原设计的「靠 workArea 检测全屏」不可行**。全屏时系统把顶部条画成黑色，岛与之融为一体，耳区内容仍可见。截图：[poc/3-fullscreen-finder.jpg](poc/3-fullscreen-finder.jpg) |
| 自动隐藏菜单栏 | **未测**（需要改系统设置，由用户在真机上验证）。单元测试已覆盖启发式在这种情况下的漏判（`workArea.y` 变为 0），NSScreen 方案不依赖 workArea |
| 外接屏 | **未测**（开发机没有外接屏）。代码按 `display.internal` 只在内建屏放岛，找不到刘海时隐藏 |

- 全屏检测需要另找办法，候选：定时用 CGWindowList 判断内建屏上是否有全屏窗口（需评估开销）；或接受全屏时继续显示（顶部本来就是黑色）。**请用户决定**。

## 4. 鼠标穿透与悬停

- `setIgnoreMouseEvents(true, {forward:true})`：页面仍能收到 `mousemove`，悬停判定正常工作。
- **穿透实测**：在岛窗口矩形内、岛体之外的桌面位置点击，点击落到了下层（前台应用从 Electron 变为访达）。
- **悬停实测**：鼠标停在左耳约 0.6 秒后面板已落下，移开 0.6 秒后已收回；连续进出 16 次，状态切换正常。截图：[poc/4-hover-panel.jpg](poc/4-hover-panel.jpg)
- **发现的问题（代码推断，未实测）**：悬停时 POC 把整个窗口（470×228，横跨 x=521–991）设为接收鼠标，会挡住窗口矩形内的状态栏图标（本机为 x=919 起的图标，包括本应用的托盘图标）。正式版应在收纳时把窗口缩到岛体大小，或只让岛体和面板接收点击。
- 150 ms / 200 ms 的手感由用户在真机上确认（⑤）。

## 5. 菜单栏遮挡（⑦）

CGWindowList 实测本机菜单栏右侧（状态栏图标）位置：

| 项 | x 范围（pt） |
|---|---|
| 刘海 | 663–848 |
| 右耳（常显时） | 848–920（内容 860–920） |
| 最左侧的状态栏图标 | 919–959，其后依次为本应用托盘图标 959–993、微信、Clash Verge、控制中心…… |

- 本机刘海右侧空出的位置正好约等于一个耳宽：**再多一个状态栏图标，就会落到常显的右耳下面**（包括本应用自己的托盘图标）。左侧应用菜单（访达 7 项、本应用 3 项）离左耳很远，本机未见遮挡。
- 截图（菜单栏空闲，访达或本应用在前台）：
  - 常显、无告警：[poc/7-always-idle.jpg](poc/7-always-idle.jpg)
  - 常显、告警：[poc/7-always-alert.jpg](poc/7-always-alert.jpg)
  - 仅告警时、无告警（只盖住刘海）：[poc/7-alert-only-idle.jpg](poc/7-alert-only-idle.jpg)
  - 仅告警时、告警：与「常显、告警」相同（告警时出现耳区）
- **菜单栏拥挤时的截图没有拍成**：执行模型使用的截屏工具会过滤掉未授权应用的状态栏图标（截图里看不到微信、Clash Verge 等），系统 `screencapture` 在当前环境没有录屏权限、只能拍到桌面。拥挤情况的证据以上表的 CGWindowList 实测坐标为准；如需真实截图，请用户在真机上用 `TUA_ISLAND_PROTECT=0` 运行 POC 后自行截取。

## 6. 截屏与共享保护

- `TUA_ISLAND_PROTECT=1`：执行模型的截屏工具拍不到岛（菜单栏和其他图标照常），截图：[poc/6-protect-on.jpg](poc/6-protect-on.jpg)。`TUA_ISLAND_PROTECT=0` 时能拍到。
- **未测**：系统截图（⌘⇧3 / ⌘⇧5）、录屏和会议软件的屏幕共享，由用户在真机上确认（文档已注明 ScreenCaptureKit 可能例外）。

## 7. CPU 与内存

用 `top` 只测岛的渲染进程（pid 由 POC 打印）：

| 状态 | CPU | 内存 |
|---|---|---|
| 空闲（30 秒，6 次采样） | 0.0% | 23 MB |
| 悬停动画（约 26 秒内进出 16 次，8 次采样） | 峰值 1.4%，多数在 0–1.2% | 24 MB |

- 没有计入与整个应用共享的 GPU 进程和主进程。整个应用（含主窗口、悬浮窗、岛）空闲时的进程树合计约 650 MB 常驻内存（`ps` RSS，有重复计算），CPU 为 0。
- 是短时采样，不是稳定性测试。

## 8. 待用户决定或确认

1. **⑦ 的默认值**（「常显」/「仅告警时」），依据第 5 节的截图和坐标。
2. **全屏时怎么办**：另做检测并隐藏，或接受全屏时继续显示（第 3 节）。
3. 真机确认：悬停手感（⑤）、自动隐藏菜单栏、外接屏、其他缩放档位、系统截图/录屏/共享下的保护效果。
