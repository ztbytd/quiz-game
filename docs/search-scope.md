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

额外运行现有界面套件的 WebKit 版本时，两项未通过：复习收藏条目读取超时、会话列表关闭后立即读取焦点为空。完整失败报告保留在 `test-results/ui-regressions-webkit.json`；本次未修改这两处流程，检索专项分别验证。
