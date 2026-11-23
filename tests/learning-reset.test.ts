import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { openDB } from "idb";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import {
  resetOldLearningRecords,
  RECORDS_RESET_MARKER,
  learningDatabaseName,
} from "../src/infrastructure/learning-storage";
import { emptyProgress, parseBackup } from "../src/domain/progress";

beforeEach(() => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    get length() {
      return values.size;
    },
    key: (index: number) => [...values.keys()][index] ?? null,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, String(value)),
    removeItem: (key: string) => values.delete(key),
  });
});
afterEach(() => vi.unstubAllGlobals());

async function seed(name: string, value: unknown) {
  const db = await openDB(name, 1, {
    upgrade(db) {
      db.createObjectStore("state");
    },
  });
  await db.put("state", value, "data");
  db.close();
}

describe("new learning record baseline", () => {
  it("deletes guest and account records while preserving all question caches and unrelated storage", async () => {
    await seed("interview-workbench-v2", { xp: 500, notes: "old" });
    await seed("interview-workbench-v2-user-1", { history: ["old"] });
    const questions = {
      public: [{ id: "public-q" }],
      personal: [{ id: "private-q" }],
    };
    await seed("zhixu-content-v1", questions);
    await seed("another-app", { value: "keep" });
    for (const key of [
      "quiz-game.progress.v1",
      "frontend-deep-review-2026-v1",
      "interview-workbench.v2.pending",
      "interview-workbench.v2.pending:user-1",
      "zhixu-ai-draft:user-1:old",
    ])
      localStorage.setItem(key, "retired");
    localStorage.setItem("zhixu-active-account", "user-1");
    localStorage.setItem("other-preference", "keep");

    await resetOldLearningRecords();

    const names = (await indexedDB.databases()).map((db) => db.name);
    expect(names).not.toContain("interview-workbench-v2");
    expect(names).not.toContain("interview-workbench-v2-user-1");
    expect(names).toContain("another-app");
    const content = await openDB("zhixu-content-v1");
    expect(await content.get("state", "data")).toEqual(questions);
    content.close();
    expect(localStorage.getItem("interview-workbench.v2.pending")).toBeNull();
    expect(localStorage.getItem("zhixu-ai-draft:user-1:old")).toBeNull();
    expect(localStorage.getItem("other-preference")).toBe("keep");
    expect(localStorage.getItem("zhixu-active-account")).toBe("user-1");
    expect(localStorage.getItem(RECORDS_RESET_MARKER)).toBe("done");
  });

  it("leaves new records intact on both first cleanup and later launches", async () => {
    const progress = emptyProgress();
    progress.dailyGoal = 30;
    progress.records["quiz:0:0"] = {
      status: "learning",
      attempts: 1,
      correct: 0,
      note: "新版笔记",
      draft: "新版草稿",
      bookmarked: true,
    };
    await seed(learningDatabaseName(), progress);
    await seed(learningDatabaseName("user-1"), progress);
    await resetOldLearningRecords();
    await resetOldLearningRecords();
    for (const name of [
      learningDatabaseName(),
      learningDatabaseName("user-1"),
    ]) {
      const db = await openDB(name);
      expect(await db.get("state", "data")).toEqual(progress);
      db.close();
    }
  });

  it("keeps cleanup retryable when an older tab blocks deletion", async () => {
    const blocker = await openDB("interview-workbench-v2", 1, {
      upgrade(db) {
        db.createObjectStore("state");
      },
    });
    await expect(resetOldLearningRecords()).rejects.toThrow("关闭其他知序页面");
    expect(localStorage.getItem(RECORDS_RESET_MARKER)).toBeNull();
    blocker.close();
    await vi.waitFor(async () =>
      expect((await indexedDB.databases()).map((db) => db.name)).not.toContain(
        "interview-workbench-v2",
      ),
    );
    await resetOldLearningRecords();
    expect(localStorage.getItem(RECORDS_RESET_MARKER)).toBe("done");
  });

  it("rejects retired backups instead of importing old learning state", () => {
    const old = {
      app: "interview-workbench",
      exportVersion: 1,
      progress: { ...emptyProgress(), version: 2, xp: 500 },
    };
    expect(() => parseBackup(JSON.stringify(old), new Set())).toThrow(
      "备份标识",
    );
  });
});
