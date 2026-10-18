# 第三方组件与许可

Token 用量助手本身以 [MIT 许可证](LICENSE) 发布。安装包中还包含以下第三方组件，它们各自遵循原有许可证：

| 组件 | 版本 | 许可证 | 用途 |
|---|---|---|---|
| [Electron](https://github.com/electron/electron) | 44.4.4 | MIT | 桌面应用运行时；它包含的 Chromium、Node.js 等组件的许可证见 Electron 发行包中的 `LICENSE` 与 `LICENSES.chromium.html`（Mac 安装包目前没有附带这两个文件，待补） |
| [React](https://github.com/facebook/react) / React DOM | 19.2.0 | MIT | 界面 |
| [Chart.js](https://github.com/chartjs/Chart.js) | 4.5.1 | MIT | 用量图表 |
| [Phosphor Icons](https://github.com/phosphor-icons/react) | 2.1.10 | MIT | 界面图标 |
| [Geist / Geist Mono](https://github.com/vercel/geist-font)（经 [Fontsource](https://fontsource.org/) 打包） | 5.3.0 | SIL Open Font License 1.1 | 界面字体 |

开发与构建工具（Vite、electron-builder、ESLint、Prettier、TypeScript 等）只在构建时使用，不随安装包分发。

各组件的完整许可证文本见对应项目仓库，或本仓库安装依赖后 `node_modules/<组件>/LICENSE`。

## 商标

Command Code、ChatGPT / Codex、Claude、DeepSeek、GLM、MiniMax、火山引擎、OpenCode、Zcode、DeepSeek Harness 等名称和标志归各自所有者所有。本项目只为说明兼容的平台和工具而使用这些名称，与它们没有隶属、授权或背书关系，也不是任何平台的官方客户端。
