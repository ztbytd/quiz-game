// Layout checks use isolated storage and intercept every API. No real writes or AI calls.
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
const useWebKit = process.argv.includes("--webkit");
const engineName = useWebKit ? "webkit" : "chromium";
const output = path.join(root, "test-results", "layout");
const question = bank.questions.find((item) => item.id === "quiz:0:0");
const viewports = [
  { width: 320, height: 568 },
  { width: 390, height: 568 },
  { width: 390, height: 844 },
  { width: 768, height: 1000 },
  { width: 1440, height: 1000 },
];
const conversation = (id, context = {}) => ({
  id,
  title: "布局回归的合成会话",
  mode: "chat",
  context,
  updated_at: "2026-11-24T00:00:00.000Z",
});
const conversations = [
  conversation("layout-long"),
  conversation("layout-embedded", {
    question: { id: question.id, version: question.version || 1 },
  }),
];
const messages = Array.from({ length: 24 }, (_, index) => ({
  id: "layout-message-" + index,
  role: index % 2 ? "assistant" : "user",
  kind: "chat",
  text: (index % 2
    ? "这一段解释事件循环、任务与微任务，以及浏览器的绘制机会。"
    : "请解释一个与浏览器相关的场景。"
  ).repeat(index % 2 ? 8 : 1),
}));

async function installFixture(page, authenticated) {
  const state = { unexpected: [], errors: [] };
  page.on("pageerror", (error) => state.errors.push(error.message));
  await page.route("**/*", async (route) => {
    const request = route.request();
    const method = request.method();
    const pathname = new URL(request.url()).pathname;
    const endpoint = pathname.match(/\/api\/v1(\/.*)$/)?.[1];
    if (!endpoint && ["GET", "HEAD"].includes(method)) return route.continue();
    if (method !== "GET" && method !== "HEAD") {
      state.unexpected.push({ method, endpoint: endpoint || pathname });
      return route.abort("blockedbyclient");
    }
    let data,
      status = 200;
    if (endpoint === "/me") {
      status = authenticated ? 200 : 401;
      data = authenticated
        ? {
            user: { id: "layout-fixture", username: "layout", role: "learner" },
            enabled: true,
            csrf: "layout-csrf",
          }
        : { error: "请先登录 AI 学习空间" };
    } else if (endpoint === "/content/manifest")
      data = { release: "1", schemaVersion: 1, bank };
    else if (endpoint === "/usage")
      data = { consumed: 0, reserved: 0, limit: 300000 };
    else if (endpoint === "/conversations") data = { items: conversations };
    else if (["/my/questions", "/runs", "/notes"].includes(endpoint))
      data = { items: [] };
    else if (/^\/conversations\/[^/]+$/.test(endpoint || "")) {
      const item = conversations.find(
        (entry) => entry.id === endpoint.split("/")[2],
      );
      assert.ok(item, "Only synthetic conversations may be opened");
      data = { conversation: item, messages, runs: [] };
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
async function settle(page) {
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
}
async function frameMetrics(page) {
  return page.evaluate(() => {
    const rect = (element) => {
      if (!element) return null;
      const value = element.getBoundingClientRect();
      return {
        top: value.top,
        bottom: value.bottom,
        left: value.left,
        right: value.right,
        width: value.width,
        height: value.height,
      };
    };
    const nav = document.querySelector(".bottom-nav");
    const navVisible =
      !!nav?.checkVisibility() && nav.getBoundingClientRect().height > 0;
    const frame = document.querySelector(".ai-page");
    const area = frame?.querySelector(".ai-composer-area");
    const scrolling = document.scrollingElement;
    return {
      viewport: { width: innerWidth, height: innerHeight },
      document: {
        width: scrolling.scrollWidth,
        height: scrolling.scrollHeight,
        clientHeight: scrolling.clientHeight,
        scrollY,
      },
      frame: rect(frame),
      nav: navVisible ? rect(nav) : null,
      composerArea: rect(area),
      send: rect(frame?.querySelector(".ai-send")),
      emptyParagraphs: area
        ? [...area.querySelectorAll("p")].filter(
            (element) =>
              element.checkVisibility() &&
              !element.textContent.trim() &&
              element.getBoundingClientRect().height > 1,
          ).length
        : 0,
    };
  });
}
async function assertFrame(page, { composer = true } = {}) {
  await settle(page);
  const metrics = await frameMetrics(page);
  assert.ok(metrics.frame, "AI frame is present");
  assert.ok(
    metrics.document.height <= metrics.viewport.height + 1,
    "The AI document must not scroll beyond the viewport: " +
      JSON.stringify(metrics),
  );
  assert.ok(
    metrics.document.width <= metrics.viewport.width + 1,
    "No horizontal document overflow",
  );
  assert.ok(Math.abs(metrics.document.scrollY) <= 1, "Window stays at the top");
  assert.ok(
    Math.abs(metrics.frame.top) <= 1,
    "AI frame begins at the viewport top",
  );
  const boundary = metrics.nav ? metrics.nav.top : metrics.viewport.height;
  assert.ok(
    Math.abs(metrics.frame.bottom - boundary) <= 1,
    "AI frame must touch the navigation or viewport boundary: " +
      JSON.stringify(metrics),
  );
  if (metrics.nav)
    assert.ok(
      Math.abs(metrics.nav.bottom - metrics.viewport.height) <= 1,
      "Navigation ends at the viewport bottom",
    );
  if (composer) {
    assert.ok(
      metrics.composerArea && metrics.send,
      "Composer and send control are visible",
    );
    assert.ok(
      Math.abs(metrics.composerArea.bottom - metrics.frame.bottom) <= 1,
      "Composer area ends with the AI frame",
    );
    assert.ok(
      metrics.send.top >= metrics.frame.top - 1 &&
        metrics.send.bottom <= boundary + 1,
      "Send control is not below navigation",
    );
    assert.equal(
      metrics.emptyParagraphs,
      0,
      "Empty paragraphs must not create bottom padding",
    );
  }
  return metrics;
}
async function assertInternalScroll(page, selector, requireOverflow = false) {
  const before = await page.evaluate(() => scrollY);
  const result = await page.locator(selector).evaluate((element) => {
    const overflow = element.scrollHeight - element.clientHeight;
    element.scrollTop = overflow > 1 ? Math.min(240, overflow) : 0;
    return {
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      overflow,
      scrollTop: element.scrollTop,
    };
  });
  if (requireOverflow)
    assert.ok(
      result.overflow > 1,
      "Long content must scroll inside " + selector,
    );
  if (result.overflow > 1)
    assert.ok(result.scrollTop > 0, "Internal scrolling remains functional");
  assert.equal(
    await page.evaluate(() => scrollY),
    before,
    "Scrolling content does not move the document",
  );
  return result;
}
async function capture(page, name) {
  const file = path.join(output, `${engineName}-${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  return file;
}
async function checkPractice(page) {
  await page.goto(url("/practice?mode=mock"));
  const intro = page.locator(".mock-intro");
  await intro.waitFor();
  const metrics = await intro.evaluate((element) => {
    const button = element.querySelector("a").getBoundingClientRect();
    const notice = element
      .querySelector(".mock-notice")
      .getBoundingClientRect();
    return {
      gap: notice.top - button.bottom,
      linkRight: button.right,
      blockRight: element.getBoundingClientRect().right,
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: innerWidth,
    };
  });
  assert.ok(metrics.gap >= 12, "Mock entry and notice have a visible gap");
  assert.ok(
    metrics.linkRight <= metrics.blockRight + 1,
    "Mock entry fits its block",
  );
  assert.ok(
    metrics.documentWidth <= metrics.viewportWidth + 1,
    "Mock page does not overflow horizontally",
  );
  await page.goto(url("/practice?question=" + encodeURIComponent(question.id)));
  await page.locator(".question-prompt").waitFor();
  assert.equal(
    await page.locator(".mock-intro").count(),
    0,
    "Normal practice does not add a mock block",
  );
  return metrics;
}
async function checkEmpty(page, viewport) {
  await page.goto(url("/ai"));
  await page.locator(".ai-welcome").waitFor();
  const metrics = await assertFrame(page);
  const transcript = await assertInternalScroll(page, ".ai-transcript");
  if (viewport.height >= 844)
    assert.ok(
      transcript.overflow <= 1,
      "A roomy empty screen has no pointless inner scrolling",
    );
  await page
    .getByRole("textbox", { name: "给 AI 发送消息", exact: true })
    .focus();
  await settle(page);
  const focused = await assertFrame(page);
  if (viewport.width < 700)
    assert.equal(focused.nav, null, "Composer focus hides mobile navigation");
  await page.getByRole("button", { name: "账号与额度", exact: true }).focus();
  await settle(page);
  const blurred = await assertFrame(page);
  if (viewport.width < 700)
    assert.ok(blurred.nav, "Navigation returns after focus leaves composer");
  const resized = {
    width: viewport.width < 700 ? 768 : 390,
    height: viewport.height,
  };
  await page.setViewportSize(resized);
  const resizeMetrics = await assertFrame(page);
  await page.setViewportSize(viewport);
  await assertFrame(page);
  return {
    initial: metrics,
    transcript,
    focused,
    blurred,
    resized: resizeMetrics,
  };
}
async function checkInterview(page) {
  await page.goto(url("/ai?mode=interview"));
  await page.locator(".ai-interview-setup").waitFor();
  return {
    frame: await assertFrame(page),
    transcript: await assertInternalScroll(page, ".ai-transcript"),
  };
}
async function checkLong(page) {
  await page.goto(url("/ai/layout-long"));
  await page.locator(".ai-message-assistant").first().waitFor();
  assert.equal(await page.locator(".ai-message").count(), messages.length);
  return {
    frame: await assertFrame(page),
    transcript: await assertInternalScroll(page, ".ai-transcript", true),
  };
}
async function checkEmbedded(page) {
  await page.goto(url("/practice?question=" + encodeURIComponent(question.id)));
  await page.locator(".question-prompt").waitFor();
  await page.getByRole("button", { name: "问 AI", exact: true }).click();
  await page
    .getByRole("dialog", { name: "题目 AI 助手", exact: true })
    .waitFor();
  await page.locator(".ai-embedded .ai-message-assistant").first().waitFor();
  await settle(page);
  const metrics = await page
    .locator(".practice-ai-dialog")
    .evaluate((panel) => {
      const box = (element) => {
        const value = element.getBoundingClientRect();
        return { top: value.top, bottom: value.bottom, height: value.height };
      };
      return {
        panel: box(panel),
        frame: box(panel.querySelector(".ai-page")),
        composer: box(panel.querySelector(".ai-composer-area")),
        viewportHeight: innerHeight,
      };
    });
  assert.ok(
    Math.abs(metrics.panel.top) <= 1 &&
      Math.abs(metrics.panel.bottom - metrics.viewportHeight) <= 1,
    "Embedded panel fills the viewport",
  );
  assert.ok(
    Math.abs(metrics.frame.top - metrics.panel.top) <= 1 &&
      Math.abs(metrics.frame.bottom - metrics.panel.bottom) <= 1,
    "Embedded AI fills its panel",
  );
  assert.ok(
    Math.abs(metrics.composer.bottom - metrics.frame.bottom) <= 1,
    "Embedded composer ends with its frame",
  );
  const transcript = await assertInternalScroll(
    page,
    ".ai-embedded .ai-transcript",
    true,
  );
  await page.getByRole("button", { name: "关闭 AI", exact: true }).click();
  return { ...metrics, transcript };
}
async function checkGuest(page) {
  await page.goto(url("/ai"));
  await page.locator(".ai-login").waitFor();
  const login = await assertFrame(page, { composer: false });
  await page
    .getByRole("button", { name: "使用邀请码注册", exact: true })
    .click();
  await page.locator('input[name="invitation"]').waitFor();
  const register = await assertFrame(page, { composer: false });
  const scroll = await assertInternalScroll(page, ".ai-auth");
  return { login, register, authScroll: scroll };
}

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const chrome = "C:/Program Files/Google/Chrome/Application/chrome.exe";
  const browser = await (useWebKit ? webkit : chromium).launch({
    headless: true,
    ...(!useWebKit && (process.env.CHROME_PATH || fs.existsSync(chrome))
      ? { executablePath: process.env.CHROME_PATH || chrome }
      : {}),
  });
  const results = [];
  try {
    for (const viewport of viewports) {
      for (const guest of [false, true]) {
        const context = await browser.newContext({
          viewport,
          isMobile: viewport.width < 700,
          hasTouch: viewport.width < 700,
          serviceWorkers: "block",
        });
        const page = await context.newPage();
        page.setDefaultTimeout(15000);
        const state = await installFixture(page, !guest);
        for (const test of guest
          ? [{ name: "guest-login-register", run: () => checkGuest(page) }]
          : [
              { name: "mock-entry-spacing", run: () => checkPractice(page) },
              {
                name: "empty-ai-focus-and-resize",
                run: () => checkEmpty(page, viewport),
              },
              { name: "interview-setup", run: () => checkInterview(page) },
              { name: "long-conversation-scroll", run: () => checkLong(page) },
              {
                name: "embedded-ai-fills-panel",
                run: () => checkEmbedded(page),
              },
            ]) {
          try {
            const metrics = await test.run();
            assert.deepEqual(
              state.unexpected,
              [],
              "All API writes remain blocked",
            );
            assert.deepEqual(state.errors, [], "No page exception");
            const result = { viewport, name: test.name, ok: true, metrics };
            if (
              (viewport.width === 390 &&
                viewport.height === 844 &&
                test.name === "empty-ai-focus-and-resize") ||
              (viewport.width === 320 && test.name === "interview-setup")
            )
              result.screenshot = await capture(
                page,
                `${viewport.width}x${viewport.height}-${test.name}`,
              );
            results.push(result);
            console.log(
              `PASS layout ${engineName} ${viewport.width}x${viewport.height} ${test.name}`,
            );
          } catch (error) {
            const screenshot = await capture(
              page,
              `${viewport.width}x${viewport.height}-${test.name}-failure`,
            ).catch(() => null);
            results.push({
              viewport,
              name: test.name,
              ok: false,
              error: error.message,
              screenshot,
              unexpected: state.unexpected,
              pageErrors: state.errors,
              frame: await frameMetrics(page).catch(() => null),
            });
            console.log(
              `FAIL layout ${engineName} ${viewport.width}x${viewport.height} ${test.name}: ${error.message}`,
            );
            process.exitCode = 1;
          }
        }
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
  const report = {
    ok: results.every((result) => result.ok),
    browser: engineName,
    base: site.href,
    mockedApi: true,
    realServerWrites: 0,
    modelCalls: 0,
    results,
  };
  fs.writeFileSync(
    path.join(output, `results-${engineName}.json`),
    JSON.stringify(report, null, 2),
  );
  console.log(
    JSON.stringify({
      ok: report.ok,
      browser: engineName,
      base: site.href,
      cases: results.length,
      failed: results.filter((result) => !result.ok).length,
    }),
  );
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
