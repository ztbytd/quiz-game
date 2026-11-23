// UI regressions use fresh browser contexts and intercept every API request.
// No credentials, server records, or paid model calls are used by this script.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const bank = JSON.parse(
  fs.readFileSync(path.join(root, "src/data/bank.json"), "utf8"),
);
const resultsPath = path.join(root, "test-results");
const site = new URL(process.env.BASE_URL || "http://127.0.0.1:5185/quiz/");
site.hash = "";
site.search = "";
if (!site.pathname.endsWith("/")) site.pathname += "/";
const url = (route) => site.href + "#" + route;
const chrome = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const executablePath =
  process.env.CHROME_PATH || (fs.existsSync(chrome) ? chrome : undefined);
const [weakQuestion, bookmarkedQuestion] = bank.questions.filter(
  (question) => question.kind === "oral" && question.id.startsWith("oral:"),
);

function routeQuery(href) {
  const hash = new URL(href, site).hash.slice(1);
  return new URL(hash, site.origin).searchParams;
}
async function valueIs(locator, expected) {
  await locator.waitFor({ state: "visible" });
  const deadline = Date.now() + 5000;
  while ((await locator.inputValue()) !== expected && Date.now() < deadline)
    await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(await locator.inputValue(), expected);
}
async function installFixture(page, state) {
  state.conversations ||= [];
  state.candidates ||= [];
  state.runs ||= [];
  state.unexpected = [];
  state.messages = [];
  state.generations = [];
  await page.route("**/*", async (route) => {
    const request = route.request();
    const endpoint = new URL(request.url()).pathname.match(
      /\/api\/v1(\/.*)$/,
    )?.[1];
    if (!endpoint) return route.continue();
    const method = request.method();
    let status = 200;
    let data;
    if (method === "GET" && endpoint === "/me")
      data = {
        user: {
          id: "ui-regression-fixture",
          username: "fixture",
          role: "learner",
        },
        enabled: true,
        csrf: "fixture-csrf",
      };
    else if (method === "GET" && endpoint === "/content/manifest")
      data = { release: "1", schemaVersion: 1, bank };
    else if (method === "GET" && endpoint === "/usage")
      data = { consumed: 0, reserved: 0, limit: 300000 };
    else if (method === "GET" && endpoint === "/conversations")
      data = { items: state.conversations };
    else if (method === "GET" && endpoint === "/my/questions")
      data = { items: state.candidates };
    else if (method === "GET" && endpoint === "/runs")
      data = { items: state.runs };
    else if (method === "GET" && endpoint === "/notes")
      data = {
        items: [
          {
            id: "fixture-note",
            title: "回归测试笔记",
            content: "只存在于当前隔离浏览器的测试内容。",
            version: 1,
          },
        ],
      };
    else if (
      method === "POST" &&
      endpoint === "/conversations" &&
      state.failMessages
    ) {
      const input = request.postDataJSON();
      data = {
        id: "fixture-failed-conversation",
        title: "发送失败测试",
        mode: input.mode || "chat",
        context: {},
        updated_at: new Date().toISOString(),
      };
      state.conversations.unshift(data);
    } else if (
      method === "GET" &&
      endpoint.startsWith("/conversations/") &&
      state.failMessages
    ) {
      const conversation = state.conversations.find(
        (item) => item.id === endpoint.split("/")[2],
      );
      assert.ok(
        conversation,
        "The fixture conversation must exist before it is opened",
      );
      data = { conversation, messages: [], runs: [] };
    } else if (
      method === "POST" &&
      /\/conversations\/[^/]+\/messages$/.test(endpoint) &&
      state.failMessages
    ) {
      state.messages.push(request.postDataJSON());
      status = 503;
      data = { error: "回归测试：模拟发送失败" };
    } else if (
      method === "POST" &&
      endpoint === "/generations" &&
      state.captureGenerations
    ) {
      state.generations.push(request.postDataJSON());
      status = 429;
      data = { error: "回归测试：已截获补题计划，未创建任务" };
    } else {
      state.unexpected.push({ method, endpoint });
      return route.abort("blockedbyclient");
    }
    return route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(data),
    });
  });
}

async function checkDrafts(page, state) {
  const input = () => page.getByRole("textbox", { name: "给 AI 发送消息" });
  const generalDraft = "独立 AI 对话尚未发送的草稿。";
  const panelDraft = "当前题目的普通追问草稿。";
  const quoteDraft = "仅属于引用段落入口的草稿。";
  await page.goto(url("/ai"));
  await input().fill(generalDraft);
  await page.goto(
    url("/practice?question=" + encodeURIComponent(weakQuestion.id)),
  );
  await page.getByRole("button", { name: "问 AI", exact: true }).click();
  await valueIs(input(), "");
  await input().fill(panelDraft);
  await page.getByRole("button", { name: "关闭 AI", exact: true }).click();
  // A real triple click selects the question text and exposes the quote action.
  await page.locator(".question-prompt").click({ clickCount: 3 });
  await page.getByRole("button", { name: "引用选中内容", exact: true }).click();
  await valueIs(input(), "请结合当前题目，解释我引用的这段内容。");
  await input().fill(quoteDraft);
  await page.getByRole("button", { name: "关闭 AI", exact: true }).click();
  await page.getByRole("button", { name: "问 AI", exact: true }).click();
  await valueIs(input(), panelDraft);
  await page.getByRole("button", { name: "关闭 AI", exact: true }).click();
  await page.goto(url("/ai"));
  await valueIs(input(), generalDraft);
  await page.goto(url("/ai?question=" + encodeURIComponent(weakQuestion.id)));
  await valueIs(input(), "");
  await input().fill("题目在独立 AI 页中的草稿。");
  await page.goto(url("/ai?mode=interview"));
  const interviewDraft = "模拟面试中还未发送的个人输入。";
  await input().fill(interviewDraft);
  await page.reload();
  await valueIs(input(), interviewDraft);
  await page.goto(url("/ai"));
  await valueIs(input(), generalDraft);

  state.failMessages = true;
  const unsent = "模拟服务失败时应保留这段尚未送达的回答。";
  await input().fill(unsent);
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  await page
    .getByRole("alert")
    .filter({ hasText: "回归测试：模拟发送失败" })
    .waitFor();
  await valueIs(input(), unsent);
  assert.equal(state.messages.length, 1);
  assert.equal(state.messages[0].text, unsent);
  await page.reload();
  await valueIs(input(), unsent);
}

async function checkWeakScope(page) {
  await page.goto(
    url("/practice?question=" + encodeURIComponent(weakQuestion.id)),
  );
  await page
    .locator("#response")
    .fill("我先记录当前理解，稍后重点补足实现细节和异常情况。");
  await page
    .getByRole("button", { name: "提交并查看解析", exact: true })
    .click();
  await page
    .locator(".self-grade")
    .getByRole("button", { name: "还需练习", exact: true })
    .click();
  await page.getByText("自评已记录", { exact: true }).waitFor();
  await page.goto(
    url("/practice?question=" + encodeURIComponent(bookmarkedQuestion.id)),
  );
  await page.getByRole("button", { name: "收藏这题", exact: true }).click();
  await page.getByRole("button", { name: "已收藏", exact: true }).waitFor();
  await page.goto(url("/review?tab=bookmarks"));
  await page
    .locator(".review-item h2")
    .filter({ hasText: bookmarkedQuestion.prompt })
    .waitFor();
  const verifyScope = async () => {
    const href = await page
      .getByRole("link", { name: "生成补练", exact: true })
      .getAttribute("href");
    const scope = routeQuery(href).get("scope");
    assert.ok(
      scope.includes(weakQuestion.prompt),
      "The plan must contain the independently marked weak question",
    );
    assert.ok(
      !scope.includes(bookmarkedQuestion.prompt),
      "A bookmark alone must not become weak evidence",
    );
  };
  await verifyScope();
  await page
    .getByRole("searchbox", { name: "搜索复习清单" })
    .fill("完全不匹配的回归搜索词");
  await page
    .getByRole("heading", { name: "没有匹配的问题", exact: true })
    .waitFor();
  await verifyScope();
  await page.locator('.review-tabs a[href*="tab=notes"]').click();
  await verifyScope();
}

async function checkGeneration(page, state) {
  const question = {
    kind: "oral",
    prompt: "请求结果乱序时怎样避免旧响应覆盖新状态？",
    explanation:
      "我会为请求分配递增序号，在写入数据、显示错误和结束加载时校验是否仍是当前请求，并取消不再需要的请求。",
    knowledgePoints: ["请求竞态"],
    angle: "场景",
    rubric: { required: ["校验请求序号"], alternatives: [], mistakes: [] },
  };
  const reviewed = {
    id: "fixture-reviewed",
    question,
    checks: [],
    review: "unreviewed",
    saved: false,
    version: 1,
    owner: "ui-regression-fixture",
  };
  const partial = { ...reviewed, id: "fixture-partial" };
  state.candidates = [reviewed, partial];
  const reviewedRun = {
    id: "fixture-run-reviewed",
    kind: "generate",
    status: "partially_succeeded",
    created_at: "2026-11-23T12:00:00.000Z",
    input: { scope: "请求竞态", count: 1, difficulty: "进阶", kind: "oral" },
    output: {
      requested: 1,
      candidates: [{ ...reviewed, checks: ["内容复核未完成"] }],
    },
  };
  const partialRun = {
    id: "fixture-run-partial",
    kind: "generate",
    status: "partially_succeeded",
    created_at: "2026-11-23T13:00:00.000Z",
    input: {
      scope: "组件卸载后的请求取消",
      count: 2,
      difficulty: "深入",
      kind: "oral",
    },
    output: { requested: 2, candidates: [partial] },
  };
  state.runs = [partialRun, reviewedRun];
  await page.goto(url("/generate?run=" + reviewedRun.id));
  await page.locator(".generation-progress").waitFor();
  assert.match(
    (await page.locator(".generation-progress").innerText()).replace(
      /\s+/g,
      "",
    ),
    /已生成1道候选题，1道通过检查，目标1道/,
  );
  assert.equal(
    await page.getByRole("button", { name: /^补足/ }).count(),
    0,
    "Completed checks must not prompt duplicate paid supplementation",
  );
  assert.equal(
    await page
      .getByRole("button", { name: "保存到我的题库", exact: true })
      .isEnabled(),
    true,
  );
  await page
    .getByRole("textbox", { name: "练习什么" })
    .fill("另外一份尚未生成的表单草稿");
  await page
    .locator(".generation-history summary")
    .filter({ hasText: "生成任务记录" })
    .click();
  await page
    .locator(".generation-history button")
    .filter({ hasText: "2026-11-23 13:00" })
    .click();
  await valueIs(
    page.getByRole("textbox", { name: "练习什么" }),
    partialRun.input.scope,
  );
  await valueIs(
    page.locator(".generation-options select").first(),
    partialRun.input.difficulty,
  );
  await page
    .getByRole("textbox", { name: "练习什么" })
    .fill("与原任务不同的新草稿范围");
  await page.locator(".generation-options select").first().selectOption("基础");
  state.captureGenerations = true;
  await page.getByRole("button", { name: "补足 1 道", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "已截获补题计划" }).waitFor();
  assert.equal(state.generations.length, 1);
  const plan = state.generations[0];
  assert.equal(plan.scope, partialRun.input.scope);
  assert.equal(plan.count, 1);
  assert.equal(plan.difficulty, partialRun.input.difficulty);
  assert.equal(plan.kind, partialRun.input.kind);
}

async function checkDialogs(page, state) {
  state.step = "initial-ai";
  await page.goto(url("/ai?question=" + encodeURIComponent(weakQuestion.id)));
  await page.getByRole("textbox", { name: "给 AI 发送消息" }).waitFor();
  await page.getByRole("button", { name: "打开会话列表" }).click();
  const history = page.getByRole("dialog", { name: "会话列表", exact: true });
  await history.waitFor();
  assert.equal(
    await history.evaluate((element) =>
      element.contains(document.activeElement),
    ),
    true,
  );
  await history.getByRole("textbox", { name: "搜索会话" }).focus();
  await page.keyboard.press("Tab");
  assert.equal(
    await page.evaluate(() =>
      document.activeElement.getAttribute("aria-label"),
    ),
    "关闭会话列表",
  );
  await page.keyboard.press("Shift+Tab");
  assert.equal(
    await page.evaluate(() =>
      document.activeElement.getAttribute("aria-label"),
    ),
    "搜索会话",
  );
  const scrollBefore = await page.evaluate(() => scrollY);
  await page.mouse.move(384, 400);
  await page.mouse.wheel(0, 600);
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(() => scrollY), scrollBefore);
  assert.equal(
    await page.evaluate(() => document.body.style.overflow),
    "hidden",
  );
  await page.keyboard.press("Escape");
  await history.waitFor({ state: "hidden" });
  assert.equal(
    await page.evaluate(() =>
      document.activeElement.getAttribute("aria-label"),
    ),
    "打开会话列表",
  );
  assert.equal(await page.evaluate(() => document.body.style.overflow), "");
  await page.getByRole("button", { name: "关联题目", exact: true }).click();
  const material = page.getByRole("dialog", { name: "关联题目", exact: true });
  await material.waitFor();
  assert.equal(
    await material.evaluate((element) =>
      element.contains(document.activeElement),
    ),
    true,
  );
  await material.getByRole("link", { name: "返回练习", exact: true }).focus();
  await page.keyboard.press("Tab");
  assert.equal(
    await page.evaluate(() =>
      document.activeElement.getAttribute("aria-label"),
    ),
    "关闭题目",
  );
  await page.keyboard.press("Escape");
  await material.waitFor({ state: "hidden" });
  assert.equal(
    await page.evaluate(() => document.activeElement.textContent.trim()),
    "关联题目",
  );
  await page.getByRole("button", { name: "账号与额度" }).click();
  await page.getByRole("button", { name: "我的笔记", exact: true }).click();
  const notes = page.getByRole("dialog", { name: "我的笔记", exact: true });
  await notes.waitFor();
  assert.equal(
    await notes.evaluate((element) => element.contains(document.activeElement)),
    true,
  );
  await page.keyboard.press("Escape");
  await notes.waitFor({ state: "hidden" });
  assert.equal(
    await page.evaluate(() => document.activeElement.textContent.trim()),
    "我的笔记",
  );

  await page.goto(
    url("/practice?question=" + encodeURIComponent(weakQuestion.id)),
  );
  state.step = "first-embedded-ai";
  await page.getByRole("button", { name: "问 AI", exact: true }).click();
  await page.getByRole("textbox", { name: "给 AI 发送消息" }).waitFor();
  await page.getByRole("button", { name: "当前题目", exact: true }).click();
  await material.waitFor();
  await page.keyboard.press("Escape");
  await material.waitFor({ state: "hidden" });
  assert.equal(await page.locator(".practice-ai-dialog").isVisible(), true);
  assert.equal(
    await page.evaluate(() => document.body.style.overflow),
    "hidden",
  );
  await page.keyboard.press("Escape");
  await page.locator(".practice-ai-dialog").waitFor({ state: "hidden" });
  assert.equal(await page.evaluate(() => document.body.style.overflow), "");
  assert.equal(
    await page.locator("#app").evaluate((element) => element.inert),
    false,
  );
  state.step = "second-embedded-ai";
  await page.getByRole("button", { name: "问 AI", exact: true }).click();
  await page.getByRole("textbox", { name: "给 AI 发送消息" }).waitFor();
  await page.getByRole("button", { name: "当前题目", exact: true }).click();
  await material.waitFor();
  await page.goto(url("/library"));
  await page.getByRole("heading", { name: "专题题库", exact: true }).waitFor();
  assert.equal(await page.evaluate(() => document.body.style.overflow), "");
  assert.equal(
    await page.locator("#app").evaluate((element) => element.inert),
    false,
  );
}

async function checkPagination(page) {
  await page.goto(url("/library"));
  await page.getByRole("searchbox", { name: "搜索题目和解析" }).fill("请求");
  const pagination = page.getByRole("navigation", { name: "搜索结果分页" });
  await pagination.waitFor();
  await pagination.getByRole("button", { name: "下一页", exact: true }).click();
  await page.waitForFunction(
    () => new URLSearchParams(location.hash.split("?")[1]).get("page") === "2",
  );
  const links = await page
    .locator(".question-result")
    .evaluateAll((elements) =>
      elements.map((element) => element.getAttribute("href")),
    );
  assert.ok(links.length, "Page two must contain search results");
  await page.locator(".question-result").first().click();
  await page.locator(".question-panel").waitFor();
  await page.goBack();
  await pagination.waitFor();
  assert.equal(routeQuery(page.url()).get("page"), "2");
  assert.match(await pagination.innerText(), /2\s*\//);
  assert.deepEqual(
    await page
      .locator(".question-result")
      .evaluateAll((elements) =>
        elements.map((element) => element.getAttribute("href")),
      ),
    links,
  );
  await page.reload();
  await pagination.waitFor();
  assert.equal(routeQuery(page.url()).get("page"), "2");
  assert.deepEqual(
    await page
      .locator(".question-result")
      .evaluateAll((elements) =>
        elements.map((element) => element.getAttribute("href")),
      ),
    links,
  );
}

(async () => {
  fs.mkdirSync(resultsPath, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath });
  const results = [];
  try {
    for (const test of [
      { name: "draft-isolation-and-failed-send", run: checkDrafts },
      {
        name: "weak-evidence-independent-of-tab-and-search",
        run: checkWeakScope,
      },
      {
        name: "generation-latest-review-and-original-plan",
        run: checkGeneration,
      },
      {
        name: "modal-keyboard-focus-and-nesting",
        run: checkDialogs,
        viewport: { width: 390, height: 844 },
      },
      { name: "library-pagination-back-and-refresh", run: checkPagination },
    ]) {
      const context = await browser.newContext({
        viewport: test.viewport || { width: 1440, height: 1000 },
        serviceWorkers: "block",
      });
      const page = await context.newPage();
      page.setDefaultTimeout(15000);
      const state = {};
      const pageErrors = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));
      await installFixture(page, state);
      try {
        await test.run(page, state);
        assert.deepEqual(
          state.unexpected,
          [],
          "Unrecognized API traffic is blocked by the fixture",
        );
        assert.deepEqual(
          pageErrors,
          [],
          "The page must not raise uncaught exceptions",
        );
        results.push({ name: test.name, ok: true });
      } catch (error) {
        await page
          .screenshot({
            path: path.join(
              resultsPath,
              "ui-regressions-" + test.name + "-failure.png",
            ),
            fullPage: true,
          })
          .catch(() => {});
        results.push({
          name: test.name,
          ok: false,
          error: error.message,
          step: state.step,
          page: await page
            .evaluate(() => ({
              url: location.href,
              scrollY,
              body: document.body.innerText.slice(-1800),
              openDialogs: document.querySelectorAll("dialog[open]").length,
              overflow: document.body.style.overflow,
            }))
            .catch(() => null),
          unexpected: state.unexpected,
          pageErrors,
        });
        process.exitCode = 1;
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
  const report = {
    ok: results.every((result) => result.ok),
    base: site.href,
    mockedApi: true,
    results,
  };
  fs.writeFileSync(
    path.join(resultsPath, "ui-regressions.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
