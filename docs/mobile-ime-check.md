# AI 输入法检查

用户报告 iPhone Safari 点击语言切换键后仍停在英文键盘。自动化使用 WebKit、Chromium 和 320/390/1440 视口，所有 API 由夹具拦截，没有创建真实账号、会话或模型任务。

## 已确认的结果

线上旧版的 AI 与题目笔记均为普通 textarea，继承页面中文语言，没有强制英文的输入属性。中→英→中的合成组合事件在两种输入框中均保留完整文字、焦点和 DOM 节点。密码框与 AI 编辑器不是同一节点，密码自动填充属性没有继承。

存在另一项明确网页缺陷：组合输入过程中，若确认回车的 `isComposing` 为 false、键码为 13，旧逻辑会拦截并发送尚未提交中文之前的旧值；组合结束紧接回车也会触发发送。此结果是合成事件复现，不等于已证明用户手机发出了相同事件。

密码框通过回车提交后，旧节点会被登录界面替换，自动化观察到原节点没有 blur 事件。另有焦点兼容风险：`focusout` 的 `relatedTarget` 为空时立即改变底栏和页面高度，没有复核输入框是否仍持有焦点。

## 修改

- 保留 Vue 的 v-model 组合输入处理，记录 composition 生命周期，并对桌面组合结束后的确认回车增加短暂保护。
- 移动端回车保留原生候选确认及换行，发送使用显式按钮。组合输入未完成时不提交旧文本。
- change 提交、真正失焦和卸载清理组合状态。失焦布局变化延迟到下一帧复核实际焦点，避免空 relatedTarget 引发即时重排。
- 登录提交先读取原生字段，再明确结束登录输入框的焦点会话。AI 编辑器声明通用文本用途，不设置英文语言或拉丁键盘模式。

[Vue 表单说明](https://vuejs.org/guide/essentials/forms.html)介绍了组合输入期间的同步行为；[Chrome 的输入法回车指南](https://developer.chrome.com/docs/modern-web-guidance/guides/forms/ime-safe-enter-submit)说明了候选确认与发送快捷键的区分。[Apple 的输入模式说明](https://developer.apple.com/documentation/uikit/uiresponder/textinputmode)描述的是原生响应者键盘，不能据此认定网页能够控制系统语言键。

## 回归与边界

`scripts/verify-ime.cjs` 每个引擎包含 24 组检查，覆盖混合输入、候选确认、isComposing/229 对照、移动换行与发送、桌面快捷键、change 提交、焦点和卸载，以及密码输入框转到 AI 编辑器。报告固定标记 `syntheticCompositionEvents=true`、`physicalIOSKeyboard=false`。

Chromium 与 WebKit 各 24 组通过，生产构建的 PWA、认证、备份及更新回归通过。首次 WebKit 卸载用例在异步发送完成前就导航，触发了发送后的路由切换；改为等待本次发送完成再独立测试卸载后，原有断言全部通过。原始失败保留在 `test-results/ime-webkit-initial-navigation-race.json`；发送未完成时导航可能回跳作为独立待处理诊断保留，没有按输入法问题已解决来归类。

```sh
npm run test:ime
npm run test:ime:webkit
```

目前没有直接控制实体 iPhone 的系统键盘，尚未复现或实机确认“语言切换键一直停留英文”这一原始现象。以上修复处理已证实的网页输入问题及焦点兼容风险；自动化通过不能作为该系统键盘问题已解决的结论。
