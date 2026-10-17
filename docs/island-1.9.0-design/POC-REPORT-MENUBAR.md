# 菜单栏图标与弹出面板 POC 报告（T7.3）

> **证据性质：开发机 POC**。以下结果由执行模型在开发机（MacBook Pro 14 寸，macOS 15.7.9，内建屏 1512×982 pt，浅色外观）上运行未打包的开发版得到，图标和面板只显示写死的示例数据。手感、深色菜单栏、外接屏等由用户在真机确认，**不得据此写成「真机已验证」**。
> 日期：2026-10-18 · 代码：`desktop/menubar-poc/`（只在开发版中启用，不随包发布）

## 0. 如何运行

```bash
TUA_MENUBAR_POC=1 ./node_modules/.bin/electron . --hidden --test-directory=$(mktemp -d)
```

- 必须同时满足：未打包、`TUA_MENUBAR_POC=1`、macOS，且带隔离的 `--test-directory`（不带直接报错退出）。
- POC 另加一个状态栏图标（左键弹面板、右键弹 POC 菜单），不改动应用原有托盘图标的行为。
- 可调环境变量：

| 变量 | 取值（默认在前） | 作用 |
|---|---|---|
| `TUA_MENUBAR_RENDER` | `canvas` / `raster` | 图标渲染方案 a / b |
| `TUA_MENUBAR_FORM` | `value` / `ring` / `two` | 形态 ② / ① / ③ |
| `TUA_MENUBAR_STATE` | `normal` / `amber` / `red` / `missing` / `disabled` / `balance` | 示例状态 |
| `TUA_MENUBAR_CYCLE` | `0` / `1` | 每 3 秒切换一次状态（测耗时） |
| `TUA_MENUBAR_THEME` | `light` / `dark` | 面板主题 |
| `TUA_MENUBAR_PROTECT` | `1` / `0` | 面板 `setContentProtection` |
| `TUA_MENUBAR_REPLACE` | `0` / `1` | 不创建应用原有的托盘图标，让 POC 图标代替它（测真实可用宽度；此时主窗口会打开） |
| `TUA_MENUBAR_OPEN_AFTER` | 毫秒 | 启动后自动打开面板（与点击使用同一定位逻辑） |
| `TUA_MENUBAR_DUMP` | 目录 | 把每次画出的 2 倍图标存成 PNG |

- 运行时向 stdout 打印 `[menubar-poc] {...}`（每次换图耗时、图标尺寸、状态栏位置、点击与面板事件、渲染进程 pid），不含账户数据。

## 1. 左键弹面板 + 右键原生菜单

- 不调用 `setContextMenu`，改为 `click` 切换面板、`right-click` 时 `popUpContextMenu`：**两者并存正常**。右键只弹菜单，不会打开面板。截图：[poc-menubar/right-click-menu.jpg](poc-menubar/right-click-menu.jpg)
- 收起：再点图标（系统不会先触发面板失焦，直接收到点击）、点面板外（`blur`）、按 Esc（`before-input-event`）都能收起，日志事件逐一对应。
- 「失焦后 300ms 内的图标点击不重新打开」这条保护在本机没有被触发过，但保留，防止不同系统版本的事件顺序差异。

## 2. 图标渲染方案（选 a）

| | a：隐藏渲染进程 canvas | b：主进程纯 JS 光栅化 + `tray.setTitle` |
|---|---|---|
| 能画的形态 | ① ② ③ 全部 | ① ②（③ 的两行文字无法用系统标题实现） |
| 颜色 | 与草图 token 一致（琥珀 `#ba7917` / `#e3ad57`、红 `#dc4c57` / `#ee7580`） | 刻度环可以一致；**数值只能用 ANSI 基本色**，实测琥珀变成亮柠檬黄，在浅色菜单栏上对比度差，见 [bar-raster-ansi-amber.jpg](poc-menubar/bar-raster-ansi-amber.jpg) |
| 首次换图 | 约 117–184 ms（含加载渲染页） | 约 95 ms（生成形状遮罩，之后缓存） |
| 之后每次换图 | 3–17 ms | 1–2 ms |
| 额外进程 | 1 个隐藏渲染进程，空闲 0% CPU / 19 MB | 无 |
| 可测性 | 需要 Electron 环境 | 纯函数，已有单元测试 `tests/menubar-raster.test.cjs`（4 项） |

- **建议用 a**：三种形态和颜色都能和已批准的草图一致；代价是一个约 20 MB 的隐藏渲染进程，换图只在数据变化时发生，开销可以忽略。b 的光栅化模块可以保留给单元测试和「静态 Logo」等不需要文字的场合，正式实现时再定。
- 全部形态与状态的实际渲染结果（2 倍图）：[poc-menubar/icon-sheet.png](poc-menubar/icon-sheet.png)。

## 3. 明暗适配

- 正常、缺数据、未启用、余额四种状态用模板图（只画黑色，系统自动按菜单栏明暗着色）；琥珀、红用彩色图，按 `nativeTheme.shouldUseDarkColors` 选浅色或深色 token。应用没有设置 `nativeTheme.themeSource`，所以这个值反映的是系统外观。
- 浅色菜单栏实测：正常 [bar-value-normal.jpg](poc-menubar/bar-value-normal.jpg)、琥珀 [bar-value-amber.jpg](poc-menubar/bar-value-amber.jpg)、③ 琥珀 [bar-two-amber.jpg](poc-menubar/bar-two-amber.jpg)，清晰度和颜色都符合草图。
- **未测**：深色菜单栏、系统切换外观时的重绘（`nativeTheme` 的 `updated` 事件已接好）。切换外观属于系统设置，由用户在真机上确认。

## 4. 面板定位与收起

- 按 `tray.getBounds()` 放在图标正下方 6pt，水平居中，靠近屏幕边缘时夹在工作区内；实测请求位置与实际位置一致（`{x:718, y:43, width:360, height:409}`）。
- 浅色 / 深色面板：[panel-light.jpg](poc-menubar/panel-light.jpg)、[panel-dark.jpg](poc-menubar/panel-dark.jpg)，与已批准草图一致（POC 面板没有画指向图标的小箭头）。
- **全屏空间**：访达进入全屏后打开面板，面板显示在全屏内容之上（窗口层 101），截图：[panel-fullscreen.jpg](poc-menubar/panel-fullscreen.jpg)。用的是 `setVisibleOnAllWorkspaces(true, {visibleOnFullScreen: true})` + `setAlwaysOnTop(true, 'pop-up-menu')` + `type: 'panel'`。
- **未测**：多桌面空间之间切换、外接屏（开发机没有）。
- 本应用本来就显示在程序坞中，面板窗口没有额外出现在程序坞或 ⌘Tab 中。

## 5. 宽度与被刘海藏起（重要发现）

- 状态栏图标的实际宽度 = 图片宽度 + 约 16pt 系统边距（比草图页面实测多）。② 的实测：「62%」67pt、「15%」64pt、「0%」59pt、「—」51pt、「未启用」77pt、「¥86.40」81pt；③ 73pt；① 34pt；b 方案的「62%」69pt。
- **系统隐藏的门槛**：本机刘海右边缘在 x=848，图标起点在 x≤866 时被系统**整个隐藏**（`kCGWindowIsOnscreen=false`），起点 ≥868 时正常显示——系统在刘海右侧额外留了约 20pt。隐藏时没有任何提示，`tray.getBounds()` 仍返回正常坐标。
- 本机此刻的实际可用宽度：让 POC 图标代替原有托盘图标后，图标右边缘固定在 x=1001，所以可用宽度约 1001 − 868 = **133pt**，② 和 ③ 的所有状态都放得下（余量约 50pt）。这个数字取决于用户装了哪些菜单栏应用，再多一两个图标就可能不够。
- 数值变化会让图标宽度变化（51–81pt），右侧其他图标的位置随之移动。
- **可检测**：用 JXA 调 `CGWindowListCopyWindowInfo` 读本应用状态栏窗口的 `kCGWindowIsOnscreen`，不需要录屏权限，就能知道图标是否被系统藏起来。

## 6. 内容保护

- 面板开启 `setContentProtection(true)` 时，执行模型的截屏工具拍不到面板（图标照常可见）；关闭后能拍到。
- 菜单栏图标不是窗口内容，不受内容保护覆盖（与设计文档一致，靠「菜单栏图标显示用量」开关处理屏幕共享）。
- **未测**：系统截图、录屏、会议共享，由用户在真机上确认。

## 7. CPU 与内存

| 进程 | 状态 | CPU | 内存 |
|---|---|---|---|
| 图标渲染进程（a） | 空闲 | 0.0% | 19 MB |
| 面板渲染进程 | 空闲（未打开） | 0.0% | 23 MB |
| 主进程 | 每 3 秒换一次图（远高于实际频率） | 0.1–0.2% | 68 MB（整个应用的主进程） |
| 图标渲染进程（a） | 同上 | 0.0% | 20–21 MB |

短时采样（约 30 秒），不是稳定性测试。

## 8. 需要用户决定或确认

> **已定（2026-10-18，用户同意第 1、2 条建议）**：渲染用方案 a；图标被系统藏起来时只提示，不自动切换形态。第 3 条仍待真机确认。

1. **渲染方案用 a（canvas）**：三种形态和颜色都能与草图一致（建议）。
2. **图标被系统藏起来时怎么办**：建议检测到隐藏后，在设置的「菜单栏」组里提示「菜单栏空间不足，图标已被系统隐藏，可改用 ① 或减少其他菜单栏图标」，并在主窗口给出同样提示；**不自动切换形态**（避免用户不知情地看到不同的图标）。也可以选择自动降级为 ①。
3. 真机确认：深色菜单栏与外观切换、外接屏、多桌面空间、系统截图 / 录屏 / 共享时的面板保护、③ 的 9.5pt 小字是否看得清。
