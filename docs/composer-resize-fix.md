# AI 输入框发送后回缩修复

长文本撑高输入框后，发送成功虽已清空文字，输入框仍保持 180px。退出 AI 再进入后，手机恢复约 75px，电脑恢复约 79px。

## 原因与修改

原监听器在 Vue 更新 textarea 的 DOM 值之前读取 `scrollHeight`。线上隔离探针记录到先测量 960 字的旧内容，再将 DOM 值设为空；空框沿用了旧内容的 180px 内联高度。

草稿保存保留原监听顺序，高度测量单独放在 DOM 更新后的监听中。同时监听 textarea 引用，保证登录完成、长草稿刷新或组件重新挂载后也能按实际内容计算高度。空文本恢复 `height: auto`，沿用 `rows="2"` 和各尺寸原有样式；非空内容保持 180px 上限。

修改不替换 textarea，不主动聚焦，不改变文字、选区和组合输入状态，也没有使用延时器。

## 验证

原线上版本的重复测试覆盖 Chromium/WebKit、390×844 和 1440×1000，每个组合 12 次长文本发送，48/48 均出现空框停留在 180px。内容包括长段落、多行、分次输入，交替使用发送按钮和 `Ctrl+Enter`，并加入短文本对照与退出重进检查。原始报告保留在 `test-results/composer-repro/`。

修后按相同条件重复 48 次，全部恢复到初始高度：390 宽为 75.375px，1440 宽为 79.375px，两引擎均没有残留 180px 空框。报告和截图另存于 `test-results/composer-repro-fixed/`，原始复现证据保留。WebKit 的 24 组合成输入、手机回车及焦点回归通过；这不等同于操作实体 iPhone 系统键盘。

正式脚本 `scripts/verify-composer.cjs` 在旧线上版本的 8 组检查全部检出问题，报告另存为 `test-results/composer/results-chromium-before-fix.json`。修后 Chromium/WebKit 各 8/8 通过，每个引擎再重复 12 次长文本发送，并检查手动删空、发送失败保留文字与高度、长草稿离开返回及刷新首次挂载、长短会话草稿切换和新对话回缩。结果保存在 `test-results/composer/results-{chromium,webkit}.json`。

构建和完整生产浏览器回归通过，包含本次新增脚本、练习、离线题库、认证、组合输入、30 组布局以及 PWA 更新后的笔记、目标和当前练习保留。

```sh
npm run test:composer
npm run test:composer:webkit
npm run test:e2e
```

正式回归使用隔离账号状态和模拟回复，所有 API 均由夹具处理，不写入真实账号或调用模型。WebKit 需配置已安装的 Playwright 浏览器位置。

## 上线

前端提交 `b5895e6e3b9d06d9621af2e37bfaef8cfbe07117` 已推送并部署，39 个静态文件的哈希逐项核对一致，上一版保留在 `/var/www/.quiz-before-b5895e6e3b9d`。线上严格 HTTPS 的版本、健康接口及 Chromium/WebKit 各 8 组输入框专项通过。后台和数据库保持原运行状态。已有 PWA 用户刷新后点击「保存并更新」加载新版。
