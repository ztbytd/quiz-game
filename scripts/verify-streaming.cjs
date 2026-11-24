// A local HTTP fixture serves all APIs, including native EventSource streams.
// Only static GETs are read from BASE_URL. No remote API or model is called.
const { chromium, webkit } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const MarkdownIt = require("markdown-it");

const root = path.resolve(__dirname, "..");
const bank = JSON.parse(
  fs.readFileSync(path.join(root, "src/data/bank.json"), "utf8"),
);
const source = new URL(process.env.BASE_URL || "http://127.0.0.1:5185/quiz/");
source.hash = "";
source.search = "";
if (!source.pathname.endsWith("/")) source.pathname += "/";
const engine = process.argv.includes("--webkit") ? "webkit" : "chromium";
const filter =
  process.argv.find((arg) => arg.startsWith("--filter="))?.slice(9) || "";
const output = path.join(root, "test-results", "streaming");
const staticCache = new Map();
const md = new MarkdownIt({ html: false, linkify: false, breaks: true });
md.disable("image");
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const editor = (page) =>
  page.getByRole("textbox", { name: "给 AI 发送消息", exact: true });
const fullText = [
  "先记录请求标识，再核对状态。中文、e\u0301、🇨🇳、👨‍👩‍👧‍👦都应完整显示。",
  ...Array.from(
    { length: 9 },
    (_, i) =>
      `第${i + 1}段：事件循环会先执行当前任务，再处理微任务；渲染有自己的执行机会。`,
  ),
  "```javascript\nconst value = '中文 👨‍👩‍👧‍👦';\nconsole.log(value);\n```",
  "最后一段：回复完成后保留全部文字，末尾标记【已完整接收】。",
].join("\n\n");
const segments = [
  ...new Intl.Segmenter("zh", { granularity: "grapheme" }).segment(fullText),
].map((part) => part.segment);
const chunks = Array.from({ length: Math.ceil(segments.length / 22) }, (_, i) =>
  segments.slice(i * 22, i * 22 + 22).join(""),
);

async function waitUntil(read, predicate, message, timeout = 6000) {
  const deadline = Date.now() + timeout;
  let value;
  do {
    value = await read();
    if (predicate(value)) return value;
    await pause(25);
  } while (Date.now() < deadline);
  assert.ok(predicate(value), `${message}: ${JSON.stringify(value)}`);
}
async function normalizedMarkdown(page, text) {
  return page.evaluate((html) => {
    const element = document.createElement("div");
    element.innerHTML = html;
    return element.textContent.replace(/\s/g, "");
  }, md.render(text));
}
async function visibleText(page) {
  return page
    .locator(".ai-message-assistant .ai-markdown")
    .last()
    .textContent();
}
async function createFixture(scenario) {
  const state = {
    scenario,
    connections: new Set(),
    timers: new Set(),
    requests: [],
    events: [],
    unexpected: [],
    errors: [],
    acceptedConnections: 0,
    disconnects: 0,
    duplicateEvents: 0,
    started: false,
    done: false,
    terminalAt: undefined,
    conversations: [
      {
        id: "stream-main",
        title: "流式回归",
        mode: "chat",
        context: {},
        updated_at: "2026-11-24T00:00:00Z",
      },
      {
        id: "stream-other",
        title: "另一个会话",
        mode: "chat",
        context: {},
        updated_at: "2026-11-24T00:00:00Z",
      },
    ],
    run: {
      id: "stream-run",
      conversation_id: "stream-main",
      kind: "chat",
      status: "queued",
      output: {},
      fence: 1,
      created_at: "2026-11-24T00:00:00Z",
    },
    seq: 0,
  };
  const after = (ms, fn) => {
    const timer = setTimeout(() => {
      state.timers.delete(timer);
      fn();
    }, ms);
    state.timers.add(timer);
  };
  const snapshot = () => ({
    ...state.run,
    output: { ...state.run.output },
    ...(state.run.status !== "queued"
      ? {
          stream: {
            id: "stream-run:1",
            seq: state.seq,
            offset: (state.run.output.text || "").length,
          },
        }
      : {}),
  });
  const event = (res, type, value) => {
    if (res.destroyed || res.writableEnded) return;
    state.events.push({
      at: Date.now(),
      type,
      status: value.status,
      seq: value.seq ?? value.stream?.seq,
      length: value.output?.text?.length ?? value.text?.length,
    });
    res.write(`event: ${type}\ndata: ${JSON.stringify(value)}\n\n`);
  };
  const broadcast = (type, value) => {
    for (const res of state.connections) event(res, type, value);
  };
  const finish = (status = "succeeded") => {
    if (state.done) return;
    state.done = true;
    state.run.status = status;
    state.terminalAt = Date.now();
    broadcast("snapshot", snapshot());
    for (const res of state.connections) res.end();
  };
  const start = () => {
    if (state.started) return;
    state.started = true;
    after(35, () => {
      state.run.status = "running";
      state.run.output.text = "";
      broadcast("snapshot", snapshot());
      const interval =
        scenario === "cancel" || scenario === "switch" || scenario === "reader"
          ? 95
          : 60;
      chunks.forEach((text, index) =>
        after((index + 1) * interval, () => {
          if (state.done) return;
          const offset = state.run.output.text.length;
          state.run.output.text += text;
          state.seq++;
          const delta = {
            runId: state.run.id,
            streamId: "stream-run:1",
            fence: 1,
            seq: state.seq,
            offset,
            text,
          };
          state.lastDelta = delta;
          broadcast("delta", delta);
          if (scenario === "reconnect" && index === 3 && !state.disconnects) {
            state.disconnects++;
            for (const res of state.connections) res.end();
          }
        }),
      );
      after((chunks.length + 1) * interval + 120, () => finish());
    });
  };
  const history = () =>
    scenario === "reader"
      ? Array.from({ length: 32 }, (_, i) => ({
          id: `history-${i}`,
          role: i % 2 ? "assistant" : "user",
          runId: `history-run-${i}`,
          text: (i % 2
            ? "这是前面的历史回复，用于确认向上阅读时不会抢走滚动位置。"
            : "请继续解释前面的知识点。"
          ).repeat(4),
        }))
      : [];
  const server = http.createServer(async (req, res) => {
    try {
      const requestUrl = new URL(req.url, "http://fixture.invalid");
      const endpoint = requestUrl.pathname.match(/\/api\/v1(\/.*)$/)?.[1];
      if (!endpoint) {
        if (
          !["GET", "HEAD"].includes(req.method) ||
          requestUrl.pathname.includes("/api/")
        ) {
          state.unexpected.push({
            method: req.method,
            path: requestUrl.pathname,
          });
          res.writeHead(500);
          return res.end("Fixture blocked non-static traffic");
        }
        const remote = new URL(req.url, source.origin);
        assert.ok(
          remote.pathname.startsWith(source.pathname),
          "Static requests must stay in the source app path",
        );
        let asset = staticCache.get(remote.href);
        if (!asset) {
          const response = await fetch(remote, {
            redirect: "error",
            signal: AbortSignal.timeout(15000),
          });
          asset = {
            status: response.status,
            type:
              response.headers.get("content-type") ||
              "application/octet-stream",
            body: Buffer.from(await response.arrayBuffer()),
          };
          if (response.ok) staticCache.set(remote.href, asset);
        }
        res.writeHead(asset.status, {
          "Content-Type": asset.type,
          "Cache-Control": "no-store",
        });
        return res.end(req.method === "HEAD" ? undefined : asset.body);
      }
      state.requests.push({ at: Date.now(), method: req.method, endpoint });
      let data,
        status = 200;
      if (req.method === "GET" && endpoint === "/me")
        data = {
          user: {
            id: "stream-fixture",
            username: "stream_fixture",
            role: "learner",
          },
          enabled: true,
          csrf: "stream-csrf",
        };
      else if (req.method === "GET" && endpoint === "/content/manifest")
        data = { release: "1", schemaVersion: 1, bank };
      else if (req.method === "GET" && endpoint === "/usage")
        data = { consumed: 0, reserved: 0, limit: 300000 };
      else if (req.method === "GET" && endpoint === "/conversations")
        data = { items: state.conversations };
      else if (
        req.method === "GET" &&
        ["/my/questions", "/notes"].includes(endpoint)
      )
        data = { items: [] };
      else if (req.method === "GET" && endpoint === "/runs")
        data = { items: [snapshot()] };
      else if (req.method === "GET" && endpoint === "/runs/stream-run")
        data = snapshot();
      else if (req.method === "GET" && endpoint === "/runs/stream-run/events") {
        assert.equal(
          requestUrl.searchParams.get("live"),
          "1",
          "The UI must request the live streaming protocol",
        );
        assert.match(req.headers.accept || "", /text\/event-stream/);
        state.acceptedConnections++;
        res.writeHead(200, {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-store",
          "X-Accel-Buffering": "no",
        });
        res.write("retry: 80\n\n");
        state.connections.add(res);
        res.on("close", () => state.connections.delete(res));
        event(res, "snapshot", snapshot());
        if (state.acceptedConnections > 1 && state.lastDelta && !state.done) {
          state.duplicateEvents++;
          event(res, "delta", state.lastDelta);
        }
        if (state.done) res.end();
        else start();
        return;
      } else if (
        req.method === "POST" &&
        endpoint === "/runs/stream-run/cancel"
      ) {
        finish("canceled");
        data = snapshot();
      } else if (req.method === "GET" && /^\/conversations\//.test(endpoint)) {
        const conversation = state.conversations.find(
          (item) => item.id === endpoint.split("/")[2],
        );
        assert.ok(
          conversation,
          "Only known fixture conversations can be opened",
        );
        const main = conversation.id === "stream-main";
        data = {
          conversation,
          messages: main
            ? [
                ...history(),
                {
                  id: "current-user",
                  role: "user",
                  text: "请连续解释这个问题。",
                  runId: state.run.id,
                },
                ...(state.run.status === "succeeded"
                  ? [
                      {
                        id: "current-assistant",
                        role: "assistant",
                        text: state.run.output.text,
                        runId: state.run.id,
                      },
                    ]
                  : []),
              ]
            : [
                {
                  id: "other-answer",
                  role: "assistant",
                  text: "这是另一个会话的独立内容。",
                  runId: "other-run",
                },
              ],
          runs: main ? [snapshot()] : [],
        };
      } else {
        state.unexpected.push({ method: req.method, endpoint });
        status = 500;
        data = { error: "Unknown API request blocked by streaming fixture" };
      }
      res.writeHead(status, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify(data));
    } catch (error) {
      state.errors.push(error.message);
      if (!res.headersSent)
        res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Streaming fixture failed" }));
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  return {
    state,
    origin,
    url: (route) => origin + source.pathname + "#" + route,
    close: async () => {
      for (const timer of state.timers) clearTimeout(timer);
      for (const res of state.connections) res.destroy();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

async function recordVisible(page) {
  await page.evaluate(() => {
    window.__streamVisible = [];
    let previous = "";
    const record = () => {
      const elements = document.querySelectorAll(
        ".ai-message-assistant .ai-markdown",
      );
      const text = elements.length
        ? elements[elements.length - 1].textContent
        : "";
      if (text && text !== previous) {
        previous = text;
        window.__streamVisible.push({ at: Date.now(), length: text.length });
      }
    };
    new MutationObserver(record).observe(
      document.querySelector("#main-content"),
      { childList: true, subtree: true, characterData: true },
    );
    record();
  });
}
async function enter(page, fixture) {
  await page.goto(fixture.url("/ai/stream-main"));
  await editor(page).waitFor();
}
async function finalAnswer(page, fixture) {
  await waitUntil(
    () => Promise.resolve(fixture.state.done),
    Boolean,
    "Fixture completion must occur",
  );
  const expected = await normalizedMarkdown(page, fullText);
  await waitUntil(
    async () => (await visibleText(page)).replace(/\s/g, ""),
    (text) => text === expected,
    "Final output must preserve all Chinese, emoji and code",
  );
  await page
    .getByRole("button", { name: "停止回复", exact: true })
    .waitFor({ state: "detached" });
  assert.equal(await page.locator(".ai-message-assistant").count(), 1);
  assert.equal(
    await page.locator(".ai-message-assistant pre code").textContent(),
    "const value = '中文 👨‍👩‍👧‍👦';\nconsole.log(value);\n",
  );
  return expected;
}
async function checkProgress(page, fixture) {
  await enter(page, fixture);
  await recordVisible(page);
  await page.waitForFunction(
    () => window.__streamVisible.filter((item) => item.length > 0).length >= 4,
  );
  assert.equal(
    fixture.state.done,
    false,
    "Several visible updates must occur before the run completes",
  );
  const expected = await finalAnswer(page, fixture);
  const observations = await page.evaluate(() => window.__streamVisible);
  const intermediate = observations.filter(
    (item) => item.at < fixture.state.terminalAt,
  );
  assert.ok(intermediate.length >= 4);
  const gaps = intermediate
    .slice(1)
    .map((item, index) => item.at - intermediate[index].at);
  assert.ok(
    gaps.some((gap) => gap < 200),
    "Visible growth must be finer than the former 600ms snapshots",
  );
  await page.reload();
  await editor(page).waitFor();
  assert.equal((await visibleText(page)).replace(/\s/g, ""), expected);
  return {
    observations,
    intermediateUpdates: intermediate.length,
    connections: fixture.state.acceptedConnections,
  };
}
async function checkReconnect(page, fixture) {
  await enter(page, fixture);
  await recordVisible(page);
  await finalAnswer(page, fixture);
  assert.ok(
    fixture.state.acceptedConnections >= 2,
    "Native EventSource must reconnect to the HTTP stream",
  );
  assert.equal(fixture.state.disconnects, 1);
  assert.ok(
    fixture.state.duplicateEvents >= 1,
    "The reconnect includes an already-covered delta",
  );
  return {
    connections: fixture.state.acceptedConnections,
    duplicateEvents: fixture.state.duplicateEvents,
  };
}
async function checkCancel(page, fixture) {
  await enter(page, fixture);
  await page.locator(".ai-message-assistant .ai-markdown").waitFor();
  await waitUntil(
    () => Promise.resolve(fixture.state.seq),
    (seq) => seq >= 3,
    "Receive several deltas before cancellation",
  );
  await page.evaluate(() => {
    window.__cancelInteraction = [];
    for (const name of [
      "pointerdown",
      "pointerup",
      "touchstart",
      "touchend",
      "mousedown",
      "mouseup",
      "click",
      "focusin",
    ]) {
      document.addEventListener(
        name,
        (event) => {
          const capture = (phase) =>
            window.__cancelInteraction.push({
              type: event.type,
              phase,
              target:
                event.target.closest?.("button")?.getAttribute("aria-label") ||
                event.target.tagName,
              keyboard: document.body.classList.contains("ai-keyboard"),
              stopTop: document
                .querySelector('button[aria-label="停止回复"]')
                ?.getBoundingClientRect().top,
            });
          capture("event");
          requestAnimationFrame(() => capture("frame"));
        },
        true,
      );
    }
  });
  const stop = page.getByRole("button", { name: "停止回复", exact: true });
  if (page.viewportSize().width < 700) await stop.tap();
  else await stop.click();
  await waitUntil(
    () => Promise.resolve(fixture.state.run.status),
    (status) => status === "canceled",
    "The stop interaction must reach the cancel API",
    2000,
  );
  await page
    .getByText("已停止回复，已接收的内容保留在这里。", { exact: true })
    .waitFor();
  const expected = await normalizedMarkdown(
    page,
    fixture.state.run.output.text,
  );
  await waitUntil(
    async () => (await visibleText(page)).replace(/\s/g, ""),
    (text) => text === expected,
    "Cancellation must flush the last accepted content",
  );
  const before = await visibleText(page);
  await pause(450);
  assert.equal(
    await visibleText(page),
    before,
    "Canceled output must not keep playing queued text",
  );
  assert.equal(fixture.state.run.status, "canceled");
  assert.equal(
    await page.evaluate(() => document.body.classList.contains("ai-keyboard")),
    false,
    "Stopping without editing must not activate keyboard layout",
  );
  return { retainedCharacters: fixture.state.run.output.text.length };
}
async function checkSwitch(page, fixture) {
  await enter(page, fixture);
  await page.locator(".ai-message-assistant .ai-markdown").waitFor();
  await page.goto(fixture.url("/ai/stream-other"));
  await page
    .locator(".ai-message-assistant .ai-markdown")
    .filter({ hasText: "这是另一个会话的独立内容。" })
    .waitFor();
  await pause(450);
  assert.equal((await visibleText(page)).trim(), "这是另一个会话的独立内容。");
  assert.equal(await page.locator(".ai-message-assistant").count(), 1);
  await waitUntil(
    () => Promise.resolve(fixture.state.connections.size),
    (count) => count === 0,
    "Leaving the running conversation must close its subscription",
  );
  return { oldConnectionClosed: true };
}
async function checkReader(page, fixture) {
  await enter(page, fixture);
  await editor(page).fill("当前输入的草稿不应被输出打断。");
  await editor(page).focus();
  await page.evaluate(() => {
    const transcript = document.querySelector(".ai-transcript");
    transcript.scrollTop = 0;
    transcript.dispatchEvent(new Event("scroll"));
  });
  await pause(450);
  const position = await page.locator(".ai-transcript").evaluate((element) => ({
    top: element.scrollTop,
    overflow: element.scrollHeight - element.clientHeight,
  }));
  assert.ok(
    position.overflow > 500,
    "The reader scenario needs a real scrollable history",
  );
  assert.ok(
    position.top < 4,
    "New output must not pull an upward-reading user to the bottom",
  );
  assert.equal(
    await editor(page).inputValue(),
    "当前输入的草稿不应被输出打断。",
  );
  assert.equal(
    await editor(page).evaluate(
      (element) => document.activeElement === element,
    ),
    true,
  );
  await page
    .getByRole("button", { name: "回到最新回复", exact: true })
    .waitFor();
  return { position, focusRetained: true };
}

(async () => {
  fs.mkdirSync(output, { recursive: true });
  assert.ok(
    !source.username && !source.password,
    "The static source must not contain account credentials",
  );
  const readiness = await fetch(source, {
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
  assert.ok(
    readiness.ok,
    `The static source must be available: HTTP ${readiness.status}`,
  );
  const browser = await (engine === "webkit" ? webkit : chromium).launch({
    headless: true,
    ...(engine === "chromium"
      ? {
          executablePath:
            process.env.CHROME_PATH ||
            "C:/Program Files/Google/Chrome/Application/chrome.exe",
        }
      : {}),
  });
  const results = [];
  try {
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 1440, height: 1000 },
    ]) {
      for (const test of [
        {
          name: "native-progress-and-final-markdown",
          scenario: "progress",
          run: checkProgress,
        },
        {
          name: "native-reconnect-and-duplicate-delta",
          scenario: "reconnect",
          run: checkReconnect,
        },
        {
          name: "cancel-flushes-and-stops-display",
          scenario: "cancel",
          run: checkCancel,
        },
        {
          name: "conversation-switch-closes-old-stream",
          scenario: "switch",
          run: checkSwitch,
        },
        {
          name: "upward-reading-keeps-scroll-and-input",
          scenario: "reader",
          run: checkReader,
        },
      ].filter((test) => !filter || test.name.includes(filter))) {
        const fixture = await createFixture(test.scenario);
        const context = await browser.newContext({
          viewport,
          isMobile: viewport.width < 700,
          hasTouch: viewport.width < 700,
          serviceWorkers: "block",
        });
        await context.route("**/*", (route) => {
          const requested = new URL(route.request().url());
          if (requested.origin === fixture.origin) return route.continue();
          fixture.state.unexpected.push({
            method: route.request().method(),
            externalOrigin: requested.origin,
          });
          return route.abort("blockedbyclient");
        });
        const page = await context.newPage();
        page.setDefaultTimeout(15000);
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        try {
          const details = await test.run(page, fixture);
          assert.deepEqual(fixture.state.unexpected, []);
          assert.deepEqual(fixture.state.errors, []);
          assert.deepEqual(errors, []);
          assert.ok(
            fixture.state.acceptedConnections >= 1,
            "The browser must open a real HTTP event stream",
          );
          results.push({
            width: viewport.width,
            name: test.name,
            ok: true,
            fixtureOrigin: fixture.origin,
            ...details,
          });
          console.log(
            `PASS streaming ${engine} ${viewport.width} ${test.name}`,
          );
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
            fixtureOrigin: fixture.origin,
            pageErrors: errors,
            fixtureErrors: fixture.state.errors,
            unexpected: fixture.state.unexpected,
            connections: fixture.state.acceptedConnections,
            events: fixture.state.events,
            screenshot,
            interaction: await page
              .evaluate(() => window.__cancelInteraction || null)
              .catch(() => null),
          });
          process.exitCode = 1;
          console.log(
            `FAIL streaming ${engine} ${viewport.width} ${test.name}: ${error.message}`,
          );
          if (fixture.state.errors.length)
            console.log(
              JSON.stringify({ fixtureErrors: fixture.state.errors }),
            );
        } finally {
          await context.close();
          await fixture.close();
        }
      }
    }
  } finally {
    await browser.close();
  }
  assert.ok(
    results.length,
    "The requested streaming test filter must match at least one case",
  );
  const report = {
    ok: results.every((result) => result.ok),
    browser: engine,
    filter,
    sourceBase: source.href,
    nativeEventSource: true,
    sameOriginHttpFixture: true,
    remoteApiRequests: 0,
    modelCalls: 0,
    realAccountWrites: 0,
    results,
  };
  fs.writeFileSync(
    path.join(output, `results-${engine}${filter ? "-filtered" : ""}.json`),
    JSON.stringify(report, null, 2),
  );
  console.log(
    JSON.stringify({
      ...report,
      results: results.map(
        ({ observations, events, interaction, ...result }) => result,
      ),
    }),
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
