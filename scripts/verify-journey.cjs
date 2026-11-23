const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const bank = require("../src/data/bank.json");
const base = process.env.QA_BASE || "http://127.0.0.1:5190/quiz/";
const live = process.env.QA_LIVE_AI === "1";
const results = [],
  content = [],
  runtimeErrors = [],
  browserDiagnostics = [];
let browser,
  page,
  personalPrompt,
  accountPhase = false,
  authenticated = false;
async function step(name, run) {
  if (accountPhase && !authenticated && !name.startsWith("login error")) {
    results.push({
      name,
      ok: false,
      error: "Skipped because sign-in did not complete",
    });
    console.log("SKIP " + name);
    return;
  }
  const start = Date.now();
  const diagnosticsStart = browserDiagnostics.length;
  try {
    await run();
    results.push({ name, ok: true, seconds: (Date.now() - start) / 1000 });
    console.log("PASS " + name);
  } catch (error) {
    results.push({
      name,
      ok: false,
      error: error.message,
      diagnostics: browserDiagnostics.slice(diagnosticsStart),
      alerts: await page
        ?.getByRole("alert")
        .allTextContents()
        .catch(() => []),
    });
    if (page)
      await page
        .screenshot({
          path: "test-results/journey/failure-" + results.length + ".png",
          fullPage: true,
        })
        .catch(() => {});
    console.log("FAIL " + name + ": " + error.message);
    await page?.keyboard.press("Escape").catch(() => {});
  }
}
async function noOverflow() {
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    "Document overflows horizontally",
  );
}
async function waitReply(count) {
  await page.waitForFunction(
    (n) =>
      document.querySelectorAll(".ai-message-assistant .ai-message-actions")
        .length >= n,
    count,
    { timeout: 120000 },
  );
  assert.equal(await page.locator(".ai-run-notice").count(), 0);
}
async function send(text) {
  const count = await page
    .locator(".ai-message-assistant .ai-message-actions")
    .count();
  await page.getByRole("textbox", { name: "给 AI 发送消息" }).fill(text);
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  await waitReply(count + 1);
}
function errorsFor(p) {
  p.on("pageerror", (e) => runtimeErrors.push(e.message));
  p.on("requestfailed", (request) => {
    browserDiagnostics.push({
      kind: "requestfailed",
      path: new URL(request.url()).pathname,
      method: request.method(),
      error: request.failure()?.errorText,
    });
  });
  p.on("response", (response) => {
    if (response.status() >= 400)
      browserDiagnostics.push({
        kind: "response",
        path: new URL(response.url()).pathname,
        status: response.status(),
      });
  });
}
(async () => {
  await fs.mkdir("test-results/journey", { recursive: true });
  browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.CHROME_PATH ||
      "C:/Program Files/Google/Chrome/Application/chrome.exe",
  });
  try {
    const guest = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    page = await guest.newPage();
    errorsFor(page);
    await step(
      "guest search, empty results, category and browser back",
      async () => {
        await page.goto(base);
        await page.locator(".daily-hero").waitFor();
        await page
          .locator(".side-nav")
          .getByRole("link", { name: "专题题库", exact: true })
          .click();
        await page.locator(".topic-tile").first().waitFor();
        assert.equal(await page.locator(".topic-tile").count(), 31);
        const search = page.getByRole("searchbox", { name: "搜索题目和解析" });
        await search.fill("Promise");
        await page.locator(".question-result").first().waitFor();
        await page.locator(".question-result").first().click();
        await page.locator(".question-prompt").waitFor();
        await page.goBack();
        assert.equal(await search.inputValue(), "Promise");
        await search.fill("不存在的术语xyz2026");
        await page
          .getByRole("button", { name: "清除筛选", exact: true })
          .click();
        assert.equal(await search.inputValue(), "");
        await page.getByRole("tab", { name: /追问练习/ }).click();
        await page.getByLabel("筛选分类").selectOption({ index: 1 });
        assert.equal(await page.locator(".oral-group").count(), 1);
      },
    );
    await step(
      "answer, reveal, note, bookmark, refresh and review",
      async () => {
        await page.goto(base + "#/practice?question=quiz:0:0");
        const q = bank.questions.find((q) => q.id === "quiz:0:0");
        assert.ok(
          await page
            .getByRole("button", { name: "提交并查看解析" })
            .isDisabled(),
        );
        await page
          .locator(".choice")
          .filter({ hasText: q.choices[q.correctAnswer] })
          .click();
        await page.getByRole("button", { name: "提交并查看解析" }).click();
        await page.getByText("回答正确", { exact: true }).waitFor();
        await page
          .getByRole("button", { name: "我的笔记", exact: true })
          .click();
        await page
          .locator("#practice-note")
          .fill("复习：用任务、微任务和渲染机会解释执行顺序。");
        await page
          .getByRole("button", { name: "收藏这题", exact: true })
          .click();
        await page.reload();
        await page
          .getByRole("button", { name: "已收藏", exact: true })
          .waitFor();
        await page
          .getByRole("button", { name: "我的笔记 · 已记录", exact: true })
          .click();
        assert.match(
          await page.locator("#practice-note").inputValue(),
          /渲染机会/,
        );
        await page.goto(base + "#/review?tab=bookmarks");
        await page.locator(".review-item").first().waitFor();
        assert.equal(await page.locator(".review-item").count(), 1);
      },
    );
    await step(
      "backup download, invalid import, cancel and restore",
      async () => {
        await page.goto(base + "#/profile");
        await page.locator(".goal-options button").last().click();
        const event = page.waitForEvent("download");
        await page
          .getByRole("button", { name: "导出学习备份", exact: true })
          .click();
        const download = await event;
        const payload = await fs.readFile(await download.path(), "utf8");
        assert.equal(JSON.parse(payload).progress.dailyGoal, 20);
        await page.getByLabel("选择学习备份文件").setInputFiles({
          name: "broken.json",
          mimeType: "application/json",
          buffer: Buffer.from("{broken"),
        });
        await page.getByRole("button", { name: "确认导入并替换" }).click();
        await page.locator(".backup-error").waitFor();
        assert.match(
          await page.locator(".goal-options .active").innerText(),
          /20/,
        );
        await page.getByRole("button", { name: "取消", exact: true }).click();
        assert.equal(await page.locator(".import-confirm").count(), 0);
        await page.getByLabel("选择学习备份文件").setInputFiles({
          name: "restore.json",
          mimeType: "application/json",
          buffer: Buffer.from(payload),
        });
        await page.getByRole("button", { name: "确认导入并替换" }).click();
        await page.locator(".backup-message").waitFor();
      },
    );
    await step("library-scoped search and install dialog", async () => {
      assert.equal(await page.locator(".topbar [role=search]").count(), 0);
      await page
        .locator(".side-nav")
        .getByRole("link", { name: "专题题库", exact: true })
        .click();
      await page
        .getByRole("searchbox", { name: "搜索题目和解析" })
        .fill("AbortController");
      await page.locator(".question-result").first().waitFor();
      await page
        .getByRole("button", { name: "添加到主屏幕", exact: true })
        .click();
      await page.locator(".install-dialog[open]").waitFor();
      await page.keyboard.press("Escape");
      assert.equal(await page.locator(".install-dialog[open]").count(), 0);
    });
    await guest.close();
    const account = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      permissions: ["clipboard-read", "clipboard-write"],
    });
    page = await account.newPage();
    errorsFor(page);
    accountPhase = true;
    await step(
      "login error, retry, real AI answer, rename and reload",
      async () => {
        await page.goto(base + "#/ai");
        await page.getByLabel("用户名", { exact: true }).fill("tester");
        await page
          .getByLabel("密码", { exact: true })
          .fill("incorrect-password");
        await page.getByRole("button", { name: "登录", exact: true }).click();
        await page
          .locator(".ai-login .ai-error")
          .filter({ hasText: "账号或密码不正确" })
          .waitFor();
        await page
          .getByLabel("密码", { exact: true })
          .fill("test-only-password");
        await page.getByRole("button", { name: "登录", exact: true }).click();
        await page
          .getByRole("heading", { name: "有什么想深入聊聊？" })
          .waitFor();
        authenticated = true;
        await send(
          "用120字解释 AbortController 和请求序号分别解决什么问题，给一个搜索框的例子。",
        );
        content.push({
          kind: "chat",
          text: await page.locator(".ai-message-assistant").first().innerText(),
        });
        await page
          .getByRole("button", { name: "复制", exact: true })
          .first()
          .click();
        assert.ok(
          (await page.evaluate(() => navigator.clipboard.readText())).length >
            30,
        );
        page.once("dialog", (dialog) => dialog.accept("异步请求复习"));
        await page.locator(".ai-history-row").first().hover();
        await page.getByRole("button", { name: "重命名会话" }).first().click();
        await page
          .locator(".ai-header>strong")
          .filter({ hasText: "异步请求复习" })
          .waitFor();
        await page.reload();
        await page.locator(".ai-message-assistant").waitFor();
        assert.equal(await page.locator(".ai-message-user").count(), 1);
      },
    );
    await step(
      "lost acknowledgement preserves the draft and reuses the accepted task after reload",
      async () => {
        await page
          .locator(".ai-header")
          .getByRole("button", { name: "新对话", exact: true })
          .click();
        const text = "用一句话解释请求幂等。";
        let originalTask;
        const pattern = "**/quiz/api/v1/conversations/*/messages";
        await page.route(pattern, async (route) => {
          const response = await route.fetch();
          originalTask = (await response.json()).id;
          await route.abort("failed");
        });
        await page.getByRole("textbox", { name: "给 AI 发送消息" }).fill(text);
        await page
          .getByRole("button", { name: "发送消息", exact: true })
          .click();
        await page
          .getByRole("alert")
          .filter({ hasText: "暂时无法连接服务，请检查网络后重试" })
          .waitFor();
        await page.waitForURL(/#\/ai\/[^?]+$/);
        assert.equal(
          await page
            .getByRole("textbox", { name: "给 AI 发送消息" })
            .inputValue(),
          text,
        );
        await page.unroute(pattern);
        await page.reload();
        await waitReply(1);
        assert.equal(
          await page
            .getByRole("textbox", { name: "给 AI 发送消息" })
            .inputValue(),
          text,
        );
        const retry = page.waitForResponse(
          (r) =>
            r.url().endsWith("/messages") && r.request().method() === "POST",
        );
        await page
          .getByRole("button", { name: "发送消息", exact: true })
          .click();
        assert.equal((await (await retry).json()).id, originalTask);
        assert.equal(await page.locator(".ai-message-user").count(), 1);
      },
    );
    await step("save, edit and reopen a conversation note", async () => {
      await page
        .getByRole("button", { name: "保存笔记", exact: true })
        .first()
        .click();
      await page.getByRole("button", { name: "已保存", exact: true }).waitFor();
      await page.getByRole("button", { name: "账号与额度" }).click();
      await page.getByRole("button", { name: "我的笔记", exact: true }).click();
      await page.locator(".ai-saved-note summary").first().click();
      await page.getByRole("button", { name: "编辑", exact: true }).click();
      await page.getByLabel("笔记名称", { exact: true }).fill("搜索竞态复习");
      await page
        .getByLabel("笔记内容", { exact: true })
        .fill("取消减少无用工作；请求序号校验阻止旧结果覆盖。");
      await page.getByRole("button", { name: "保存修改", exact: true }).click();
      await page.getByText("搜索竞态复习", { exact: true }).waitFor();
      await page.keyboard.press("Escape");
      assert.equal(
        await page.getByRole("dialog", { name: "我的笔记" }).count(),
        0,
      );
    });
    await step(
      "stop an AI reply without leaving a stuck composer",
      async () => {
        await page
          .locator(".ai-header")
          .getByRole("button", { name: "新对话", exact: true })
          .click();
        await page
          .getByRole("textbox", { name: "给 AI 发送消息" })
          .fill(
            "请详细讲解大文件分片上传的完整方案，包含重试、幂等、并发和恢复。",
          );
        await page
          .getByRole("button", { name: "发送消息", exact: true })
          .click();
        await page
          .getByRole("button", { name: "停止回复", exact: true })
          .click();
        await page.locator(".ai-run-notice").waitFor();
        assert.match(
          await page.locator(".ai-run-notice").innerText(),
          /已停止/,
        );
        await page
          .getByRole("button", { name: "发送消息", exact: true })
          .waitFor();
      },
    );
    await step(
      "question answer assessment and embedded panel recovery",
      async () => {
        await page.goto(base + "#/practice?question=oral:loop:0");
        await page
          .locator("#response")
          .fill(
            "设置 loading 只是更新状态，同步 JSON.parse 会占用主线程，使浏览器暂时没有渲染机会。大数据可以放 Worker 处理，分批的只能是可拆开的后续计算，不能把一次 JSON.parse 直接切片。",
          );
        await page.getByRole("button", { name: "提交并查看解析" }).click();
        await page
          .getByRole("button", { name: "点评回答", exact: true })
          .click();
        await page.getByRole("dialog", { name: "题目 AI 助手" }).waitFor();
        await page
          .getByRole("button", { name: "发送消息", exact: true })
          .click();
        await waitReply(1);
        assert.equal(await page.locator(".ai-assessment").count(), 1);
        content.push({
          kind: "assessment",
          text: await page.locator(".ai-message-assistant").innerText(),
        });
        const labels = await page
          .locator(".ai-assessment .ai-improvement>span")
          .allTextContents();
        assert.ok(
          labels.every((label) => label.trim() === "拓展"),
          "A sufficient causal explanation was marked as a required error or omission",
        );
        await page.keyboard.press("Escape");
        await page
          .getByRole("dialog", { name: "题目 AI 助手" })
          .waitFor({ state: "hidden" });
        assert.equal(
          await page.getByRole("dialog", { name: "题目 AI 助手" }).count(),
          0,
        );
        assert.match(
          await page.locator("#response").inputValue(),
          /不能把一次 JSON.parse/,
        );
      },
    );
    await step("AI assessment identifies a clear technical error", async () => {
      await page.goto(base + "#/practice?question=oral:loop:2");
      await page
        .locator("#response")
        .fill(
          "setTimeout 会自动把一次 JSON.parse 拆成多个可暂停的小段，Promise.then 也会自动在新线程计算，所以两种方式都不占主线程。",
        );
      await page.getByRole("button", { name: "提交并查看解析" }).click();
      await page.getByRole("button", { name: "点评回答", exact: true }).click();
      await page.getByRole("button", { name: "发送消息", exact: true }).click();
      await waitReply(1);
      const labels = await page
        .locator(".ai-assessment .ai-improvement>span")
        .allTextContents();
      assert.ok(
        labels.some((label) => label.trim() === "错误"),
        "A wrong thread/JSON.parse claim was not identified as an error",
      );
      content.push({
        kind: "assessment-incorrect",
        text: await page.locator(".ai-message-assistant").innerText(),
      });
      await page.keyboard.press("Escape");
      await page
        .getByRole("dialog", { name: "题目 AI 助手" })
        .waitFor({ state: "hidden" });
    });
    await step(
      "generate, inspect, save and practice personal questions",
      async () => {
        await page.goto(base + "#/generate");
        await page
          .getByLabel("练习什么")
          .fill(
            "围绕搜索请求的取消和请求序号校验生成场景题，说明完整条件并区分取消与忽略响应。",
          );
        await page.getByLabel("数量", { exact: true }).selectOption("2");
        await page.getByLabel("题型", { exact: true }).selectOption("oral");
        await page
          .locator(".generation-form")
          .getByRole("button", { name: "生成练习", exact: true })
          .click();
        await page.locator(".generation-progress").waitFor();
        await page.waitForFunction(
          () =>
            !document.querySelector(".generation-progress button") ||
            !document
              .querySelector(".generation-progress button")
              .textContent.includes("停止"),
          undefined,
          { timeout: 150000 },
        );
        await page
          .locator(".generated-question")
          .first()
          .waitFor({ timeout: 5000 });
        assert.equal(await page.locator(".generated-question").count(), 2);
        const generated = page.locator(".generated-question").first();
        personalPrompt = await generated.locator("h3").innerText();
        await generated.getByRole("button", { name: "查看解析" }).click();
        content.push({
          kind: "generated",
          text: await page.locator(".generated-question").allTextContents(),
        });
        assert.ok(
          await generated
            .getByRole("button", { name: "保存到我的题库" })
            .isEnabled(),
          "First question failed quality review",
        );
        await generated.getByRole("button", { name: "保存到我的题库" }).click();
        await generated.getByRole("link", { name: "开始练习" }).waitFor();
        await generated.getByRole("link", { name: "开始练习" }).click();
        await page
          .locator("#response")
          .fill("先取消不再需要的请求，再检查请求序号才提交结果。");
        await page.getByRole("button", { name: "提交并查看解析" }).click();
        await page.reload();
        await page.locator(".answer-content").waitFor();
        assert.match(await page.locator("#response").inputValue(), /请求序号/);
      },
    );
    await step(
      "maintainer review, publication, restore and saved private question",
      async () => {
        assert.ok(
          personalPrompt,
          "No generated question is available for review",
        );
        await page.goto(base + "#/admin");
        const candidate = page.locator(".admin-candidate").filter({
          has: page.getByRole("heading", {
            name: personalPrompt,
            exact: true,
          }),
        });
        await candidate
          .getByRole("button", { name: "修订内容", exact: true })
          .click();
        const editor = page.getByRole("dialog", {
          name: "修订题目",
          exact: true,
        });
        await editor.waitFor();
        assert.equal(
          await editor.evaluate((el) => el.contains(document.activeElement)),
          true,
        );
        await page.keyboard.press("Escape");
        await editor.waitFor({ state: "hidden" });
        await page
          .getByLabel("审核说明", { exact: true })
          .fill("核对题干、取消边界与结果身份校验，作为本次隔离验收内容。");
        await candidate
          .getByRole("button", { name: "审核通过", exact: true })
          .click();
        await page.getByText("审核结果已保存", { exact: true }).waitFor();
        await candidate.getByRole("checkbox").check();
        await page.getByRole("button", { name: /发布已选\s*1\s*题/ }).click();
        await page
          .getByText("内容已发布，客户端同步后即可使用", { exact: true })
          .waitFor();
        const release = page
          .locator(".admin-coverage")
          .filter({ hasText: "发布记录" });
        await release.locator("summary").click();
        await release
          .getByRole("button", { name: "恢复此版本内容", exact: true })
          .last()
          .click();
        await page.getByText("已发布所选版本的内容", { exact: true }).waitFor();
        await page.goto(base + "#/generate?tab=mine");
        const saved = page.locator(".generated-question").filter({
          has: page.getByRole("heading", {
            name: personalPrompt,
            exact: true,
          }),
        });
        await saved
          .getByRole("link", { name: "开始练习", exact: true })
          .click();
        await page.locator(".question-prompt").waitFor();
        assert.equal(
          await page.locator(".question-prompt").innerText(),
          personalPrompt,
        );
      },
    );
    await step(
      "AI interview, answer-driven continuation, reload and final recap",
      async () => {
        await page.goto(base + "#/ai?mode=interview");
        await page.getByLabel("主问题", { exact: true }).selectOption("2");
        await page
          .getByLabel("每题最多追问", { exact: true })
          .selectOption("1");
        await send("请围绕异步搜索请求的竞态和组件卸载提问。");
        await send(
          "我会在请求前创建 AbortController，发起新查询时取消旧请求，同时用递增序号检查响应是否仍是当前请求；卸载时取消页面持有的请求。",
        );
        await page.reload();
        await page.locator(".ai-question-step").last().waitFor();
        await page
          .getByRole("textbox", { name: "给 AI 发送消息" })
          .fill(
            "请求取消不代表服务端一定停止执行，客户端仍要忽略过期结果，并单独处理 AbortError。",
          );
        await page
          .getByRole("button", { name: "结束并复盘", exact: true })
          .click();
        await page
          .getByText("本次模拟已结束", { exact: true })
          .waitFor({ timeout: 150000 });
        assert.ok((await page.locator(".report-answer").count()) >= 2);
        content.push({
          kind: "interview-report",
          text: await page.locator(".interview-report").innerText(),
        });
      },
    );
    await step("phone dialogs, focus, scrolling and layout", async () => {
      await page.setViewportSize({ width: 390, height: 844 });
      await noOverflow();
      const trigger = page.getByRole("button", { name: "打开会话列表" });
      await trigger.click();
      const dialog = page.getByRole("dialog", { name: "会话列表" });
      await dialog.waitFor();
      assert.equal(
        await dialog.evaluate((el) => el.contains(document.activeElement)),
        true,
        "History dialog must receive focus",
      );
      for (let i = 0; i < 15; i++) await page.keyboard.press("Tab");
      assert.equal(
        await dialog.evaluate((el) => el.contains(document.activeElement)),
        true,
        "Tab escaped history dialog",
      );
      await page.keyboard.press("Escape");
      assert.equal(await dialog.count(), 0);
      assert.equal(
        await trigger.evaluate((el) => document.activeElement === el),
        true,
        "Focus was not restored",
      );
      for (const width of [320, 390, 768, 1440]) {
        await page.setViewportSize({ width, height: width < 500 ? 844 : 1000 });
        await noOverflow();
        await page.screenshot({
          path: `test-results/journey/ai-report-${width}.png`,
          fullPage: false,
        });
      }
    });
    await step(
      "logout removes private content from this browser session",
      async () => {
        if (
          !(await page
            .getByRole("button", { name: "退出登录", exact: true })
            .isVisible())
        )
          await page.getByRole("button", { name: "账号与额度" }).click();
        await page
          .getByRole("button", { name: "退出登录", exact: true })
          .click();
        await page.getByRole("button", { name: "登录", exact: true }).waitFor();
        assert.equal(await page.locator(".ai-message").count(), 0);
        await page.goto(base + "#/library");
        await page.locator(".topic-tile").first().waitFor();
        assert.match(await page.locator(".library-count").innerText(), /1011/);
      },
    );
    await account.close();
  } finally {
    if (browser) await browser.close();
    await fs.writeFile(
      "test-results/journey/results.json",
      JSON.stringify({ live, results, runtimeErrors }, null, 2),
    );
    await fs.writeFile(
      "test-results/journey/ai-content.json",
      JSON.stringify(content, null, 2),
    );
  }
  assert.equal(
    results.filter((r) => !r.ok).length,
    0,
    "Some realistic journeys failed; see test-results/journey/results.json",
  );
  assert.deepEqual(runtimeErrors, []);
  console.log(
    JSON.stringify({ ok: true, live, journeys: results.length, runtimeErrors }),
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
