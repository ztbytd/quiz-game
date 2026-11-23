const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const bank = require("../src/data/bank.json");
const base = process.env.BASE_URL || "http://127.0.0.1:4176/quiz/";
(async () => {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROME_PATH
      ? { executablePath: process.env.CHROME_PATH }
      : {}),
  });
  try {
    const page = await browser.newPage({
        viewport: { width: 1440, height: 1000 },
      }),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await fs.mkdir("test-results", { recursive: true });
    await page.goto(base + "#/library");
    await page.locator(".topic-tile").first().waitFor();
    await page.locator(".topic-tile").filter({ hasText: "文件上传" }).click();
    await page.locator(".chapter").first().waitFor();
    assert.equal(await page.locator(".chapter").count(), 6);
    assert.match(await page.locator(".topic-overview").innerText(), /26/);
    await page.locator(".chapter summary").first().click();
    assert.equal(
      await page.locator(".chapter").first().locator("li").count(),
      4,
    );
    await page.screenshot({
      path: "test-results/topic-curriculum-desktop.png",
      fullPage: true,
    });
    await page
      .locator(".chapter")
      .first()
      .getByRole("link", { name: "练习本章" })
      .click();
    await page.locator(".question-prompt").waitFor();
    assert.match(await page.locator(".question-counter").innerText(), /1 \/ 4/);
    await page.goto(base + "#/topics/7");
    await page
      .locator(".chapter")
      .nth(1)
      .getByRole("link", { name: "练习本章" })
      .click();
    await page.locator("#response").waitFor();
    const chapter = bank.topics.find((t) => t.id === "7").sections[1];
    assert.equal(
      await page.locator(".question-prompt").innerText(),
      bank.questions.find((q) => q.id === chapter.questionIds[0]).prompt,
    );
    assert.equal(
      await page.locator(".resume-banner").count(),
      0,
      "different chapter must not resume old foundation session",
    );

    await page.goto(base + "#/practice?topic=0&section=foundation");
    await page.locator(".choice").first().waitFor();
    const before = await page.locator(".choice").allTextContents();
    const first = bank.questions.find((q) => q.id === "quiz:0:0");
    await page
      .locator(".choice")
      .filter({ hasText: first.choices[first.correctAnswer] })
      .click();
    await page
      .getByRole("button", { name: "提交并查看解析", exact: true })
      .click();
    assert.match(
      await page.locator(".answer-feedback").innerText(),
      /回答正确/,
    );
    assert.equal(
      await page.locator(".answer-content .answer-text").innerText(),
      first.explanation,
    );
    assert.equal(
      await page.locator(".answer-content details[open]").count(),
      0,
    );
    await page
      .locator(".answer-content summary")
      .filter({ hasText: "实现代码" })
      .click();
    assert.ok(await page.locator(".answer-content pre").isVisible());
    await page.reload();
    await page.locator(".answer-feedback").waitFor();
    assert.deepEqual(await page.locator(".choice").allTextContents(), before);
    await page.goto(base + "#/profile");
    const downloadEvent = page.waitForEvent("download");
    await page.getByRole("button", { name: "导出学习备份" }).click();
    const payload = JSON.parse(
      await fs.readFile(await (await downloadEvent).path(), "utf8"),
    );
    const session = payload.progress.session,
      positions = [0, 0, 0, 0];
    for (const [id, order] of Object.entries(session.optionOrders)) {
      const question = bank.questions.find((q) => q.id === id);
      positions[order.indexOf(question.correctAnswer)]++;
    }
    assert.ok(Math.max(...positions) - Math.min(...positions) <= 1);
    await page
      .getByLabel("选择学习备份文件")
      .setInputFiles({
        name: "roundtrip.json",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(payload)),
      });
    await page.getByRole("button", { name: "确认导入并替换" }).click();
    await page
      .getByText("备份已导入，学习记录已更新。", { exact: true })
      .waitFor();
    await page.goto(base + "#/practice?resume=1");
    await page.locator(".answer-feedback").waitFor();
    assert.deepEqual(await page.locator(".choice").allTextContents(), before);

    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(base + "#/topics/18");
      await page.locator(".chapter").last().waitFor();
      await page.locator(".chapter").last().locator("summary").click();
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      );
      if (width === 390)
        await page.screenshot({
          path: "test-results/topic-curriculum-mobile.png",
          fullPage: true,
        });
      await page.locator(".chapter").last().locator("li a").first().click();
      await page
        .locator("#response")
        .fill("检索文档属于不可信输入，工具执行前重新做身份、资源和操作授权。");
      await page
        .getByRole("button", { name: "提交并查看解析", exact: true })
        .click();
      await page.locator(".answer-content").waitFor();
      assert.ok((await page.locator(".answer-text").innerText()).length >= 100);
      await page.locator(".answer-content details summary").first().click();
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      );
      if (width === 390)
        await page.evaluate(() => scrollTo(0, 0));
      if (width === 390)
        await page.screenshot({
          path: "test-results/answer-quality-mobile.png",
          fullPage: true,
        });
    }
    await page.goto(base + "#/library?q=原型污染");
    await page.locator(".question-result").first().waitFor();
    assert.match(
      await page.locator(".question-results").innerText(),
      /外部 JSON/,
    );
    assert.deepEqual(errors, []);
    console.log(
      "Quality flows passed: curriculum, isolated chapters, balanced options, refresh/backup stability, answer disclosure, search and 390/768/1440px layouts.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
