const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");

// Run against a production build served by `npm run preview -- --port 4176`.
const base = process.env.BASE_URL || "http://127.0.0.1:4176/quiz/";
const output = path.resolve("test-results");
(async () => {
  await fs.mkdir(output, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROME_PATH
      ? { executablePath: process.env.CHROME_PATH }
      : {}),
  });
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(base);
    await page.locator(".daily-hero").waitFor();
    assert.match(await page.title(), /学习工作台/);
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await page.locator(".daily-hero").waitFor();
    assert.ok(
      await page.evaluate(() => !!navigator.serviceWorker.controller),
      "SW must control production app",
    );
    const manifest = await page.evaluate(
      async () => await (await fetch("manifest.webmanifest")).json(),
    );
    assert.equal(manifest.scope, "/quiz/");
    assert.equal(manifest.display, "standalone");
    for (const size of [192, 512])
      assert.ok(
        manifest.icons.some((icon) => icon.sizes === `${size}x${size}`),
      );
    await page.screenshot({
      path: path.join(output, "home-desktop.png"),
      fullPage: true,
    });
    await page.goto(base + "#/library");
    await page.locator(".topic-tile").first().waitFor();
    assert.equal(await page.locator(".topic-tile").count(), 31);
    assert.equal(await page.locator(".side-nav a.selected").count(), 1);
    assert.equal(
      await page.locator(".side-nav a.selected").innerText(),
      "专题题库",
    );
    await page
      .getByRole("searchbox", { name: "搜索题目和解析" })
      .fill("Promise");
    await page.locator(".question-result").first().waitFor();
    await page.goto(base + "#/practice?question=quiz:0:0");
    await page.locator(".choice").first().waitFor();
    await page.locator(".choice").first().click();
    await page.getByRole("button", { name: "提交并查看解析" }).click();
    await page.getByRole("region", { name: "参考答案" }).waitFor();
    await page.getByRole("button", { name: "我的笔记" }).click();
    await page
      .locator(".note-editor textarea")
      .fill("立即刷新也保留的笔记 <script>literal</script>");
    await page.getByRole("button", { name: "收藏这题" }).click();
    await page.reload();
    // A direct question URL starts a new attempt; bookmark and notes are record-level.
    await page.getByRole("button", { name: "已收藏" }).waitFor();
    await page.getByRole("button", { name: "我的笔记" }).click();
    assert.match(
      await page.locator(".note-editor textarea").inputValue(),
      /立即刷新/,
    );
    await page.goto(base + "#/profile");
    await page.locator(".goal-options").waitFor();
    await page
      .locator(".goal-options button")
      .filter({ hasText: "20" })
      .click();
    await page.reload();
    await page.locator(".goal-options button.active").waitFor();
    assert.match(
      await page.locator(".goal-options button.active").innerText(),
      /20/,
    );
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "导出学习备份" }).click();
    const download = await downloadPromise;
    const backup = JSON.parse(await fs.readFile(await download.path(), "utf8"));
    assert.equal(backup.progress.dailyGoal, 20);
    assert.equal(backup.progress.records["quiz:0:0"].bookmarked, true);
    await page
      .getByLabel("选择学习备份文件")
      .setInputFiles({
        name: "invalid.json",
        mimeType: "application/json",
        buffer: Buffer.from("{broken"),
      });
    await page.getByRole("button", { name: "确认导入并替换" }).click();
    await page.locator(".backup-error").waitFor();
    assert.match(
      await page.locator(".goal-options button.active").innerText(),
      /20/,
    );
    const second = await context.newPage();
    await second.goto(base + "#/practice?mode=daily");
    await second.locator(".readonly-view").waitFor();
    assert.match(
      await second.locator(".readonly-view").innerText(),
      /已有窗口正在编辑/,
    );
    assert.equal(await second.locator(".question-panel").count(), 0);
    await second.close();
    await context.setOffline(true);
    for (const route of [
      "library",
      "resume",
      "review",
      "profile",
      "practice?mode=mock",
    ]) {
      await page.goto(base + "#/" + route);
      await page.locator(".loading-view").waitFor({ state: "detached" });
      await page.locator(".connection-banner").waitFor();
      assert.ok(
        (await page.locator("#main-content").innerText()).length > 80,
        `offline ${route}`,
      );
    }
    await page.locator("#response").fill("离线模拟面试回答");
    await page.getByRole("button", { name: "记录并继续" }).click();
    await page.reload();
    await page.locator(".question-counter").waitFor();
    assert.match(
      await page.locator(".question-counter").innerText(),
      /2 \/ 12/,
    );
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const route of [
        "",
        "library",
        "practice?resume=1",
        "review",
        "profile",
        "resume",
      ]) {
        await page.goto(base + "#/" + route);
        await page.locator(".loading-view").waitFor({ state: "detached" });
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
          `${width}px overflow ${route}`,
        );
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(base);
    await page.locator(".daily-hero").waitFor();
    await page.screenshot({
      path: path.join(output, "home-mobile.png"),
      fullPage: true,
    });
    assert.deepEqual(errors, []);
    await context.close();
    const migration = await browser.newContext();
    await migration.addInitScript(() => {
      if (!localStorage.getItem("test-seeded")) {
        localStorage.setItem(
          "quiz-game.progress.v1",
          JSON.stringify({ xp: 140, mistakes: { "0:0": true } }),
        );
        localStorage.setItem(
          "frontend-deep-review-2026-v1",
          JSON.stringify({
            notes: { "loop:0": "旧版笔记" },
            grades: { "loop:0": "weak" },
          }),
        );
        localStorage.setItem("test-seeded", "1");
      }
    });
    const old = await migration.newPage();
    await old.goto(base + "#/profile");
    await old.locator(".goal-options").waitFor();
    const oldDownload = old.waitForEvent("download");
    await old.getByRole("button", { name: "导出学习备份" }).click();
    const migrated = JSON.parse(
      await fs.readFile(await (await oldDownload).path(), "utf8"),
    );
    assert.equal(migrated.progress.xp, 140);
    assert.equal(migrated.progress.records["quiz:0:0"].status, "learning");
    assert.equal(migrated.progress.records["oral:loop:0"].note, "旧版笔记");
    assert.ok(migrated.legacyBackup.quiz);
    assert.ok(
      await old.evaluate(() => localStorage.getItem("quiz-game.progress.v1")),
    );
    await migration.close();
    console.log(
      "Production browser checks passed: PWA, offline routes, persistence, migration, search, backup, 390/768/1440px layouts.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
