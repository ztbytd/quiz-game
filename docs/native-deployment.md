# 原生服务部署

阿里云采用 Node.js 24、Ubuntu PostgreSQL 16 和 systemd。API 与 Worker 同进程运行，监听 `127.0.0.1:3100`；Caddy 保留 `/quiz/api/*` 完整路径代理，Nginx 继续提供 `/var/www/quiz` 静态资源。

应用代码位于 `/opt/zhixu/releases/<Git提交>/`，`/opt/zhixu/current` 指向当前后端。Node 官方归档安装在 `/opt/zhixu/runtime/`，下载后核对官方 SHA-256。服务使用独立 `zhixu` 系统账号，内存上限为 512 MiB。服务单元见 `deploy/zhixu-api.service`。

私有配置位于 `/etc/zhixu/quiz.env`，由 root 持有、权限 0600；`EnvironmentFile` 在切换服务账号前读取。配置包含 `NODE_ENV=production`、`APP_ORIGIN=https://112.74.52.169`、本机 PostgreSQL 连接和现有 DeepSeek 参数。代码包和静态目录均不包含环境文件、数据库或模型凭据。

首次迁移将本机 PGlite 逻辑导出到私有文件，导入空 PostgreSQL 库，保留账号、个人题版本、会话、消息、笔记、公共发布、审计及用量。会话登录令牌不迁移，用户在生产地址重新登录。迁移前必须停止本地 API 并完成数据库备份。命令及校验以 `scripts/export-local-db.ts` 与 `scripts/import-postgres.ts` 的帮助和参数为准。

后端启动成功、模型连通及数据库内容核对后，新增 Caddy 的 API 路由并执行配置校验与 reload。最后使用 `scripts/deploy-release.py` 根据已审核的旧文件清单原子切换前端；脚本保留原静态目录。Caddy 配置及原站点额外备份在 `/var/backups/zhixu/`。

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

备份当前保留在同一服务器。跨主机或对象存储备份尚未配置。
