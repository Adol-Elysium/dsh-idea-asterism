# 开发说明

## 构建与打包

在项目根目录使用 Node.js 24 和 npm。客户端由 `core.cjs`、`src/` 中的界面代码和样式生成，改动后重新构建 `client.js`。

```sh
npm run build
npm test
npm pack --offline --ignore-scripts
```

1.0.0 的安装包为 `dsh-idea-asterism-1.0.0.tgz`。内置的第三方组件与许可证在 `assets/`。星体纹理随包提供；重新生成时运行 `tools/render-bodies.py`，需要 NumPy、SciPy 和 Pillow。

## 对接 DSH

`index.js` 注册宿主服务与插件入口，`ai.js` 调用模型、检索和人格预设，`store.js` 负责持久化。插件包名为 `dsh-idea-asterism`，路由前缀为 `/dsh-idea-asterism`，存档位于 DSH 数据主目录下的 `star-sea/galaxies.json`。产品版本与存档格式版本独立。

在 DSH 升级后，可用 `node tools/check-host.mjs "<DSH 安装目录>"` 对照维护者在本机记录的宿主基线。公开项目提供空白模板 tools/host-baseline.example.json，可复制为已忽略的 tools/.host-baseline.json，填写经过复核的版本与模块哈希。也可通过第二个路径参数或 DSH_BASELINE_PATH 指定本地基线文件。返回码 2 表示版本或模块摘要有变化。复核相关接口、运行测试，并在隔离配置中试装，再按验证结果更新 本机适配基线 和 `package.json` 中的 `engines.dsh`。

## 界面验证

- `npm test` 运行本地回归测试，覆盖存档、人格列表、联想校验、彗星轨道、鼠标减速和删除撤销等行为。
- `node tools/browser-smoke.mjs` 使用本机浏览器、临时存档、模拟模型和模拟检索服务，验证编辑、导入、布局、导出和迁移。设置 `PLAYWRIGHT_ENTRY` 为 Playwright 模块入口的文件 URL，`EDGE_PATH` 为 Chromium 系浏览器可执行文件路径，`STAR_SEA_REACT_FIXTURE` 为测试用模块目录（其中 `react-fixture.js` 导出 React 与提供 createRoot 的 DOM）。
- `node tools/host-smoke.mjs` 使用同一浏览器配置和 `DSH_INSTALL` 指定的 Windows 桌面宿主。先在 `tools/.test-profile` 下初始化并安装插件到含桌面 Web 界面的隔离配置 `star-sea-check`，再运行脚本，验证侧栏入口、编辑和保存。

发布时同步更新 `package.json`、README 的安装示例和 CHANGELOG，重新构建并验证打出的安装包。
