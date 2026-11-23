// These are synthetic DOM/IME regressions, not control of an iPhone's system keyboard.
// Every API is intercepted. No real account, conversation, or model call is created.
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
const useWebKit = process.argv.includes("--webkit");
const browserName = useWebKit ? "webkit" : "chromium";
const output = path.join(root, "test-results");
const fixture = {
  username: "ime_fixture",
  password: "IME fixture password 9!",
};
const editor = (page) =>
  page.getByRole("textbox", { name: "给 AI 发送消息", exact: true });

async function waitCount(read, count) {
  const deadline = Date.now() + 5000;
  while (read() !== count && Date.now() < deadline)
    await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(read(), count);
}
async function noSend(page, state) {
  await page.waitForTimeout(80);
  assert.equal(
    state.messages.length,
    0,
    "Editing and IME confirmation must not enqueue a message",
  );
}
async function installFixture(page, state) {
  state.authenticated = !state.loginFirst;
  state.unexpected = [];
  state.messages = [];
  state.conversations = [];
  state.runs = [];
  state.authRequests = 0;
  state.user = {
    id: "ime-fixture",
    username: fixture.username,
    role: "learner",
  };
  await page.route("**/*", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    const endpoint = pathname.match(/\/api\/v1(\/.*)$/)?.[1];
    const method = request.method();
    if (!endpoint) {
      if (["GET", "HEAD"].includes(method)) return route.continue();
      state.unexpected.push({ method, pathname });
      return route.abort("blockedbyclient");
    }
    let status = 200;
    let data;
    if (method === "GET" && endpoint === "/me") {
      status = state.authenticated ? 200 : 401;
      data = state.authenticated
        ? { user: state.user, enabled: true, csrf: "ime-fixture-csrf" }
        : { error: "请先登录 AI 学习空间" };
    } else if (method === "POST" && endpoint === "/auth/login") {
      const body = request.postDataJSON();
      assert.deepEqual(body, fixture);
      state.authRequests += 1;
      state.authFocus = await page.evaluate(() => ({
        tag: document.activeElement?.tagName,
        type: document.activeElement?.getAttribute("type"),
      }));
      state.authenticated = true;
      data = { user: state.user, enabled: true, csrf: "ime-fixture-csrf" };
    } else if (method === "GET" && endpoint === "/content/manifest")
      data = { release: "1", schemaVersion: 1, bank };
    else if (method === "GET" && endpoint === "/usage")
      data = { consumed: 0, reserved: 0, limit: 300000 };
    else if (method === "GET" && endpoint === "/conversations")
      data = { items: state.conversations };
    else if (method === "GET" && ["/my/questions", "/notes"].includes(endpoint))
      data = { items: [] };
    else if (method === "GET" && endpoint === "/runs")
      data = { items: state.runs };
    else if (method === "POST" && endpoint === "/conversations") {
      const body = request.postDataJSON();
      data = {
        id: "ime-conversation-" + (state.conversations.length + 1),
        title: "组合输入回归",
        mode: body.mode || "chat",
        context: body,
        updated_at: new Date().toISOString(),
      };
      state.conversations.unshift(data);
    } else if (
      method === "POST" &&
      /^\/conversations\/[^/]+\/messages$/.test(endpoint)
    ) {
      const body = request.postDataJSON();
      const id = endpoint.split("/")[2];
      state.messages.push({ ...body, conversation: id });
      data = {
        id: "ime-run-" + state.messages.length,
        conversation_id: id,
        kind: "chat",
        status: "failed",
        error: "合成回归夹具：未调用模型",
        output: {},
        created_at: new Date().toISOString(),
      };
      state.runs.unshift(data);
    } else if (method === "GET" && /^\/conversations\/[^/]+$/.test(endpoint)) {
      const id = endpoint.split("/")[2];
      const conversation = state.conversations.find((item) => item.id === id);
      assert.ok(conversation, "Only fixture conversations can be read");
      data = {
        conversation,
        messages: state.messages
          .filter((item) => item.conversation === id)
          .map((item, index) => ({
            id: "ime-message-" + index,
            role: "user",
            text: item.text,
          })),
        runs: state.runs.filter((item) => item.conversation_id === id),
      };
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

async function enter(page) {
  await page.goto(site.href + "#/ai");
  await editor(page).waitFor();
  await editor(page).focus();
}
async function rememberEditor(page) {
  await editor(page).evaluate((element) => {
    window.__imeEditor = element;
  });
}
async function assertSameFocusedEditor(page) {
  assert.equal(
    await editor(page).evaluate(
      (element) =>
        element === window.__imeEditor && document.activeElement === element,
    ),
    true,
    "Composition changes keep the same focused textarea node",
  );
}
async function compose(page, data, finalValue, endMode = "compositionend") {
  await editor(page).evaluate(
    (element, input) => {
      element.dispatchEvent(
        new CompositionEvent("compositionstart", { bubbles: true, data: "" }),
      );
      Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      ).set.call(element, input.data);
      element.dispatchEvent(
        new CompositionEvent("compositionupdate", {
          bubbles: true,
          data: input.data,
        }),
      );
      element.dispatchEvent(
        new InputEvent("beforeinput", {
          bubbles: true,
          cancelable: true,
          data: input.data,
          inputType: "insertCompositionText",
          isComposing: true,
        }),
      );
      element.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          data: input.data,
          inputType: "insertCompositionText",
          isComposing: true,
        }),
      );
      Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      ).set.call(element, input.finalValue);
      if (input.endMode === "change")
        element.dispatchEvent(new Event("change", { bubbles: true }));
      else {
        element.dispatchEvent(
          new CompositionEvent("compositionend", {
            bubbles: true,
            data: input.finalValue,
          }),
        );
        element.dispatchEvent(
          new InputEvent("input", {
            bubbles: true,
            data: input.finalValue,
            inputType: "insertText",
            isComposing: false,
          }),
        );
      }
    },
    { data, finalValue, endMode },
  );
}
async function dispatchEnter(page, options = {}) {
  return editor(page).evaluate((element, init) => {
    const event = new KeyboardEvent("keydown", {
      key: "Enter",
      code: "Enter",
      keyCode: 13,
      which: 13,
      bubbles: true,
      cancelable: true,
      ...init,
    });
    element.dispatchEvent(event);
    return event.defaultPrevented;
  }, options);
}
async function nativeClickSend(page) {
  await page
    .getByRole("button", { name: "发送消息", exact: true })
    .evaluate((element) => element.click());
}

async function checkMixedComposition(page, state) {
  await enter(page);
  await rememberEditor(page);
  await compose(page, "zhongwen", "中文");
  await assertSameFocusedEditor(page);
  await page.keyboard.insertText(" English ");
  await assertSameFocusedEditor(page);
  await compose(page, "中文 English zaizhongwen", "中文 English 再中文");
  assert.equal(await editor(page).inputValue(), "中文 English 再中文");
  await assertSameFocusedEditor(page);
  await noSend(page, state);
  await page.reload();
  await editor(page).waitFor();
  assert.equal(
    await editor(page).inputValue(),
    "中文 English 再中文",
    "Only committed text is restored from the draft",
  );
}
async function checkActiveComposition(page, state) {
  await enter(page);
  await editor(page).fill("已提交的中文");
  await rememberEditor(page);
  await editor(page).evaluate((element) => {
    element.dispatchEvent(
      new CompositionEvent("compositionstart", { bubbles: true, data: "" }),
    );
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    ).set.call(element, "已提交的中文pin");
    element.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        data: "pin",
        inputType: "insertCompositionText",
        isComposing: true,
      }),
    );
  });
  assert.equal(
    await dispatchEnter(page, { isComposing: false, keyCode: 13, which: 13 }),
    false,
    "A misleading Safari Enter does not cancel the IME default action",
  );
  await noSend(page, state);
  assert.equal(await editor(page).inputValue(), "已提交的中文pin");
  await assertSameFocusedEditor(page);
  await nativeClickSend(page);
  await noSend(page, state);
  assert.equal(
    await editor(page).inputValue(),
    "已提交的中文pin",
    "An active composition is not cleared by a send attempt",
  );
}
async function checkCompositionTail(page, state) {
  await enter(page);
  await editor(page).fill("已有中文");
  const prevented = await editor(page).evaluate((element) => {
    element.dispatchEvent(
      new CompositionEvent("compositionstart", { bubbles: true, data: "" }),
    );
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    ).set.call(element, "已有中文确认");
    element.dispatchEvent(
      new CompositionEvent("compositionend", { bubbles: true, data: "确认" }),
    );
    const event = new KeyboardEvent("keydown", {
      key: "Enter",
      code: "Enter",
      isComposing: false,
      keyCode: 13,
      which: 13,
      bubbles: true,
      cancelable: true,
    });
    element.dispatchEvent(event);
    return event.defaultPrevented;
  });
  assert.equal(
    prevented,
    false,
    "The confirmation Enter immediately following compositionend remains native",
  );
  await noSend(page, state);
  assert.equal(await editor(page).inputValue(), "已有中文确认");
}
async function checkEnterAndSend(page, state, width) {
  await enter(page);
  await editor(page).fill("中文与 English");
  if (width < 700) {
    await editor(page).press("End");
    await editor(page).press("Enter");
    assert.equal(
      await editor(page).inputValue(),
      "中文与 English\n",
      "Mobile Enter inserts a newline",
    );
    await noSend(page, state);
    await page.keyboard.insertText("继续中文");
    await page.getByRole("button", { name: "发送消息", exact: true }).click();
    await waitCount(() => state.messages.length, 1);
    assert.equal(state.messages[0].text, "中文与 English\n继续中文");
  } else {
    await editor(page).press("End");
    await editor(page).press("Shift+Enter");
    assert.equal(await editor(page).inputValue(), "中文与 English\n");
    await noSend(page, state);
    await page.keyboard.insertText("继续中文");
    await editor(page).press("Enter");
    await waitCount(() => state.messages.length, 1);
    assert.equal(state.messages[0].text, "中文与 English\n继续中文");
  }
  assert.equal(
    state.conversations.length,
    1,
    "One explicit send creates one fixture conversation",
  );
}
async function checkEventGuards(page, state) {
  await enter(page);
  await editor(page).fill("尚未发送的中文");
  assert.equal(await dispatchEnter(page, { isComposing: true }), false);
  assert.equal(
    await dispatchEnter(page, { isComposing: false, keyCode: 229, which: 229 }),
    false,
  );
  await noSend(page, state);
  assert.equal(await editor(page).inputValue(), "尚未发送的中文");
}
async function checkChangeFallback(page, state) {
  await enter(page);
  await compose(page, "zhongwen", "change 提交的中文", "change");
  await nativeClickSend(page);
  await waitCount(() => state.messages.length, 1);
  assert.equal(
    state.messages[0].text,
    "change 提交的中文",
    "A change-only commit does not leave the composer locked",
  );
}
async function checkFocusLifecycle(page, state) {
  await enter(page);
  await rememberEditor(page);
  await editor(page).fill("焦点与中文");
  assert.equal(
    await page.evaluate(() => document.body.classList.contains("ai-keyboard")),
    true,
  );
  await editor(page).evaluate((element) =>
    element.dispatchEvent(
      new FocusEvent("focusout", { bubbles: true, relatedTarget: null }),
    ),
  );
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  assert.equal(
    await page.evaluate(() => document.body.classList.contains("ai-keyboard")),
    true,
    "A null relatedTarget does not hide the keyboard layout while the editor is actually focused",
  );
  await assertSameFocusedEditor(page);
  await editor(page).evaluate((element) =>
    element.dispatchEvent(
      new CompositionEvent("compositionstart", { bubbles: true, data: "" }),
    ),
  );
  await page.getByRole("button", { name: "账号与额度", exact: true }).focus();
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  assert.equal(
    await page.evaluate(() => document.body.classList.contains("ai-keyboard")),
    false,
    "A genuine focus move out of the composer releases the keyboard layout",
  );
  await editor(page).focus();
  await editor(page).fill("真实失焦后可继续发送中文");
  await nativeClickSend(page);
  await waitCount(() => state.messages.length, 1);
  assert.equal(state.messages[0].text, "真实失焦后可继续发送中文");
  // An intercepted POST is not the completed send: new chats still update the URL.
  // Finish that navigation before independently testing the editor's unmount cleanup.
  await page.waitForURL(
    (value) => value.hash === "#/ai/" + state.messages[0].conversation,
  );
  await page
    .locator(".ai-message-user")
    .filter({ hasText: state.messages[0].text })
    .waitFor();
  await page.waitForFunction(
    () => document.querySelector(".ai-composer textarea")?.value === "",
  );
  await editor(page).focus();
  await page.evaluate(() => {
    location.hash = "#/library";
  });
  await page.locator(".topic-tile").first().waitFor();
  assert.equal(
    await page.evaluate(() => document.body.classList.contains("ai-keyboard")),
    false,
    "Unmounting the AI editor removes the keyboard layout class",
  );
}
async function checkLoginTransition(page, state) {
  await page.goto(site.href + "#/ai");
  const password = page.getByLabel("密码", { exact: true });
  await page.getByLabel("用户名", { exact: true }).fill(fixture.username);
  await password.fill(fixture.password);
  await password.evaluate((element) => {
    window.__imePassword = element;
  });
  await password.focus();
  await password.press("Enter");
  await editor(page).waitFor();
  assert.equal(state.authRequests, 1);
  assert.notEqual(
    state.authFocus?.type,
    "password",
    "The secure input is blurred before the authentication transition",
  );
  const traits = await editor(page).evaluate((element) => ({
    differentNode: element !== window.__imePassword,
    tag: element.tagName,
    type: element.getAttribute("type"),
    name: element.getAttribute("name"),
    inputmode: element.getAttribute("inputmode"),
    autocomplete: element.getAttribute("autocomplete"),
    enterkeyhint: element.getAttribute("enterkeyhint"),
  }));
  assert.deepEqual(traits, {
    differentNode: true,
    tag: "TEXTAREA",
    type: null,
    name: "message",
    inputmode: "text",
    autocomplete: "off",
    enterkeyhint: "enter",
  });
  await editor(page).focus();
  await compose(page, "zhongwen", "登录后中文");
  assert.equal(await editor(page).inputValue(), "登录后中文");
  await noSend(page, state);
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
    for (const width of [320, 390, 1440]) {
      for (const test of [
        {
          name: "chinese-english-chinese-retains-focus-and-draft",
          run: checkMixedComposition,
        },
        {
          name: "active-composition-never-sends-or-cancels-default",
          run: checkActiveComposition,
        },
        {
          name: "composition-end-enter-tail-remains-native",
          run: checkCompositionTail,
        },
        {
          name: "mobile-newline-desktop-enter-and-explicit-send",
          run: checkEnterAndSend,
        },
        {
          name: "iscomposing-and-keycode229-remain-native",
          run: checkEventGuards,
        },
        {
          name: "change-only-composition-commit-can-send",
          run: checkChangeFallback,
        },
        { name: "focus-recheck-and-unmount-cleanup", run: checkFocusLifecycle },
        {
          name: "login-transitions-to-fresh-multilingual-editor",
          run: checkLoginTransition,
          loginFirst: true,
        },
      ]) {
        const context = await browser.newContext({
          viewport: { width, height: width < 700 ? 844 : 1000 },
          isMobile: width < 700,
          hasTouch: width < 700,
          serviceWorkers: "block",
        });
        const page = await context.newPage();
        page.setDefaultTimeout(15000);
        const state = { loginFirst: test.loginFirst };
        const pageErrors = [];
        page.on("pageerror", (error) => pageErrors.push(error.message));
        await installFixture(page, state);
        try {
          await test.run(page, state, width);
          assert.deepEqual(
            state.unexpected,
            [],
            "Unknown API mutations remain blocked",
          );
          assert.deepEqual(pageErrors, [], "No uncaught page exception");
          assert.ok(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth + 1,
            ),
            "No horizontal overflow",
          );
          results.push({
            width,
            name: test.name,
            ok: true,
            fixtureMessages: state.messages.length,
          });
          console.log(`PASS ime ${browserName} ${width} ${test.name}`);
        } catch (error) {
          const screenshot = path.join(
            output,
            `ime-${browserName}-${width}-${test.name}-failure.png`,
          );
          await page
            .screenshot({ path: screenshot, fullPage: true })
            .catch(() => {});
          results.push({
            width,
            name: test.name,
            ok: false,
            error: error.message,
            screenshot,
            fixtureMessages: state.messages.map((item) => ({
              length: item.text?.length,
            })),
            unexpected: state.unexpected,
            pageErrors,
            page: await page
              .evaluate(() => ({
                url: location.href,
                activeTag: document.activeElement?.tagName,
                keyboardClass: document.body.classList.contains("ai-keyboard"),
                editor: [
                  ...document.querySelectorAll(".ai-composer textarea"),
                ].map((element) => ({
                  length: element.value.length,
                  name: element.name,
                  disabled: element.disabled,
                })),
              }))
              .catch(() => null),
          });
          process.exitCode = 1;
          console.log(
            `FAIL ime ${browserName} ${width} ${test.name}: ${error.message}`,
          );
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
    browser: browserName,
    base: site.href,
    mockedApi: true,
    syntheticCompositionEvents: true,
    physicalIOSKeyboard: false,
    realAccountWrites: 0,
    modelCalls: 0,
    results,
  };
  fs.writeFileSync(
    path.join(output, `ime-${browserName}.json`),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
