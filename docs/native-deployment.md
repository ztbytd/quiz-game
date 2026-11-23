# 原生服务部署

阿里云采用 Node.js 24、Ubuntu PostgreSQL 16 和 systemd。API 与 Worker 同进程运行，监听 `127.0.0.1:3100`；Caddy 保留 `/quiz/api/*` 完整路径代理，Nginx 继续提供 `/var/www/quiz` 静态资源。

应用代码位于 `/opt/zhixu/releases/<Git提交>/`，`/opt/zhixu/current` 指向当前后端。Node 官方归档安装在 `/opt/zhixu/runtime/`，下载后核对官方 SHA-256。服务使用独立 `zhixu` 系统账号，内存上限为 512 MiB。服务单元见 `deploy/zhixu-api.service`。

私有配置位于 `/etc/zhixu/quiz.env`，由 root 持有、权限 0600；`EnvironmentFile` 在切换服务账号前读取。配置包含 `NODE_ENV=production`、`APP_ORIGIN=https://112.74.52.169`、本机 PostgreSQL 连接和现有 DeepSeek 参数。代码包和静态目录均不包含环境文件、数据库或模型凭据。

首次迁移将本机 PGlite 逻辑导出到私有文件，导入空 PostgreSQL 库，保留账号、个人题版本、会话、消息、笔记、公共发布、审计及用量。会话登录令牌不迁移，用户在生产地址重新登录。迁移前必须停止本地 API 并完成数据库备份。导出时传入显式绝对路径：

```sh
node scripts/export-local-db.ts --source /绝对路径/server/data --output /绝对路径/snapshot.private.local --offline
node --env-file=/etc/zhixu/quiz.env scripts/import-postgres.ts --input /绝对路径/snapshot.private.local
```

业务记录按完整行的多重集合校验，消除数据库排序规则差异；字段值、重复次数及题目 ID 均严格保留。JSON 以数据库文本传输，保留 SQL NULL、JSON null 与精确数值；日期保留时区和微秒。目标库非空时拒绝导入。

后端启动成功、模型连通及数据库内容核对后，新增 Caddy 的 API 路由并执行配置校验与 reload。最后使用 `scripts/deploy-release.py` 根据已审核的旧文件清单原子切换前端；脚本保留原静态目录。Caddy 配置及原站点额外备份在 `/var/backups/zhixu/`。`deploy/nginx-quiz.conf` 为清单设置 `application/manifest+json`，并让入口与 Service Worker 每次验证缓存。

## 运行

```sh
systemctl status zhixu-api
journalctl -u zhixu-api -n 80 --no-pager
curl --fail http://127.0.0.1:3100/quiz/api/v1/health
systemctl restart zhixu-api
```

重启前检查没有运行中生成任务。前端与后端代码可以分别回退，数据库保留不删除；题库恢复通过维护页新增发布。若回退服务配置，使用本次上线前保留的 Caddyfile，再校验和 reload。不要直接用旧数据库覆盖包含新学习数据的生产库。

## 备份

`zhixu-backup.timer` 每天生成 PostgreSQL custom-format 备份，保存在 `/var/backups/zhixu/`，权限 0600。脚本先写 `.partial`，完成后原子改名；失败保留部分文件供排查。此次上线需将一份备份恢复到新建的验收库并核对题目、个人内容和表数量，再删除该验收库。

```sh
systemctl start zhixu-backup
systemctl list-timers zhixu-backup.timer
pg_restore --list /var/backups/zhixu/对应文件.dump
```

每日备份保留在服务器；首次验收备份另有本机私有副本。自动跨主机或对象存储备份尚未配置。

## 2026 年 11 月 23 日上线记录

- 应用提交：`729fe548367094d40cb65ef5b01a4cec808c09bd`，前端 39 个文件逐一核对 SHA-256；在线版本可读 `/quiz/release.json`。
- 旧静态版本：`2fd31f0`，保留在 `/var/www/.quiz-before-729fe5483670`。旧代理和静态包在 `/var/backups/zhixu/bootstrap-20261123-95c935f/`。
- 导入 12 张业务表，共 7 行：1 个账号、2 个公共发布、2 个升级标记、1 条审计及 1 条用量；当前本机个人生成题、会话和全局笔记均为 0。最新公共发布包含全部 1011 道题、31 个专题。
- 初次逐行比对发现数据库排序规则不同，事务回滚；修复为完整行多重集合比较后，所有行和题目 ID 校验通过，未舍弃字段。
- 首次 PostgreSQL 备份：`/var/backups/zhixu/zhixu-20261123T143527Z-252845.dump`，恢复到独立库后逐表完整行及题目 ID 一致；验收库已删除。
- 原 Caddy 配置除 quiz API 路由外逐字保持，现有应用监听与服务状态保留。API 和 PostgreSQL 均只监听本机地址。API 初次检查无自动重启，内存约 73 MiB，整机仍有约 1 GiB 可用内存。
- 严格 HTTPS 的线上 Chrome 验收通过：390/1440 宽度导航、搜索、作答、笔记收藏与刷新恢复；Service Worker 激活后整页离线刷新、搜索及打开题目；清单及安装说明可用。隔离浏览器不执行操作系统级安装。
- 线上真实 AI 验收仅调用一次，约 2.4 秒完成，观察到 `text/event-stream` 的运行中片段及完成状态；刷新历史一致。验收会话已删除。另以实际 UI 补验登录、退出、刷新，退出后 `/me` 为 401。
- 未登录的 `/quiz/api/v1/me` 返回 401，表示当前没有有效登录会话；公共题库保持可用。AI 功能需登录。首次迁移不保留旧登录令牌。

## 移动端认证更新

移动端认证修复版本为 `485d107`，修复 Safari 自动填充未同步、提交失败清空密码及切换模式残留错误；后台仍为 `729fe54`，此次未重启或迁移数据库。39 个静态文件哈希核对通过，旧前端保留在 `/var/www/.quiz-before-485d107f8d2d`。双引擎回归和线上真实登录结果见 [移动端认证修复](mobile-auth-fix.md)。

## AI 输入法兼容更新

当前前端为 `2948692`，仅更新组合输入保护、手机回车行为、焦点布局复核和登录密码输入会话清理。39 个文件哈希核对通过，原前端保留在 `/var/www/.quiz-before-29486925e8f9`；后台、数据库和代理均未重启。合成事件回归及未能实机确认的系统语言键现象见 [AI 输入法检查](mobile-ime-check.md)。
