const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const base = process.env.BASE_URL || "http://127.0.0.1:4176/quiz/";
(async () => {
  const bank = JSON.parse(
    await fs.readFile(path.join(__dirname, "../src/data/bank.json"), "utf8"),
  );
  const personal = {
    id: "q_preserved_personal",
    kind: "oral",
    prompt: "这是一道需要保留的个人练习题，如何实现请求幂等？",
    explanation:
      "通过唯一标识和原子状态更新控制请求，并在重复调用时返回同一个业务结果。",
    version: 1,
    origin: "ai-private",
  };
  const chrome =
    process.env.CHROME_PATH ||
    "C:/Program Files/Google/Chrome/Application/chrome.exe";
  const browser = await chromium.launch({
    headless: true,
    executablePath: chrome,
  });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(base);
    await page.locator(".daily-hero").waitFor();
    await page.evaluate(
      async ({ bank, personal }) => {
        const open = (name, store) =>
          new Promise((resolve, reject) => {
            const r = indexedDB.open(name, 1);
            r.onupgradeneeded = () => {
              if (!r.result.objectStoreNames.contains(store))
                r.result.createObjectStore(store);
            };
            r.onsuccess = () => resolve(r.result);
            r.onerror = () => reject(r.error);
          });
        const save = async (name, store, entries) => {
          const db = await open(name, store);
          await new Promise((resolve, reject) => {
            const tx = db.transaction(store, "readwrite");
            for (const [key, value] of entries)
              tx.objectStore(store).put(value, key);
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
          });
          db.close();
        };
        const old = {
          version: 2,
          records: {
            "quiz:0:0": {
              status: "mastered",
              attempts: 99,
              correct: 99,
              note: "旧笔记",
              draft: "旧草稿",
              bookmarked: true,
            },
          },
          session: null,
          history: [],
          evidence: { old: "旧项目记录" },
          code: { old: "旧代码草稿" },
          dailyGoal: 100,
          activity: { "2026-11-22": 99 },
          xp: 999,
        };
        await save("interview-workbench-v2", "state", [
          ["progress", old],
          ["revision", 100],
        ]);
        await save("interview-workbench-v2-old-account", "state", [
          ["progress", old],
        ]);
        await save("zhixu-content-v1", "content", [
          ["public", bank],
          ["personal:guest", [personal]],
        ]);
        localStorage.setItem(
          "interview-workbench.v2.pending",
          JSON.stringify({ version: 1, revision: 200, progress: old }),
        );
        localStorage.setItem(
          "quiz-game.progress.v1",
          JSON.stringify({ xp: 999 }),
        );
        localStorage.setItem(
          "frontend-deep-review-2026-v1",
          JSON.stringify({ notes: { old: "旧笔记" } }),
        );
        localStorage.removeItem("zhixu-learning.v3.reset-complete");
      },
      { bank, personal },
    );
    await page.reload();
    await page.locator(".daily-hero").waitFor();
    const state = await page.evaluate(async () => {
      const db = await new Promise((resolve, reject) => {
        const r = indexedDB.open("zhixu-content-v1");
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      const get = (key) =>
        new Promise((resolve, reject) => {
          const tx = db.transaction("content");
          const r = tx.objectStore("content").get(key);
          r.onsuccess = () => resolve(r.result);
          r.onerror = () => reject(r.error);
        });
      const publicBank = await get("public"),
        personal = await get("personal:guest");
      db.close();
      return {
        names: (await indexedDB.databases()).map((d) => d.name),
        marker: localStorage.getItem("zhixu-learning.v3.reset-complete"),
        journal: localStorage.getItem("interview-workbench.v2.pending"),
        old: localStorage.getItem("quiz-game.progress.v1"),
        publicBank,
        personal,
      };
    });
    assert.equal(state.marker, "done");
    assert.equal(state.journal, null);
    assert.equal(state.old, null);
    assert.ok(!state.names.includes("interview-workbench-v2"));
    assert.ok(!state.names.includes("interview-workbench-v2-old-account"));
    assert.deepEqual(state.publicBank, bank);
    assert.deepEqual(state.personal, [personal]);
    await page.goto(base + "#/profile");
    await page.locator(".goal-options").waitFor();
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "导出学习备份" }).click();
    const backup = JSON.parse(
      await fs.readFile(await (await download).path(), "utf8"),
    );
    assert.equal(backup.exportVersion, 2);
    assert.equal(backup.progress.version, 3);
    assert.equal(backup.progress.xp, 0);
    assert.deepEqual(backup.progress.records, {});
    assert.deepEqual(backup.progress.history, []);
    assert.equal(backup.progress.dailyGoal, 10);
    assert.ok(backup.personalQuestions.some((q) => q.id === personal.id));
    await page
      .locator(".goal-options button")
      .filter({ hasText: "20" })
      .click();
    await page.reload();
    await page.locator(".goal-options").waitFor();
    const again = page.waitForEvent("download");
    await page.getByRole("button", { name: "导出学习备份" }).click();
    const saved = JSON.parse(
      await fs.readFile(await (await again).path(), "utf8"),
    );
    assert.equal(saved.progress.dailyGoal, 20);
    await page.goto(base + "#/practice?question=" + personal.id);
    await page.locator("#response").waitFor();
    assert.match(
      await page.locator(".question-prompt").innerText(),
      /保留的个人练习题/,
    );
    console.log(
      JSON.stringify({
        oldRecordsDeleted: true,
        publicQuestions: bank.questions.length,
        personalQuestionsPreserved: true,
        newRecordsSurviveReload: true,
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
