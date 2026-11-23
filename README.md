# 知序 · 面试练习

一个适配手机和电脑的前端面试学习应用，可作为 PWA 添加到主屏幕。围绕「选专题 → 练习表达 → 查看解析 → 自评 → 回顾」组织学习，保留原项目的题库和可迁移学习记录。

当前题库版本为 `2026.11.23`，包含 **946 道题**：31 个专题中的 278 道题，以及 30 个分组、163 条追问链中的 668 道口述题。另有 30 项简历覆盖对照。内容量代表练习范围，不代表对个人面试结果的预测。

## 已实现的功能

- 学习工作台：今日目标、继续练习、真实学习统计、专题入口。
- 专题题库：分类浏览，搜索题干、解析与知识点，直接进入对应题目。
- 练习：选择题、判断题、口述追问；草稿、收藏、笔记与分层解析；部分手写题支持本机代码运行。
- 模拟面试：跨分组抽取 12 道开场问题，先回答，完成后统一回看与自评。
- 复习清单：还需练习、到期复习、收藏与笔记；根据自评安排下一次回顾。
- 简历对照：按原有覆盖项整理项目证据，跳转关联追问链。
- 学习记录：目标设置、近期练习、JSON 备份导出和校验后导入。
- PWA：安装提示、首次缓存后的离线练习、可选择的版本更新。

学习记录保存在**当前浏览器、当前站点**的本机存储中。目前没有登录、云同步、服务端数据库或在线 AI 评分。换浏览器、设备或站点地址时，可通过 JSON 导出与导入转移记录。

## 本地运行

建议使用 Node.js 24 LTS 与 npm，依赖版本由 `package-lock.json` 固定。

```sh
npm ci
npm run dev
```

打开终端给出的本地地址，并进入 `/quiz/`。开发服务绑定 `127.0.0.1`。

```sh
npm run content:validate
npm test
npm run build
npm run preview
```

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 启动 Vite 开发服务 |
| `npm run content:validate` | 检查题量、题目引用、正确答案索引与来源链接结构 |
| `npm test` | 运行 Vitest：迁移、备份校验、持久化边界、复习统计与会话选题 |
| `npm run build` | 先进行 Vue/TypeScript 类型检查，再构建 `dist/` |
| `npm run preview` | 预览生产构建；用于本地验收 |
| `npm run test:e2e` | 在 4176 端口启动生产预览，检查页面、练习与 PWA 版本更新 |
| `npm run test:browser` | 对已启动的生产预览检查页面、备份、离线与响应式流程 |
| `npm run test:practice` | 对已启动的服务检查练习、会话恢复、模拟面试与代码运行 |

浏览器回归需要 Playwright 的 Chromium 或通过 `CHROME_PATH` 指定现有 Chrome 可执行文件。首次使用可执行：

```sh
npx playwright install chromium
npm run build
npm run test:e2e
```

`test:e2e` 要求 4176 端口空闲，会自动启动并关闭预览服务。单独运行两个浏览器脚本时，可通过 `BASE_URL` 指定服务地址；`test:browser` 默认 4176，`test:practice` 默认 4175。测试产物写入 `test-results/`。PWA 的 Service Worker 行为应在生产构建预览或 HTTPS 部署中验收，开发服务器不等同于离线发布环境。当前没有单独的 `lint` 脚本。

## 目录

```text
src/
  data/            规范化题库、查询索引、手写题用例
  domain/          类型、复习规则、迁移校验、会话选题
  infrastructure/  IndexedDB 仓储、浏览器代码运行器
  stores/          Pinia 学习状态与用例编排
  components/      图标、专题封面、答案与代码练习组件
  views/           工作台、题库、练习、复习、简历、记录页面
  styles/          全局设计变量与布局
legacy/            原题库与实现归档，供迁移校验和内容追溯
scripts/           内容导入与校验
tests/             领域与数据边界测试
public/            应用图标等静态资源
docs/              架构与设计说明
```

## 数据与旧版兼容

`src/data/bank.json` 是当前维护的题库。题目使用稳定 ID，学习记录通过 ID 引用题目。更新题目时应保留已有 ID，不要通过重新排序重建全部标识。

第一次启动新版且尚无新版记录时，应用读取同源旧版 `localStorage` 的 `quiz-game.progress.v1` 和 `frontend-deep-review-2026-v1`，迁移可对应的错题、口述自评、笔记、草稿、项目证据、代码、XP 与练习会话。原始旧数据保留并随备份导出；无法从旧数据确定的逐题掌握度与学习天数不会被补造。

在「学习记录」中导出 JSON 可保存当前数据。导入会替换当前记录，界面先确认，再校验结构与题目引用；校验失败不会覆盖现有记录。清除浏览器站点数据会同时清除本机记录和缓存，请在清理或更换设备前导出。

编辑先写入本机待保存日志，再写入 IndexedDB，刷新时恢复较新的日志。应用通过浏览器 Web Locks 限制同源同时只有一个编辑窗口；第二个窗口提供刷新和导出入口。关闭原编辑窗口后刷新即可继续。请使用支持 Web Locks 和 Service Worker 的现代浏览器。

## 部署到现有 `/quiz/`

构建结果为纯静态 `dist/`，沿用现有 `/quiz/` 入口。Vite `base`、PWA `scope`、`start_url` 与路由基路径统一为 `/quiz/`，页面路由采用 Hash 模式，例如 `/quiz/#/library`。

1. 执行内容校验、测试和构建。
2. 将完整 `dist/` 发布到现有 `/quiz/` 静态目录；保留上一版本以便回滚。
3. 保持现有 HTTPS 入口及 Caddy → Nginx 静态服务代理关系。服务器无需运行 Node.js 应用进程。
4. 验证 `/quiz/`、manifest、图标与 Service Worker 返回正常，旧缓存用户能收到更新提示。
5. 联网打开并完成缓存后，断网刷新，验收题库、练习、草稿和备份功能。

发布时建议对 `index.html`、`sw.js` 和 manifest 使用重新验证缓存策略，对带内容哈希的资源使用长期缓存。更新时界面显示「保存并更新」，等待待写入记录后启用新 Service Worker；可选择稍后更新。

仓库提供 `scripts/deploy-release.py`，用于在 Linux 上把已校验的发布归档原子交换到 `/var/www/quiz`。脚本校验归档和基线清单的 SHA-256，并逐文件确认线上内容仍与审核基线一致；不一致则停止。旧目录保留为 `/var/www/.quiz-before-<新版本前 12 位>`，交换后校验失败会恢复旧目录。本次旧版基线为 `0fa092c`，初次核对允许把 CRLF 规范为 LF；后续基线应从实际已发布版本生成。

```sh
python3 scripts/deploy-release.py release.tar.gz <归档SHA256> baseline.json <基线文件SHA256> <新版本commit>
```

发布归档以 `dist/` 内文件为根，必须包含 `index.html`、`sw.js` 和 `manifest.webmanifest`。脚本依赖 Linux 的 `renameat2`，不负责上传文件、生成基线或获取凭据。第三方许可随构建输出到 `/quiz/third-party-notices.txt`。

仓库文档不存放 SSH 密码、密钥或其他部署凭据。部署认证由运行环境管理。

## 进一步说明

- [架构说明](docs/architecture.md)：模块边界、数据结构、迁移、持久化和扩展路径。
- [设计说明](docs/design.md)：信息架构、响应式布局、视觉依据与交互规范。
- [第三方声明](THIRD_PARTY_NOTICES.md)：图标与运行时依赖的许可信息。

## 持续集成配置

`docs/ci-workflow.yml` 提供 GitHub Actions 验收配置，包含内容校验、单元测试、构建和浏览器测试。当前 Git 推送凭据没有 `workflow` 权限，因此配置暂未放入 `.github/workflows/` 启用。获得相应权限后可移动该文件；本地使用 `npm run test:e2e` 执行同样的浏览器验收。
