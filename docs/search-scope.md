# 检索入口范围调整

顶部搜索提交后会直接跳转题库，`Ctrl/Cmd + K` 也在全站抢占输入焦点，练习过程中容易被打断。

本次移除应用顶部的搜索表单、搜索路由跳转和全局快捷键监听，并清理对应样式。顶部日期与学习记录入口保持右侧对齐。

题目与解析检索保留在专题题库内；复习清单、简历对照、AI 对话历史各自保留对应内容的搜索。练习与模拟面试不显示检索框。

## 验证

- `npm run build` 通过。
- `npm run test:e2e` 的生产构建回归通过，包含 9 组界面回归、练习、离线题库、认证、组合输入、30 组布局检查及 PWA 更新后的记录保留。
- `npm run test:journey` 的 15 组操作流程通过，使用隔离数据库和模拟模型。
- 新增检索专项在 Chromium、WebKit 下各 2 组通过，覆盖 1440×1000 和 390×844：普通口述练习、模拟面试、草稿继续输入，以及进入题库后的局部搜索。

快捷键检查使用可冒泡的 DOM 键盘事件，验证应用没有拦截事件、转移焦点或改变当前题目与路由；浏览器自身的地址栏快捷键不属于应用控制范围。所有检索专项的 API 请求均由夹具处理。

```sh
node scripts/verify-ui-regressions.cjs --filter=search-scoped
node scripts/verify-ui-regressions.cjs --webkit --filter=search-scoped
```

报告为 `test-results/ui-regressions-filtered.json` 和 `test-results/ui-regressions-webkit-filtered.json`。WebKit 需预先安装 Playwright 对应浏览器，并按安装位置配置 `PLAYWRIGHT_BROWSERS_PATH`。

首次扩展运行 WebKit 界面套件时发现两处测试前提不成立：收藏用例在账号初始化完成前写入访客学习空间，随后读取测试账号空间；弹窗用例假定鼠标点击会聚焦开启按钮，而 WebKit 的点击行为没有建立该焦点。访客记录仍保留，弹窗恢复的是打开前的焦点。测试分别等待账号界面就绪、使用键盘激活开启按钮，再检查原有行为。初次失败报告保留为 `test-results/ui-regressions-webkit-initial-preconditions.json`，产品逻辑未作修改。

调整测试前提后，WebKit 界面套件 9/9 通过，报告为 `test-results/ui-regressions-webkit.json`；Chromium 的收藏范围和键盘焦点两项定向复跑也通过。原断言保留，第二次指针激活仍未建立焦点的报告另存于 `test-results/ui-regressions-webkit-pointer-preconditions.json`。

## 上线

前端提交 `db533effbe4df752a356fc672a1789cf9d1ec200` 已推送并部署，39 个静态文件的哈希核对一致。上一版保留于 `/var/www/.quiz-before-db533effbe4d`。线上严格 HTTPS 的版本、健康接口，以及手机、电脑的 Chromium/WebKit 检索专项均通过。后台和数据库保持原运行状态，学习记录与题库未作清理。
