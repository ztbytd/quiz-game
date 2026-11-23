# 知序

响应式 Web + PWA 面试学习应用，提供专题练习、复习和独立 AI 交流入口。AI 页面参考 Claude 的桌面与移动端会话组织，采用左侧历史、集中输入、连续阅读与按需展开的题目资料。

## 当前功能

- 专题、章节和单题练习，选择、判断、口述与本机代码练习。
- 独立 AI Tab、会话历史、题目关联、多轮交流与流式恢复。
- 基于实际回答的点评、动态追问、可配置模拟面试与逐题复盘。
- 指定范围、难度和数量生成练习，逐题检查后保存到个人题库。
- 维护者修订、审核、发布和恢复题库，内容更新无需重新部署前端。
- 个人对话笔记编辑、题目笔记、收藏、自评、对话导出和备份。
- 邀请账号、资源权限、CSRF、持久任务、幂等、取消和 tokens 额度。
- IndexedDB 本地学习、账号隔离、离线题库和手动应用更新。

前端为 Vue 3 + TypeScript，后端为 Fastify，生产数据库为 PostgreSQL。开发和集成测试使用 PGlite。服务端保存对话、生成题、发布、笔记和用量；学习进度自动跨设备同步尚未实现。

本版保留全部 1011 道题及个人题库。首次打开会一次性清理旧答题进度、收藏、笔记、草稿、积分和练习历史，使用全新的学习记录；之后新增的记录正常保存。题库内容与缓存不在清理范围内。

## 本地运行

需要 Node.js 24。安装依赖，将 `server/.env.example` 复制为 `server/.env.local`，填写管理账号和模型密钥：

```sh
npm ci
npm run dev:all
```

打开 `http://127.0.0.1:5185/quiz/#/ai`。当前使用 DeepSeek 官方接口和 `deepseek-flash`。阿里云入口为 [知序](https://112.74.52.169/quiz/)，AI 后端已上线。真实模型链路已跑通，普通点评仍出现过错误判定遗漏的样例，详见检查报告。

私有环境配置与数据库目录被 Git 和 Docker 构建上下文排除。不要将密钥放进 `VITE_` 变量。

## 验证

```sh
npm run content:validate
npm test
npm run check:api
npm run test:api
npm run build
npm run test:ai-ui
npm run test:journey
npm run test:journey:live
npm run test:e2e
```

AI 界面测试使用独立内存数据库和测试 provider，不调用真实模型。生产浏览器回归覆盖 PWA、离线练习、备份、刷新恢复、选择题顺序与代码隔离。截图位于 `test-results/`。

`test:journey:live` 会调用私有配置中的真实模型；测试账号及内容位于临时数据库，不修改用户现有记录。本轮完成 15 组固定交互流程、7 组专项界面回归和 153 道题的语义抽查；真实模型重复调用仍有点评误判，具体修订和检查范围见 [检查报告](docs/qa-report-2026-11-23.md)。

## 项目目录

```text
src/                 Vue 页面、学习领域规则与浏览器仓储
packages/contracts/  前后端及模型输出契约
server/              API、数据库、模型适配与后台任务
scripts/             启动、校验、配置和浏览器验收
public/              图标与许可声明
tests/               学习规则及存储边界测试
docs/                最新架构、设计、功能方案与运行说明
```

## 运行与部署

前端入口为 `/quiz/`，API 为 `/quiz/api/v1/`。当前阿里云采用 Node.js 24、PostgreSQL 16 和 systemd，API 与 Worker 同进程运行。Caddy 优先代理 API，Nginx 提供静态前端；配置见 [原生部署说明](docs/native-deployment.md)。`Dockerfile.ai` 和 `compose.ai.yml` 保留为其他环境的容器部署方式，未在当前主机运行。

本次改造位于 `app-rebuild-20261123` 分支，当前生产前端为 `db533ef`，后端为 `729fe54`。已迁移原账号和公共发布，保留全部 1011 道题；生产数据库备份已恢复到隔离库，并核对全部业务记录和题目 ID。[移动端认证修复](docs/mobile-auth-fix.md)、[AI 输入法兼容修复](docs/mobile-ime-check.md)、[首屏布局修复](docs/layout-fix.md) 和 [检索入口范围调整](docs/search-scope.md) 已上线；输入法文档单独记录实体 iPhone 系统语言键尚未验证的边界。

- [架构说明](docs/architecture.md)
- [设计说明](docs/design.md)
- [AI 学习方案](docs/ai-learning-plan.md)
- [第三方声明](THIRD_PARTY_NOTICES.md)
