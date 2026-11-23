# AI 服务运行说明

## 本地启动

使用 Node.js 24，执行 `npm ci`。将 `server/.env.example` 复制为 `server/.env.local`，填写管理账号与密钥。该私有文件被 Git 和 Docker 构建上下文排除。

当前使用 DeepSeek 官方接口：模型为 `deepseek-flash`，接口基址为 `https://api.deepseek.com/v1`。官方模型列表还提供 `deepseek-v4-pro`。模型与接口可在私有环境配置中调整，密钥通过 `python scripts/configure-ai.py` 隐藏输入；该脚本保留原有账号、数据库和其他环境配置。

DeepSeek 请求使用 `max_tokens`，显式关闭 thinking，继续支持流式正文、JSON 输出与实际 tokens 用量。其他 OpenAI 兼容平台保留原有参数行为。接口依据见 [DeepSeek 官方说明](https://api-docs.deepseek.com/api/create-chat-completion/)。

```sh
npm run dev:all
```

打开 `http://127.0.0.1:5185/quiz/#/ai`。账号来自私有配置的 `ADMIN_USERNAME` 与 `ADMIN_PASSWORD`。首个账号创建后，修改环境变量不会直接重置数据库中的密码。

本地使用持久化 PGlite，数据保存在 `server/data/`，同一目录只运行一个实例。API 和前端也可分别运行 `npm run dev:api`、`npm run dev`，使用 3100 和 5173 端口。`APP_ORIGIN` 必须与浏览器地址的协议、主机和端口一致。

## 模型验证

```sh
node --import tsx scripts/verify-provider.ts
```

脚本执行一次短流式请求，只输出模型、字符数和用量。2026 年 11 月 23 日切换 DeepSeek 后，真实 `deepseek-flash` 已通过答疑、回答点评、两道场景题生成及复核、面试提问和复盘。单次测试中的答疑约 3.6 秒，点评约 4.5 秒，两道题生成及复核约 15.2 秒，提问约 0.8 秒，复盘约 6.1 秒。这是一次连通和结构化输出验收，不替代大规模内容质量评测。

完整链路脚本为 `npx tsx scripts/verify-live-ai.ts`，使用独立内存数据库和临时账号。脚本调用真实模型并消耗额度，要求生成数量、逐题检查和任务状态通过。排查平台错误可运行 `python scripts/diagnose-provider.py`，输出中不包含密钥。

生成任务每批两道，结果逐批保存；断线后继续查询原任务。复核失败会保留候选，用户可以单独重新复核，无需再次生成。结构不合法的题目逐题显示原因，未返回的题目计入剩余数量。

## 生产配置

阿里云当前前端为 `485d107`、后端为 `729fe54`，入口为 [知序](https://112.74.52.169/quiz/)。主机为 Ubuntu 24.04、2 核、约 1.58 GiB 内存；采用 Node.js 24.22.3、PostgreSQL 16.15 和 systemd，API 与 Worker 同进程运行。Caddy、Nginx 与其他应用保留原服务，仅为 quiz 增加 API 路由及 PWA 的 MIME/缓存配置。

当前服务为 `zhixu-api`，私有配置在 `/etc/zhixu/quiz.env`，数据库角色使用 UTC。每天自动备份到 `/var/backups/zhixu/`，首次备份已实际恢复核对，并在本机保存私有副本。完整路径、服务配置和恢复边界见 [原生部署说明](native-deployment.md)。

以下容器配置供其他环境使用，当前阿里云未安装或运行 Docker。

创建不提交的 `server/.env.production.local`：

```dotenv
APP_ORIGIN=https://你的域名
ADMIN_USERNAME=admin
ADMIN_PASSWORD=自行设置的长密码
POSTGRES_PASSWORD=自行设置的数据库密码
DATABASE_URL=postgresql://zhixu:URL编码后的数据库密码@postgres:5432/zhixu
AI_BASE_URL=https://api.deepseek.com/v1
AI_MODEL=deepseek-flash
AI_API_KEY=填写服务密钥
AI_DAILY_TOKENS=300000
```

```sh
docker compose --env-file server/.env.production.local -f compose.ai.yml up -d --build
```

先检查现有服务器资源和端口。PostgreSQL 只位于容器网络，API 映射到服务器 `127.0.0.1:3100`。现有 Caddy 将 `/quiz/api/*` 优先代理到 API，保持完整路径；前端继续使用 Nginx 静态服务。

SSE 需要及时刷新响应，并验证代理缓冲、空闲超时、取消和重连。生产使用受信任 HTTPS 证书。部署前验证模型、数据库、备份恢复与完整学习流程，再发布前端。

关闭付费调用可将 `AI_DAILY_TOKENS` 设为 0 并重启 API 和 Worker。已有内容仍可读取。前端目录切换不能单独回退数据库，题库内容恢复通过维护页创建新的发布清单。

## 验证

```sh
npm run content:validate
npm test
npm run check:api
npm run test:api
npm run build
npm run test:ai-ui
npm run test:e2e
```

AI 界面测试启动独立内存数据库、测试账号与测试 provider，不使用真实密钥。截图写入忽略提交的 `test-results/`。

学习进度保存在按账号隔离的本机 IndexedDB；对话、生成题、全局笔记和用量保存在服务端。学习进度的自动跨设备合并尚未实现，当前可通过导入导出转移。

维护账号可在 AI 页的账号菜单修改密码。修改会轮换当前会话，并撤销其他已登录会话；修改环境文件不会覆盖已有账号密码。全局笔记编辑采用版本校验，冲突时保留用户输入并要求重新合并。

## 本次验收记录

2026 年 11 月 23 日，本地通过以下验证：

- 学习领域与记录清理：38 项测试。
- 服务端、模拟状态、模型流、内容升级、点评输入与结构化修复：45 项测试。
- AI 浏览器流程：登录、会话刷新、分批出题、保存和练习、题内对话、段落引用、手机发送、笔记编辑、动态追问、面试中刷新、最终作答纳入报告、退出；1440/1024/768/390 宽度无横向溢出。
- 生产构建回归：PWA、离线路由、备份、12 题固定模拟、27 个代码用例、代码超时与网络隔离、选项顺序、应用更新后新记录保留。
- 题库：1011 道、31 个专题、163 条追问链，全部 ID 保留；本轮修订 8 道题的 9 个字段，题库版本为 `2026.11.23-quality.2`。已有数据库采用旧值比较与不可变发布安全升级。
- 发布文件凭据扫描：未发现私有模型密钥或管理密码。

DeepSeek 功能链路已跑通；重复调用的普通点评仍出现错误判定遗漏，保留为未解决的质量问题。阿里云生产数据库迁移、HTTPS 代理与备份恢复已验收。自动个性化推荐、知识点角度覆盖矩阵、学习进度云端合并和大规模人工质量评测属于后续工作。界面中的基础补题建议与专题题数统计不代表这些能力已完成。

AI 3.0 首次迁移沿用此前授权的旧记录清理规则：仅清理旧版本进度库、旧草稿与待写日志，使用版本 3 的新学习库，并保留公共和个人题库缓存。完成标记防止重复清理。本轮质量修订不再次重置学习记录。

## 真人式回归

`npm run test:journey` 通过隔离数据库和测试模型执行界面流程；`npm run test:journey:live` 使用私有模型配置执行相同的真实调用，会消耗额度。两者均使用临时账号，包含故障注入后重用原任务、停止回复、正确与错误作答点评、出题保存、公共发布和恢复、退出账号等 15 组操作，并补跑 7 组专项回归。

`npm run test:e2e` 在生产构建上验证 PWA、离线、备份、代码隔离、应用更新及专项界面回归。详见 [本次检查报告](qa-report-2026-11-23.md)，其中明确记录了内容抽样范围和仍需核实的 AI 建议。
