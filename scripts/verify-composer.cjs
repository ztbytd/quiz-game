// Every API is intercepted in fresh browser storage. No real writes or model calls.
const { chromium, webkit } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const bank = JSON.parse(
  fs.readFileSync(path.join(root, "src/data/bank.json"), "utf8"),
);
const site = new URL(process.env.BASE_URL || "http://127.0.0.1:5185/quiz/");
site.hash = "";
site.search = "";
if (!site.pathname.endsWith("/")) site.pathname += "/";
const url = (route) => site.href + "#" + route;
const engine = process.argv.includes("--webkit") ? "webkit" : "chromium";
const output = path.join(root, "test-results", "composer");
const editor = (page) =>
  page.getByRole("textbox", { name: "给 AI 发送消息", exact: true });
const paragraph =
  "请从执行顺序、事件循环、任务调度和异常处理解释这个 JavaScript 场景。".repeat(
    24,
  );
const multiline = Array.from(
  { length: 18 },
  (_, index) =>
    `第${index + 1}行：请解释事件循环、微任务、渲染和网络请求之间的关系。`,
).join("\n");
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function snapshot(page) {
  return editor(page).evaluate((element) => ({
    valueLength: element.value.length,
    height: element.getBoundingClientRect().height,
    inlineHeight: element.style.height,
    scrollHeight: element.scrollHeight,
    route: location.hash,
  }));
}
async function heightIs(page, predicate, message) {
  const deadline = Date.now() + 2500;
  let actual;
  do {
    actual = await snapshot(page);
    if (predicate(actual.height)) return actual;
    await pause(25);
  } while (Date.now() < deadline);
  assert.ok(predicate(actual.height), `${message}: ${JSON.stringify(actual)}`);
}
async function collapsed(page, baseline) {
  assert.equal(await editor(page).inputValue(), "");
  return heightIs(
    page,
    (height) => Math.abs(height - baseline.height) <= 2,
    "Empty editor must return to its initial height",
  );
}
async function expanded(page) {
  return heightIs(
    page,
    (height) => height >= 175 && height <= 181,
    "Long text must grow to the existing height limit",
  );
}
async function valueIs(page, expected) {
  await editor(page).waitFor();
  const deadline = Date.now() + 5000;
  while (
    (await editor(page).inputValue()) !== expected &&
    Date.now() < deadline
  )
    await pause(25);
  assert.equal(await editor(page).inputValue(), expected);
}
async function enter(page) {
  await page.goto(url("/ai"));
  // This UI appears only after the fixture identity and learning storage agree.
  await editor(page).waitFor();
  return snapshot(page);
}
async function installFixture(page) {
  const state = {
    conversations: [],
    messages: [],
    runs: [],
    accepted: 0,
    attempts: 0,
    failed: 0,
    unexpected: [],
    errors: [],
    measurements: [],
  };
  for (const id of ["composer-long", "composer-short"])
    state.conversations.push({
      id,
      title: id,
      mode: "chat",
      context: {},
      updated_at: "2026-11-24T00:00:00.000Z",
    });
  page.on("pageerror", (error) => state.errors.push(error.message));
  await page.route("**/*", async (route) => {
    const request = route.request(),
      method = request.method();
    const pathname = new URL(request.url()).pathname;
    const endpoint = pathname.match(/\/api\/v1(\/.*)$/)?.[1];
    if (!endpoint && ["GET", "HEAD"].includes(method)) return route.continue();
    let data,
      status = 200;
    if (method === "GET" && endpoint === "/me")
      data = {
        user: {
          id: "composer-fixture",
          username: "composer_fixture",
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
    else if (
      method === "GET" &&
      ["/my/questions", "/runs", "/notes"].includes(endpoint)
    )
      data = { items: [] };
    else if (method === "POST" && endpoint === "/conversations") {
      data = {
        id: `composer-new-${state.conversations.length}`,
        title: "输入框高度回归",
        mode: "chat",
        context: request.postDataJSON(),
        updated_at: new Date().toISOString(),
      };
      state.conversations.push(data);
    } else if (
      method === "POST" &&
      /^\/conversations\/[^/]+\/messages$/.test(endpoint)
    ) {
      state.attempts++;
      if (state.failNext) {
        state.failNext = false;
        state.failed++;
        status = 503;
        data = { error: "回归夹具：模拟发送失败，保留原文。" };
      } else {
        const id = endpoint.split("/")[2],
          input = request.postDataJSON();
        const runId = `composer-run-${++state.accepted}`;
        state.messages.push({
          id: `user-${state.accepted}`,
          conversation_id: id,
          role: "user",
          text: input.text,
        });
        state.messages.push({
          id: `assistant-${state.accepted}`,
          conversation_id: id,
          role: "assistant",
          runId,
          text: "隔离测试回复。",
        });
        data = {
          id: runId,
          conversation_id: id,
          kind: "chat",
          status: "succeeded",
          output: { text: "隔离测试回复。" },
          created_at: new Date().toISOString(),
        };
        state.runs.push(data);
        await pause([0, 100, 300][(state.accepted - 1) % 3]);
      }
    } else if (method === "GET" && /^\/conversations\/[^/]+$/.test(endpoint)) {
      const id = endpoint.split("/")[2];
      const conversation = state.conversations.find((item) => item.id === id);
      assert.ok(conversation, "The fixture only opens known conversations");
      data = {
        conversation,
        messages: state.messages.filter((item) => item.conversation_id === id),
        runs: state.runs
          .filter((item) => item.conversation_id === id)
          .toReversed(),
      };
    } else {
      state.unexpected.push({ method, endpoint: endpoint || pathname });
      return route.abort("blockedbyclient");
    }
    return route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(data),
    });
  });
  return state;
}
async function send(page, state, method) {
  const expected = state.accepted + 1;
  if (method === "button")
    await page.getByRole("button", { name: "发送消息", exact: true }).click();
  else {
    await editor(page).focus();
    await page.keyboard.press("Control+Enter");
  }
  const deadline = Date.now() + 5000;
  while (state.accepted < expected && Date.now() < deadline) await pause(25);
  assert.equal(state.accepted, expected);
  // Seeing the user message ensures the send response was applied; a draft-key
  // change may clear the textarea earlier while the request is still pending.
  await page
    .locator(".ai-message-user")
    .nth(expected - 1)
    .waitFor();
  await valueIs(page, "");
  await page.waitForURL(/#\/ai\/composer-new-/);
}

async function checkRepeatedSend(page, state) {
  const baseline = await enter(page);
  for (let index = 0; index < 6; index++) {
    const kind = ["paragraph", "multiline", "incremental-mixed"][index % 3];
    if (kind === "incremental-mixed") {
      await editor(page).focus();
      for (let offset = 0; offset < paragraph.length; offset += 120)
        await page.keyboard.insertText(paragraph.slice(offset, offset + 120));
    } else
      await editor(page).fill(kind === "multiline" ? multiline : paragraph);
    const before = await expanded(page);
    const method = index % 2 ? "ctrl-enter" : "button";
    await send(page, state, method);
    const after = await collapsed(page, baseline);
    await pause(100);
    const settled = await collapsed(page, baseline);
    state.measurements.push({
      round: index + 1,
      kind,
      method,
      before,
      after,
      settled,
    });
  }
  assert.equal(state.accepted, 6);
}
async function checkClearAndFailure(page, state) {
  const baseline = await enter(page);
  await editor(page).fill(multiline);
  await expanded(page);
  await editor(page).focus();
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Backspace");
  state.measurements.push({ cleared: await collapsed(page, baseline) });
  await editor(page).fill(paragraph);
  const before = await expanded(page);
  state.failNext = true;
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "模拟发送失败" }).waitFor();
  await valueIs(page, paragraph);
  const after = await expanded(page);
  assert.equal(state.failed, 1);
  assert.equal(state.accepted, 0);
  assert.ok(Math.abs(before.height - after.height) <= 2);
  state.measurements.push({ failedBefore: before, failedAfter: after });
}
async function checkDraftMount(page, state) {
  await enter(page);
  await editor(page).fill(multiline);
  const before = await expanded(page);
  await page.goto(url("/"));
  await page.locator(".daily-hero").waitFor();
  await page.goto(url("/ai"));
  await valueIs(page, multiline);
  const returned = await expanded(page);
  await page.reload();
  await valueIs(page, multiline);
  const reloaded = await expanded(page);
  assert.ok(Math.abs(before.height - returned.height) <= 2);
  assert.ok(Math.abs(before.height - reloaded.height) <= 2);
  state.measurements.push({ before, returned, reloaded });
  assert.equal(state.attempts, 0);
}
async function checkConversationDrafts(page, state) {
  const baseline = await enter(page);
  await page.evaluate(
    ({ long, short }) => {
      localStorage.setItem(
        "zhixu-ai-draft:composer-fixture:composer-long",
        long,
      );
      localStorage.setItem(
        "zhixu-ai-draft:composer-fixture:composer-short",
        short,
      );
    },
    { long: paragraph, short: "一个短问题" },
  );
  await page.goto(url("/ai/composer-long"));
  await valueIs(page, paragraph);
  const long = await expanded(page);
  await page.goto(url("/ai/composer-short"));
  await valueIs(page, "一个短问题");
  const short = await heightIs(
    page,
    (height) => Math.abs(height - baseline.height) <= 2,
    "Switching to a short draft must shrink the editor",
  );
  await page.goto(url("/ai/composer-long"));
  await valueIs(page, paragraph);
  const restored = await expanded(page);
  await page
    .getByRole("button", { name: "新对话", exact: true })
    .first()
    .click();
  await page.waitForURL(/#\/ai$/);
  await valueIs(page, "");
  const fresh = await collapsed(page, baseline);
  state.measurements.push({ long, short, restored, fresh });
  assert.equal(state.attempts, 0);
}

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const chrome = "C:/Program Files/Google/Chrome/Application/chrome.exe";
  const executablePath =
    process.env.CHROME_PATH || (fs.existsSync(chrome) ? chrome : undefined);
  const browser = await (engine === "webkit" ? webkit : chromium).launch({
    headless: true,
    ...(engine === "chromium" ? { executablePath } : {}),
  });
  const results = [];
  try {
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 1440, height: 1000 },
    ]) {
      for (const test of [
        { name: "repeated-long-send-collapses", run: checkRepeatedSend },
        { name: "delete-empty-and-failed-send", run: checkClearAndFailure },
        { name: "long-draft-return-and-reload", run: checkDraftMount },
        {
          name: "conversation-drafts-and-fresh-chat",
          run: checkConversationDrafts,
        },
      ]) {
        const context = await browser.newContext({
          viewport,
          isMobile: viewport.width < 700,
          hasTouch: viewport.width < 700,
          serviceWorkers: "block",
        });
        const page = await context.newPage();
        page.setDefaultTimeout(15000);
        const state = await installFixture(page);
        try {
          await test.run(page, state);
          assert.deepEqual(state.unexpected, []);
          assert.deepEqual(state.errors, []);
          assert.ok(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth + 1,
            ),
          );
          results.push({
            width: viewport.width,
            name: test.name,
            ok: true,
            accepted: state.accepted,
            measurements: state.measurements,
          });
          console.log(`PASS composer ${engine} ${viewport.width} ${test.name}`);
        } catch (error) {
          const screenshot = path.join(
            output,
            `${engine}-${viewport.width}-${test.name}-failure.png`,
          );
          await page.screenshot({ path: screenshot }).catch(() => {});
          results.push({
            width: viewport.width,
            name: test.name,
            ok: false,
            error: error.message,
            accepted: state.accepted,
            measurements: state.measurements,
            unexpected: state.unexpected,
            pageErrors: state.errors,
            screenshot,
            editor: await snapshot(page).catch(() => null),
          });
          console.log(
            `FAIL composer ${engine} ${viewport.width} ${test.name}: ${error.message}`,
          );
          process.exitCode = 1;
        } finally {
          await context.close();
        }
      }
    }
  } finally {
    await browser.close();
  }
  const report = {
    ok: results.every((result) => result.ok),
    base: site.href,
    browser: engine,
    mockedApi: true,
    realAccountWrites: 0,
    modelCalls: 0,
    results,
  };
  fs.writeFileSync(
    path.join(output, `results-${engine}.json`),
    JSON.stringify(report, null, 2),
  );
  console.log(
    JSON.stringify({
      ...report,
      results: results.map(({ measurements, ...result }) => result),
    }),
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
