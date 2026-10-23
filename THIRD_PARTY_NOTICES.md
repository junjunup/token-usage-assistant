# 第三方组件与许可

Token 用量助手本身以 [MIT 许可证](LICENSE) 发布。安装包中还包含以下第三方组件，它们各自遵循原有许可证：

| 组件 | 版本 | 许可证 | 用途 |
|---|---|---|---|
| [Electron](https://github.com/electron/electron) | 44.9.3 | MIT | 桌面应用运行时；它包含的 Chromium、Node.js 等组件的许可证见 Electron 发行包中的 `LICENSE` 与 `LICENSES.chromium.html`（Windows 安装目录与 Mac 应用的 `Contents/Resources` 中分别为 `LICENSE.electron.txt` 与 `LICENSES.chromium.html`，自 1.9.0-beta.2 起 Mac 也附带） |
| [React](https://github.com/facebook/react) / React DOM | 19.2.0 | MIT | 界面 |
| [scheduler](https://github.com/facebook/react)（React DOM 的依赖） | 0.27.0 | MIT | 界面 |
| [Chart.js](https://github.com/chartjs/Chart.js) | 4.5.1 | MIT | 用量图表 |
| [@kurkle/color](https://github.com/kurkle/color)（Chart.js 的依赖） | 0.3.4 | MIT | 用量图表 |
| [Phosphor Icons](https://github.com/phosphor-icons/react) | 2.1.10 | MIT | 界面图标 |
| [Geist / Geist Mono](https://github.com/vercel/geist-font)（经 [Fontsource](https://fontsource.org/) 打包） | 5.3.0 | SIL Open Font License 1.1 | 界面字体 |

开发与构建工具（Vite、electron-builder、ESLint、Prettier、TypeScript 等）只在构建时使用，不随安装包分发。

各组件的完整许可证文本见 [THIRD_PARTY_LICENSES.txt](THIRD_PARTY_LICENSES.txt)（由 `node scripts/third-party-licenses.mjs` 从已安装的依赖生成，测试会检查它与依赖一致）。自 1.9.0-beta.3 起，安装包中随附本应用的 `LICENSE.txt`、本文件和 `THIRD_PARTY_LICENSES.txt`：Windows 在安装目录的 `resources` 文件夹，Mac 在应用的 `Contents/Resources`。

## 商标

Command Code、ChatGPT / Codex、Claude、DeepSeek、GLM、MiniMax、火山引擎、OpenCode、Zcode、DeepSeek Harness 等名称和标志归各自所有者所有。本项目只为说明兼容的平台和工具而使用这些名称，与它们没有隶属、授权或背书关系，也不是任何平台的官方客户端。
