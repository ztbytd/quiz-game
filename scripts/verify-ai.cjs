const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
(async () => {
  fs.mkdirSync("test-results", { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  });
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    const page = await context.newPage();
    page.on("request", (r) => {
      if (r.method() === "POST" && r.url().endsWith("/conversations"))
        console.log(
          "Conversation mode:",
          JSON.parse(r.postData() || "{}").mode || "chat",
        );
    });
    const errors = [];
    page.on("response", async (r) => {
      if (r.status() >= 400 && r.url().includes("/api/"))
        console.log(r.status(), r.url(), (await r.text()).slice(0, 200));
    });
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(
      (process.env.AI_TEST_BASE || "http://127.0.0.1:5174") + "/quiz/#/ai",
    );
    await page.getByLabel("用户名", { exact: true }).fill("tester");
    await page.getByLabel("密码", { exact: true }).fill("test-only-password");
    await page.getByRole("button", { name: "登录", exact: true }).click();
    await page.getByRole("heading", { name: "有什么想深入聊聊？" }).waitFor();
    await page.screenshot({
      path: "test-results/ai-desktop-empty.png",
      fullPage: true,
    });
    await page
      .getByRole("textbox", { name: "给 AI 发送消息" })
      .fill("解释上传合并的幂等处理。");
    await page.getByRole("button", { name: "发送消息", exact: true }).click();
    await page.locator(".ai-message-assistant .ai-message-actions").waitFor();
    assert.match(await page.locator(".ai-markdown").innerText(), /原子状态/);
    const url = page.url();
    await page.reload();
    await page.locator(".ai-message-assistant .ai-message-actions").waitFor();
    assert.equal(await page.locator(".ai-message-user").count(), 1);
    await page.screenshot({
      path: "test-results/ai-desktop-chat.png",
      fullPage: true,
    });
    await page.getByRole("link", { name: "生成练习", exact: true }).click();
    await page.getByLabel("练习什么").fill("上传幂等与异常恢复");
    await page
      .locator(".generation-form")
      .getByRole("button", { name: "生成练习", exact: true })
      .click();
    await page.locator(".generated-question").first().waitFor();
    await page.waitForFunction(
      () => document.querySelectorAll(".generated-question").length === 5,
    );
    assert.equal(await page.locator(".generated-question").count(), 5);
    await page
      .locator(".generated-question")
      .first()
      .getByRole("button", { name: "保存到我的题库" })
      .click();
    await page.waitForTimeout(600);
    await page.screenshot({
      path: "test-results/ai-generated.png",
      fullPage: true,
    });
    console.log(
      "Save notice:",
      await page.locator(".ai-error").allTextContents(),
    );
    await page
      .locator(".generated-question")
      .first()
      .getByRole("link", { name: "开始练习" })
      .waitFor();
    await page
      .locator(".generated-question")
      .first()
      .getByRole("link", { name: "开始练习" })
      .click();
    await page
      .locator("#response")
      .fill("服务端建立唯一任务，并通过原子状态变化取得执行权。");
    await page.getByRole("button", { name: "提交并查看解析" }).click();
    await page.locator(".answer-content").waitFor();
    await page.reload();
    await page.locator(".answer-content").waitFor();
    assert.match(await page.locator("#response").inputValue(), /唯一任务/);
    await page.getByRole("button", { name: "问 AI", exact: true }).click();
    await page
      .getByRole("dialog", { name: "题目 AI 助手", exact: true })
      .waitFor();
    assert.equal(await page.locator('#app').evaluate(el=>el.inert),true);
    assert.ok(page.url().includes("/practice"));
    await page
      .getByRole("textbox", { name: "给 AI 发送消息" })
      .fill("我不清楚服务端原子状态变化，请举个例子。");
    await page.getByRole("button", { name: "发送消息", exact: true }).click();
    await page.locator(".ai-message-assistant .ai-message-actions").waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: "test-results/ai-question-mobile.png",
      fullPage: false,
    });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    await page.getByRole("button", { name: "关闭 AI", exact: true }).click();
    assert.equal(await page.locator('#app').evaluate(el=>el.inert),false);
    assert.match(await page.locator("#response").inputValue(), /唯一任务/);
    await page.locator('.answer-content').evaluate(el=>{const range=document.createRange();range.selectNodeContents(el.querySelector('p')||el);const selected=window.getSelection();selected.removeAllRanges();selected.addRange(range);el.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));});
    await page.getByRole('button',{name:'引用选中内容',exact:true}).click();
    await page.locator('.ai-quote summary').click();
    assert.ok((await page.locator('.ai-quote blockquote').innerText()).length>20);
    await page.getByRole('button',{name:'关闭 AI',exact:true}).click();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(url);
    await page.locator(".ai-message-assistant").waitFor();
    for (const width of [1440, 1024, 768, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
      await page.screenshot({
        path: `test-results/ai-chat-${width}.png`,
        fullPage: true,
      });
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        `overflow at ${width}`,
      );
    }
    await page.getByRole("button", { name: "打开会话列表" }).click();
    await page.getByRole("dialog", { name: "会话列表" }).waitFor();
    await page.getByRole("button", { name: "关闭会话列表" }).click();
    await page.getByRole("button", { name: "保存笔记", exact: true }).click();
    await page.getByRole("button", { name: "已保存", exact: true }).waitFor();
    await page.getByRole("button", { name: "账号与额度" }).click();
    await page.getByRole("button", { name: "我的笔记", exact: true }).click();
    await page.getByRole("dialog", { name: "我的笔记" }).waitFor();
    await page.locator(".ai-saved-note summary").first().click();
    await page.getByRole("button", { name: "编辑", exact: true }).click();
    await page.getByLabel("笔记名称", { exact: true }).fill("我的幂等复习笔记");
    await page
      .getByLabel("笔记内容", { exact: true })
      .fill("用唯一任务和原子状态变化避免重复合并。");
    await page.getByRole("button", { name: "保存修改", exact: true }).click();
    await page.getByText("我的幂等复习笔记", { exact: true }).waitFor();
    await page.getByRole("button", { name: "关闭笔记" }).click();
    await page.goto(
      (process.env.AI_TEST_BASE || "http://127.0.0.1:5174") +
        "/quiz/#/ai?mode=interview",
    );
    await page
      .locator(".ai-interview-setup")
      .waitFor({ timeout: 5000 })
      .catch(async (e) => {
        console.log(
          "Interview state:",
          await page.evaluate(() => ({
            url: location.href,
            body: document.body.innerText.slice(-2500),
          })),
        );
        throw e;
      });
    await page
      .getByRole("textbox", { name: "给 AI 发送消息" })
      .fill("请开始前端模拟面试。");
    await page.getByRole("button", { name: "发送消息", exact: true }).click();
    await page
      .getByRole("button", { name: "结束并复盘", exact: true })
      .waitFor({ state: "visible", timeout: 5000 })
      .catch(async (e) => {
        console.log(
          "After send:",
          await page.evaluate(() => {
            const s = document
              .querySelector("#app")
              .__vue_app__.config.globalProperties.$pinia._s.get("ai");
            return {
              url: location.href,
              mode: s.current?.mode,
              sending: s.sending,
              active: s.active,
              checking: s.checking,
              error: s.error,
              body: document.body.innerText.slice(-1600),
            };
          }),
        );
        throw e;
      });
    await page.waitForFunction(
      () => !document.querySelector('button[aria-label="停止回复"]'),
    );
    await page
      .getByRole("textbox", { name: "给 AI 发送消息" })
      .fill("我会通过 AbortController 取消页面请求。");
    await page.getByRole("button", { name: "发送消息", exact: true }).click();
    await page.getByText("第 1 组 · 追问 1", { exact: true }).waitFor();
    await page.reload();
    await page.getByText('第 1 组 · 追问 1',{exact:true}).waitFor();
    await page
      .getByRole("textbox", { name: "给 AI 发送消息" })
      .fill("再用请求序号判断结果是否仍然有效。");
    await page.getByRole("button", { name: "结束并复盘", exact: true }).click();
    await page.getByText("本次模拟已结束", { exact: true }).waitFor();
    await page.locator(".report-answer").last().locator("summary").click();
    await page
      .locator(".report-original")
      .filter({ hasText: "再用请求序号判断结果是否仍然有效。" })
      .waitFor();
    if (
      !(await page
        .getByRole("button", { name: "退出登录", exact: true })
        .isVisible())
    )
      await page.getByRole("button", { name: "账号与额度" }).click();
    await page.getByRole("button", { name: "退出登录", exact: true }).click();
    await page.getByRole("button", { name: "登录", exact: true }).waitFor();
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        ok: true,
        checked: [
          "login",
          "chat",
          "refresh recovery",
          "generation",
          "save",
          "practice",
          "four widths",
          "mobile history",
          "saved notes",
          "interview recap",
          "logout",
        ],
        pageErrors: errors,
      }),
    );
    await context.close();
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
