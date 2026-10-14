# 1.8.0-beta.4 · Logo 居中及 Windows 任务栏修复

用户截图指出 beta.3 的侧栏刻度环向右偏，任务栏仍显示 Electron 默认图标。本版针对这两项修复，保留已确认的 Logo 形状和整体 UI。

## 原因与改动

- 侧栏按钮受浏览器默认内边距影响，27 px SVG 大于其可用内容宽度，造成偏右。桌面侧栏 Logo 按钮单独设置 `padding:0`，其 SVG 设为块级显示；维持按钮、图标原尺寸及其他页面样式。
- beta.3 将 512 px PNG 传给 Windows 窗口。隔离诊断确认 Electron 创建的是 512 × 512 原生窗口图标，而直接使用多尺寸 ICO 得到 32 × 32 图标。本版 Windows 窗口使用已有 `app.ico`，Mac 保持原 PNG。
- 通过 `setAppDetails` 显式设置主窗口任务栏图标及重新打开信息。安装版指向自身 EXE，免安装版指向稳定的外层启动器，避免任务栏引用临时解压目录或 `app.asar`。应用 ID 和用户数据位置保持原值。

说明依据：[Electron BrowserWindow API](https://www.electronjs.org/docs/latest/api/browser-window#winsetappdetailsoptions-windows)、[Electron 44.4.4 图标转换实现](https://github.com/electron/electron/blob/v44.4.4/shell/common/api/electron_api_native_image.cc)。beta.3 只核对了 EXE 内嵌资源，未验证运行时窗口图标，遗漏在此版补齐。

## 验证

`desktop/branding-native-smoke.cjs` 仅在隔离样例测试中运行：测量 1260/780 px、深浅主题下的 SVG 和实际路径中心；读取最终打包程序自身窗口的原生图标并与刻度环比对。它不抓取其他窗口内容，不读取真实账户。结合既有原生启动检查、46 项定向测试、两个 Windows 发布包的源码/载荷一致性校验。证据见 `verification-1.8.0-beta.4`。

## 使用

发布在 `release-v1.8.0-beta.4`。运行新版前，从旧版的退出入口完全退出，避免单实例机制唤醒旧进程。旧版及账户、设置保留。如果过去把旧 EXE 固定到任务栏，固定入口本身仍指向旧版本，可在确认新版后重新固定新版入口。

另提供同一 ASAR 的 Mac ARM64 全量试用包与源码；Mac 仍未完成实机验收。未实际执行 Windows 安装向导，未重建全局 Windows 图标缓存，未恢复长期稳定性测试。
