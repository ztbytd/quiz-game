import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import {
  emptyProgress,
  emptyRecord,
  localDateKey,
  parseBackup,
  progressStats,
  reviewRecord,
  validateProgress,
} from "../src/domain/progress";
import {
  acquireWriterLease,
  createProgressRepository,
} from "../src/infrastructure/progress-repository";
import { PENDING_JOURNAL_KEY, useLearningStore } from "../src/stores/learning";
import type { ProgressSnapshot, StudySession } from "../src/domain/types";

const ids = new Set(["quiz:0:0", "quiz:0:1", "oral:loop:0", "oral:loop:1"]);
const now = new Date("2026-11-23T10:00:00+08:00");
const session: StudySession = {
  id: "s1",
  title: "测试",
  mode: "quiz",
  questionIds: ["quiz:0:0"],
  index: 0,
  answers: {},
  startedAt: now.toISOString(),
};
describe("review schedule and honest statistics", () => {
  it("schedules an incorrect answer for retry even if an easy grade is supplied", () => {
    const r = reviewRecord(emptyRecord(), "easy", now, false);
    expect(r.status).toBe("learning");
    expect(r.correct).toBe(0);
    expect(r.attempts).toBe(1);
    expect(Date.parse(r.nextReviewAt!) - now.getTime()).toBe(10 * 60 * 1000);
  });
  it("uses local calendar days for a daily streak and keeps yesterday alive", () => {
    const p = emptyProgress(),
      today = new Date(2026, 10, 23, 0, 10),
      yesterday = new Date(2026, 10, 22, 23, 50);
    p.activity[localDateKey(yesterday)] = 4;
    expect(progressStats(p, today).streak).toBe(1);
    expect(progressStats(p, today).todayCount).toBe(0);
    p.activity[localDateKey(today)] = 2;
    expect(progressStats(p, today).streak).toBe(2);
    expect(localDateKey(new Date(2026, 0, 2, 0, 1))).toBe("2026-01-02");
  });
  it("counts learned questions independently from raw number of attempts", () => {
    const p = emptyProgress();
    p.records["quiz:0:0"] = reviewRecord(
      reviewRecord(emptyRecord(), "again", now),
      "good",
      now,
    );
    p.xp = 12;
    expect(progressStats(p, now)).toMatchObject({
      answered: 1,
      mastered: 1,
      weak: 0,
      xp: 12,
      due: 0,
    });
  });
});

describe("backup validation", () => {
  it("round-trips balanced choice orders and rejects malformed permutations", () => {
    const p = emptyProgress();
    p.session = { ...session, optionOrders: { "quiz:0:0": [2, 0, 3, 1] } };
    expect(
      validateProgress(JSON.parse(JSON.stringify(p)), ids).session,
    ).toEqual(p.session);
    for (const order of [
      [0, 0, 2, 3],
      [0, 1, 2, 7],
      [-1, 0, 1, 2],
      [0, 1.5, 2, 3],
    ]) {
      p.session.optionOrders = { "quiz:0:0": order };
      expect(() => validateProgress(p, ids)).toThrow("选项顺序");
    }
    p.session.optionOrders = { "quiz:0:1": [0, 1, 2, 3] };
    expect(() => validateProgress(p, ids)).toThrow("选项顺序");
  });
  it("accepts a round trip and rejects bad records before changing caller state", () => {
    const original = emptyProgress();
    original.records["quiz:0:0"] = reviewRecord(emptyRecord(), "good", now);
    const payload = {
      app: "interview-workbench",
      exportVersion: 2,
      progress: original,
    };
    expect(parseBackup(JSON.stringify(payload), ids).progress).toEqual(
      original,
    );
    const broken = structuredClone(payload);
    broken.progress.records["quiz:0:0"].correct = 99;
    expect(() => parseBackup(JSON.stringify(broken), ids)).toThrow(
      "原有记录未被覆盖",
    );
    expect(original.records["quiz:0:0"].correct).toBe(1);
  });
  it("rejects dangling session IDs, invalid calendar dates and prototype-like evidence keys", () => {
    const p = emptyProgress();
    p.session = { ...session, questionIds: ["missing"] };
    expect(() => validateProgress(p, ids)).toThrow();
    p.session = null;
    p.activity["2026-02-31"] = 1;
    expect(() => validateProgress(p, ids)).toThrow();
    p.activity = {};
    p.evidence = JSON.parse('{"__proto__":"x"}');
    expect(() => validateProgress(p, ids)).toThrow();
  });
  it("rejects malformed and foreign JSON explicitly", () => {
    expect(() => parseBackup("{", ids)).toThrow("JSON");
    expect(() => parseBackup('{"app":"unrelated"}', ids)).toThrow("备份标识");
  });
});

describe("IndexedDB boundary", () => {
  it("serializes writes so an older queued snapshot cannot overwrite the latest", async () => {
    const repo = createProgressRepository("test-order-" + Math.random()),
      first = emptyProgress(),
      second = emptyProgress();
    first.xp = 10;
    second.xp = 20;
    await Promise.all([repo.save(first), repo.save(second)]);
    expect(((await repo.load()) as { xp: number }).xp).toBe(20);
  });
  it("rejects a stale revision arriving from another connection after a newer commit", async () => {
    const name = "test-revision-" + Math.random(),
      oldConnection = createProgressRepository(name),
      newConnection = createProgressRepository(name);
    const older = emptyProgress(),
      newer = emptyProgress();
    older.dailyGoal = 5;
    newer.dailyGoal = 20;
    await newConnection.save(newer, 200);
    await oldConnection.save(older, 100);
    expect(await oldConnection.loadState()).toMatchObject({
      revision: 200,
      progress: { dailyGoal: 20 },
    });
  });
  it("rejects unavailable browser storage rather than pretending a save worked", async () => {
    const open = vi.spyOn(indexedDB, "open").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    const repo = createProgressRepository("test-denied-" + Math.random());
    await expect(repo.save(emptyProgress())).rejects.toThrow("denied");
    open.mockRestore();
  });
});

describe("exclusive editing lease", () => {
  it("makes the second tab read-only until the editing window releases the lease", async () => {
    let held = false;
    const manager = {
      request: (
        _name: string,
        _options: unknown,
        callback: (lock: unknown) => Promise<void>,
      ) => {
        if (held) return Promise.resolve(callback(null));
        held = true;
        return Promise.resolve(
          callback({ name: "interview-workbench-v2-writer" }),
        ).finally(() => {
          held = false;
        });
      },
    } as unknown as Pick<LockManager, "request">;
    const first = await acquireWriterLease(manager),
      second = await acquireWriterLease(manager);
    expect(first.writable).toBe(true);
    expect(second.writable).toBe(false);
    first.release();
    await vi.waitFor(() => expect(held).toBe(false));
    const third = await acquireWriterLease(manager);
    expect(third.writable).toBe(true);
    third.release();
  });
  it("fails closed when the browser does not support the lock API", async () => {
    expect((await acquireWriterLease(undefined)).writable).toBe(false);
  });
});

describe("learning store import and completion", () => {
  beforeEach(async () => {
    setActivePinia(createPinia());
    const entries = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => entries.set(key, String(value)),
      removeItem: (key: string) => entries.delete(key),
    });
    await createProgressRepository().save(emptyProgress());
  });
  afterEach(async () => {
    const store = useLearningStore();
    await store.exportData();
    store.$dispose();
    vi.unstubAllGlobals();
  });
  it("leaves current learning records untouched after invalid import", async () => {
    const store = useLearningStore();
    await store.init();
    store.setNote("quiz:0:0", "保留我的笔记");
    await expect(store.importData('{"app":"bad"}')).rejects.toThrow();
    expect(store.getRecord("quiz:0:0").note).toBe("保留我的笔记");
  });
  it("upserts a completed session once and retains it for the recap screen", async () => {
    const store = useLearningStore();
    await store.init();
    const done = { ...session, index: 1, completedAt: now.toISOString() };
    store.saveSession(done);
    store.saveSession(done);
    expect(store.progress.history.filter((s) => s.id === "s1")).toHaveLength(1);
    expect(store.progress.session?.id).toBe("s1");
  });
  it("reports a failed persistence operation and retains the current in-memory draft for export", async () => {
    const store = useLearningStore();
    await store.init();
    const write = vi
      .spyOn(IDBObjectStore.prototype, "put")
      .mockImplementationOnce(() => {
        throw new DOMException("storage full", "QuotaExceededError");
      });
    store.setDraft("quiz:0:1", "写入失败也不能丢掉的草稿");
    await vi.waitFor(() =>
      expect(store.persistError).toContain("本机保存失败"),
    );
    expect(store.getRecord("quiz:0:1").draft).toBe("写入失败也不能丢掉的草稿");
    const exported = JSON.parse(await store.exportData());
    expect(exported.progress.records["quiz:0:1"].draft).toBe(
      "写入失败也不能丢掉的草稿",
    );
    write.mockRestore();
  });
  it("journals the latest change synchronously before IndexedDB can commit", async () => {
    const store = useLearningStore();
    await store.init();
    store.setGoal(20);
    expect(
      JSON.parse(localStorage.getItem(PENDING_JOURNAL_KEY)!).progress.dailyGoal,
    ).toBe(20);
    store.setNote("quiz:0:0", "刷新前的笔记");
    store.toggleBookmark("quiz:0:0");
    const immediate = JSON.parse(localStorage.getItem(PENDING_JOURNAL_KEY)!);
    expect(immediate.progress.records["quiz:0:0"]).toMatchObject({
      note: "刷新前的笔记",
      bookmarked: true,
    });
    await store.exportData();
    expect(localStorage.getItem(PENDING_JOURNAL_KEY)).toBeNull();
  });
  it("recovers an uncommitted journal after a reload and then removes it", async () => {
    const repo = createProgressRepository(),
      previous = await repo.loadState(),
      latest = emptyProgress();
    latest.dailyGoal = 20;
    latest.records["quiz:0:0"] = {
      ...emptyRecord(),
      note: "关闭前最后输入",
      bookmarked: true,
    };
    localStorage.setItem(
      PENDING_JOURNAL_KEY,
      JSON.stringify({
        version: 1,
        revision: previous.revision + 1,
        progress: latest,
      }),
    );
    const store = useLearningStore();
    await store.init();
    expect(store.progress.dailyGoal).toBe(20);
    expect(store.getRecord("quiz:0:0")).toMatchObject({
      note: "关闭前最后输入",
      bookmarked: true,
    });
    expect(await repo.load()).toEqual(latest);
    expect(localStorage.getItem(PENDING_JOURNAL_KEY)).toBeNull();
    expect(store.storageNotice).toContain("已恢复");
  });
  it("never lets a stale journal replace a newer committed backup import", async () => {
    const repo = createProgressRepository(),
      previous = await repo.loadState(),
      newer = emptyProgress(),
      older = emptyProgress();
    newer.dailyGoal = 40;
    older.dailyGoal = 5;
    await repo.save(newer, previous.revision + 2);
    localStorage.setItem(
      PENDING_JOURNAL_KEY,
      JSON.stringify({
        version: 1,
        revision: previous.revision + 1,
        progress: older,
      }),
    );
    const store = useLearningStore();
    await store.init();
    expect(store.progress.dailyGoal).toBe(40);
    expect(localStorage.getItem(PENDING_JOURNAL_KEY)).toBeNull();
  });
  it("does not clear a newer journal when an older queued write completes", async () => {
    const store = useLearningStore();
    await store.init();
    store.setGoal(20);
    const original = JSON.parse(localStorage.getItem(PENDING_JOURNAL_KEY)!);
    const pending = {
      ...original,
      revision: original.revision + 1,
      progress: { ...original.progress, dailyGoal: 30 },
    };
    localStorage.setItem(PENDING_JOURNAL_KEY, JSON.stringify(pending));
    await store.exportData();
    expect(JSON.parse(localStorage.getItem(PENDING_JOURNAL_KEY)!)).toEqual(
      pending,
    );
  });
  it("reports synchronous journal storage failure and keeps the unsaved state exportable", async () => {
    const store = useLearningStore();
    await store.init();
    const write = vi
      .spyOn(localStorage, "setItem")
      .mockImplementationOnce(() => {
        throw new DOMException("journal full", "QuotaExceededError");
      });
    store.setGoal(30);
    expect(store.persistError).toContain("journal full");
    const exported = JSON.parse(await store.exportData());
    expect(exported.progress.dailyGoal).toBe(30);
    expect(
      ((await createProgressRepository().load()) as ProgressSnapshot).dailyGoal,
    ).toBe(10);
    write.mockRestore();
  });
  it("loads records for export but does not allow a second browser tab to edit or import", async () => {
    const saved = emptyProgress();
    saved.dailyGoal = 40;
    await createProgressRepository().save(saved);
    vi.stubGlobal("window", {
      setInterval: () => 1,
      clearInterval: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
    });
    vi.stubGlobal("navigator", {
      locks: {
        request: (
          _name: unknown,
          _options: unknown,
          callback: (lock: null) => Promise<void>,
        ) => Promise.resolve(callback(null)),
      },
    });
    const store = useLearningStore();
    await store.init();
    expect(store.readOnly).toBe(true);
    expect(store.readonlyReason).toContain("已有窗口");
    store.setGoal(20);
    store.setNote("quiz:0:0", "不得写入");
    expect(store.progress.dailyGoal).toBe(40);
    expect(store.getRecord("quiz:0:0").note).toBe("");
    const exported = await store.exportData();
    expect(JSON.parse(exported).progress.dailyGoal).toBe(40);
    await expect(store.importData(exported)).rejects.toThrow("已有窗口");
    expect(localStorage.getItem(PENDING_JOURNAL_KEY)).toBeNull();
  });
  it("does not overwrite an unrecognized stored schema, and exports its raw data for recovery", async () => {
    const repo = createProgressRepository(),
      raw = { version: 88, privateNotes: "必须保留的旧值" };
    await repo.save(raw as unknown as ProgressSnapshot);
    const store = useLearningStore();
    await store.init();
    expect(store.persistError).toContain("已停止覆盖");
    store.setNote("quiz:0:0", "本次临时输入");
    expect(await repo.load()).toEqual(raw);
    const exported = JSON.parse(await store.exportData());
    expect(exported.unreadableStoredData).toEqual(raw);
    expect(exported.progress.records["quiz:0:0"].note).toBe("本次临时输入");
    await store.importData(
      JSON.stringify({
        app: "interview-workbench",
        exportVersion: 2,
        progress: emptyProgress(),
      }),
    );
    expect(store.persistError).toBe("");
  });
});
