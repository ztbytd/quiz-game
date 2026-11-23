// Authentication regressions use isolated browser storage and intercept every API.
// Only the synthetic credentials below are used; no account or paid task is created.
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
const url = site.href + "#/ai";
const useWebKit = process.argv.includes("--webkit");
const browserName = useWebKit ? "webkit" : "chromium";
const output = path.join(root, "test-results");
const fixture = {
  username: "mobile_auth_fixture",
  password: " Fixture password 9! ",
  invitation: "0123456789abcdef0123456789abcdef0123456789abcdef",
};
const paddedUsername = "  " + fixture.username + "  ";
const paddedInvitation = "  " + fixture.invitation + "  ";
const messages = {
  login: "回归测试：账号或密码不正确",
  register: "回归测试：邀请码无效或已被使用",
};
const fields = (page) => ({
  username: page.locator('.ai-login input[name="username"]'),
  password: page.locator('.ai-login input[name="password"]'),
  invitation: page.locator('.ai-login input[name="invitation"]'),
});

async function waitValue(locator, expected) {
  await locator.waitFor({ state: "visible" });
  const deadline = Date.now() + 5000;
  while ((await locator.inputValue()) !== expected && Date.now() < deadline)
    await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(await locator.inputValue(), expected);
}
async function waitCount(getCount, expected) {
  const deadline = Date.now() + 5000;
  while (getCount() !== expected && Date.now() < deadline)
    await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(getCount(), expected);
}
async function installFixture(page, state) {
  state.requests = [];
  state.unexpected = [];
  state.authenticated = false;
  state.succeed = false;
  state.user = {
    id: "auth-fixture",
    username: fixture.username,
    role: "learner",
  };
  await page.route("**/*", async (route) => {
    const request = route.request();
    const method = request.method();
    const endpoint = new URL(request.url()).pathname.match(
      /\/api\/v1(\/.*)$/,
    )?.[1];
    if (!endpoint) {
      if (["GET", "HEAD"].includes(method)) return route.continue();
      state.unexpected.push({ method, path: new URL(request.url()).pathname });
      return route.abort("blockedbyclient");
    }
    let status = 200;
    let data;
    if (method === "GET" && endpoint === "/me") {
      status = state.authenticated ? 200 : 401;
      data = state.authenticated
        ? { user: state.user, enabled: true, csrf: "auth-fixture-csrf" }
        : { error: "请先登录 AI 学习空间" };
    } else if (method === "GET" && endpoint === "/content/manifest")
      data = { release: "1", schemaVersion: 1, bank };
    else if (method === "GET" && endpoint === "/usage")
      data = { consumed: 0, reserved: 0, limit: 300000 };
    else if (
      method === "GET" &&
      ["/conversations", "/my/questions", "/runs", "/notes"].includes(endpoint)
    )
      data = { items: [] };
    else if (
      method === "POST" &&
      ["/auth/login", "/auth/register"].includes(endpoint)
    ) {
      state.requests.push({ endpoint, body: request.postDataJSON() });
      if (state.succeed) {
        state.authenticated = true;
        data = { user: state.user, enabled: true, csrf: "auth-fixture-csrf" };
      } else {
        status = endpoint === "/auth/login" ? 401 : 400;
        data = {
          error:
            endpoint === "/auth/login" ? messages.login : messages.register,
        };
      }
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
  await page.goto(url);
  await fields(page).username.waitFor();
}
async function checkFieldSemantics(page, registering = false) {
  const input = fields(page);
  assert.equal(await input.username.getAttribute("autocomplete"), "username");
  assert.equal(
    await input.password.getAttribute("autocomplete"),
    registering ? "new-password" : "current-password",
  );
  for (const field of registering
    ? Object.values(input)
    : [input.username, input.password]) {
    assert.equal(await field.getAttribute("autocapitalize"), "none");
    assert.equal(await field.getAttribute("autocorrect"), "off");
    assert.equal(await field.getAttribute("spellcheck"), "false");
    const style = await field.evaluate((element) => {
      const css = getComputedStyle(element);
      return {
        font: parseFloat(css.fontSize),
        height: element.getBoundingClientRect().height,
      };
    });
    assert.ok(
      style.font >= 16,
      "Auth inputs must keep readable text size on mobile Safari",
    );
    assert.ok(
      style.height >= 44,
      "Auth input touch targets must be at least 44px",
    );
  }
  assert.equal(
    await page
      .getByRole("button", { name: "显示密码", exact: true })
      .getAttribute("type"),
    "button",
  );
}
async function nativeFill(page, values, eventMode) {
  await page.locator(".ai-login").evaluate(
    (form, input) => {
      for (const [name, value] of Object.entries(input.values)) {
        const element = form.elements.namedItem(name);
        if (!(element instanceof HTMLInputElement))
          throw new Error("Missing native auth input");
        Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value",
        ).set.call(element, value);
        if (input.eventMode === "change")
          element.dispatchEvent(new Event("change", { bubbles: true }));
      }
    },
    { values, eventMode },
  );
}
async function assertRequest(state, index, endpoint, registering = false) {
  await waitCount(() => state.requests.length, index + 1);
  assert.deepEqual(state.requests[index], {
    endpoint,
    body: {
      username: fixture.username,
      password: fixture.password,
      ...(registering ? { invitation: fixture.invitation } : {}),
    },
  });
}
async function checkGeometry(page) {
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    "Auth page must not overflow horizontally",
  );
  const toggle = page.getByRole("button", { name: /^(显示密码|隐藏密码)$/ });
  await toggle.scrollIntoViewIfNeeded();
  const target = await toggle.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const top = document.elementFromPoint(
      rect.x + rect.width / 2,
      rect.y + rect.height / 2,
    );
    return {
      width: rect.width,
      height: rect.height,
      insideViewport:
        rect.x >= 0 &&
        rect.right <= innerWidth &&
        rect.y >= 0 &&
        rect.bottom <= innerHeight,
      reachable: top === element || element.contains(top),
    };
  });
  assert.ok(
    target.width >= 44 &&
      target.height >= 44 &&
      target.insideViewport &&
      target.reachable,
    "Password toggle must be an unobstructed touch target",
  );
  const spacing = await fields(page).password.evaluate((element) => {
    const css = getComputedStyle(element);
    const toggle = element.parentElement
      .querySelector("button")
      .getBoundingClientRect();
    return parseFloat(css.paddingRight) >= toggle.width + 4;
  });
  assert.ok(
    spacing,
    "Password text must reserve space for its visibility toggle",
  );
}

async function checkFailures(page, state) {
  await enter(page);
  await checkFieldSemantics(page);
  await fields(page).username.fill(paddedUsername);
  await fields(page).password.fill(fixture.password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: messages.login }).waitFor();
  await assertRequest(state, 0, "/auth/login");
  await waitValue(fields(page).password, fixture.password);
  await page
    .getByRole("button", { name: "使用邀请码注册", exact: true })
    .click();
  assert.equal(
    await page.getByRole("alert").count(),
    0,
    "Switching auth mode clears the unrelated old error",
  );
  await waitValue(fields(page).password, fixture.password);
  await checkFieldSemantics(page, true);
  await fields(page).invitation.fill(paddedInvitation);
  await page.getByRole("button", { name: "创建账号", exact: true }).click();
  await page
    .getByRole("alert")
    .filter({ hasText: messages.register })
    .waitFor();
  await assertRequest(state, 1, "/auth/register", true);
  await waitValue(fields(page).password, fixture.password);
  await waitValue(fields(page).invitation, fixture.invitation);
  await page
    .getByRole("button", { name: "已有账号，去登录", exact: true })
    .click();
  assert.equal(await page.getByRole("alert").count(), 0);
  await page
    .getByRole("button", { name: "使用邀请码注册", exact: true })
    .click();
  await waitValue(fields(page).invitation, fixture.invitation);
  await checkGeometry(page);
  assert.equal(
    state.requests.length,
    2,
    "Mode switches and visibility controls do not submit auth requests",
  );
}

async function checkAutofill(page, state, eventMode) {
  await enter(page);
  await nativeFill(
    page,
    { username: paddedUsername, password: fixture.password },
    eventMode,
  );
  await waitValue(fields(page).password, fixture.password);
  await page.getByRole("button", { name: "显示密码", exact: true }).click();
  await page.waitForFunction(
    () =>
      document.querySelector('.ai-login input[name="password"]')?.type ===
      "text",
  );
  await waitValue(fields(page).password, fixture.password);
  await page.getByRole("button", { name: "隐藏密码", exact: true }).click();
  await page.waitForFunction(
    () =>
      document.querySelector('.ai-login input[name="password"]')?.type ===
      "password",
  );
  await waitValue(fields(page).password, fixture.password);
  assert.equal(state.requests.length, 0);
  await checkGeometry(page);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: messages.login }).waitFor();
  await assertRequest(state, 0, "/auth/login");
  await waitValue(fields(page).password, fixture.password);
  await page
    .getByRole("button", { name: "使用邀请码注册", exact: true })
    .click();
  await nativeFill(
    page,
    {
      username: paddedUsername,
      password: fixture.password,
      invitation: paddedInvitation,
    },
    eventMode,
  );
  // This submission deliberately skips visibility and mode actions after native fill.
  await page.getByRole("button", { name: "创建账号", exact: true }).click();
  await page
    .getByRole("alert")
    .filter({ hasText: messages.register })
    .waitFor();
  await assertRequest(state, 1, "/auth/register", true);
  await waitValue(fields(page).password, fixture.password);
  await waitValue(fields(page).invitation, fixture.invitation);
}

async function checkSuccess(page, state, registering) {
  await enter(page);
  if (registering)
    await page
      .getByRole("button", { name: "使用邀请码注册", exact: true })
      .click();
  await nativeFill(
    page,
    {
      username: paddedUsername,
      password: fixture.password,
      ...(registering ? { invitation: paddedInvitation } : {}),
    },
    "none",
  );
  state.succeed = true;
  await page
    .getByRole("button", {
      name: registering ? "创建账号" : "登录",
      exact: true,
    })
    .click();
  await assertRequest(
    state,
    0,
    registering ? "/auth/register" : "/auth/login",
    registering,
  );
  await page.getByRole("textbox", { name: "给 AI 发送消息" }).waitFor();
  assert.equal(await page.locator(".ai-login").count(), 0);
  assert.equal(await page.getByRole("alert").count(), 0);
  await page.reload();
  await page.getByRole("textbox", { name: "给 AI 发送消息" }).waitFor();
  assert.equal(await page.locator(".ai-login").count(), 0);
  assert.equal(
    state.requests.length,
    1,
    "Refreshing a session never replays registration or login",
  );
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );
}

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const chrome = "C:/Program Files/Google/Chrome/Application/chrome.exe";
  const executablePath =
    process.env.CHROME_PATH || (fs.existsSync(chrome) ? chrome : undefined);
  const browser = await (useWebKit ? webkit : chromium).launch({
    headless: true,
    ...(!useWebKit && executablePath ? { executablePath } : {}),
  });
  const results = [];
  try {
    for (const width of [320, 390, 1440]) {
      for (const test of [
        {
          name: "failed-auth-preserves-input-and-switch-clears-error",
          run: checkFailures,
        },
        {
          name: "native-autofill-without-events",
          run: (page, state) => checkAutofill(page, state, "none"),
        },
        {
          name: "native-autofill-with-change-only",
          run: (page, state) => checkAutofill(page, state, "change"),
        },
        {
          name: "successful-login-and-refresh",
          run: (page, state) => checkSuccess(page, state, false),
        },
        {
          name: "successful-registration-and-refresh",
          run: (page, state) => checkSuccess(page, state, true),
        },
      ]) {
        const context = await browser.newContext({
          viewport: { width, height: width < 500 ? 844 : 1000 },
          isMobile: width < 500,
          hasTouch: width < 500,
          serviceWorkers: "block",
          ...(width < 500
            ? {
                userAgent:
                  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
              }
            : {}),
        });
        const page = await context.newPage();
        page.setDefaultTimeout(15000);
        const state = {};
        const pageErrors = [],
          diagnostics = [];
        page.on("pageerror", (error) => pageErrors.push(error.message));
        page.on("requestfailed", (request) =>
          diagnostics.push({
            path: new URL(request.url()).pathname,
            error: request.failure()?.errorText,
          }),
        );
        await installFixture(page, state);
        try {
          await test.run(page, state);
          assert.deepEqual(
            state.unexpected,
            [],
            "All API calls are intercepted; unknown traffic is blocked",
          );
          assert.deepEqual(pageErrors, [], "No uncaught page exception");
          results.push({
            width,
            name: test.name,
            ok: true,
            authRequests: state.requests.length,
          });
        } catch (error) {
          const screenshot = path.join(
            output,
            `auth-${browserName}-${width}-${test.name}-failure.png`,
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
            requests: state.requests.map(({ endpoint, body }) => ({
              endpoint,
              usernameLength: body.username?.length,
              passwordLength: body.password?.length,
              invitationLength: body.invitation?.length,
            })),
            unexpected: state.unexpected,
            pageErrors,
            diagnostics,
            page: await page
              .evaluate(() => ({
                url: location.href,
                fields: [...document.querySelectorAll(".ai-login input")].map(
                  (element) => ({
                    name: element.name,
                    type: element.type,
                    length: element.value.length,
                    valid: element.validity.valid,
                  }),
                ),
                alerts: [...document.querySelectorAll('[role="alert"]')].map(
                  (element) => element.textContent,
                ),
                scrollWidth: document.documentElement.scrollWidth,
                viewportWidth: innerWidth,
              }))
              .catch(() => null),
          });
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
    browser: browserName,
    base: site.href,
    mockedApi: true,
    realAccountWrites: 0,
    modelCalls: 0,
    results,
  };
  fs.writeFileSync(
    path.join(output, `auth-${browserName}.json`),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
