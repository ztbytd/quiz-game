import { computed, onScopeDispose, ref } from "vue";
import { defineStore } from "pinia";
import { questionById } from "@/data/content";
import type { Grade, ProgressSnapshot, StudySession } from "@/domain/types";
import {
  emptyProgress,
  emptyRecord,
  localDateKey,
  migrateLegacy,
  parseBackup,
  progressStats,
  reviewRecord,
  validateProgress,
  LEGACY_QUIZ_KEY,
  LEGACY_PRACTICE_KEY,
  type LegacyBackup,
} from "@/domain/progress";
import {
  acquireWriterLease,
  createProgressRepository,
  type WriterLease,
} from "@/infrastructure/progress-repository";

export const PENDING_JOURNAL_KEY = "interview-workbench.v2.pending";
interface PendingJournal {
  version: 1;
  revision: number;
  progress: ProgressSnapshot;
}

export const useLearningStore = defineStore("learning", () => {
  const progress = ref(emptyProgress()),
    ready = ref(false),
    persistError = ref(""),
    migrationNotice = ref("");
  const readOnly = ref(false),
    readonlyReason = ref("");
  const ids = new Set(questionById.keys()),
    repository = createProgressRepository();
  let initializing: Promise<void> | undefined,
    backup: LegacyBackup | undefined,
    importing = false;
  let unreadableStoredData: unknown,
    unreadableJournal: string | undefined,
    recoveryRequired = false;
  let revision = 0,
    lease: WriterLease | undefined;
  const copy = () =>
    JSON.parse(JSON.stringify(progress.value)) as ProgressSnapshot;
  const clock = ref(new Date()),
    updateClock = () => {
      clock.value = new Date();
    };
  const timer =
    typeof window !== "undefined"
      ? window.setInterval(updateClock, 60000)
      : undefined;
  function releaseWriter() {
    if (lease?.writable) {
      readOnly.value = true;
      readonlyReason.value = "此窗口已暂停编辑，请刷新后继续。";
      lease.release();
      lease = undefined;
    }
  }
  if (typeof document !== "undefined")
    document.addEventListener("visibilitychange", updateClock);
  if (typeof window !== "undefined")
    window.addEventListener("pagehide", releaseWriter);
  onScopeDispose(() => {
    releaseWriter();
    if (timer !== undefined) window.clearInterval(timer);
    if (typeof document !== "undefined")
      document.removeEventListener("visibilitychange", updateClock);
    if (typeof window !== "undefined")
      window.removeEventListener("pagehide", releaseWriter);
  });
  const stats = computed(() => progressStats(progress.value, clock.value));
  const records = computed(() => progress.value.records);
  const ensureRecord = (id: string) => {
    if (!ids.has(id)) throw new Error("题目不存在");
    return (progress.value.records[id] ??= emptyRecord());
  };
  const getRecord = (id: string) => progress.value.records[id] || emptyRecord();
  function report(error: unknown) {
    persistError.value =
      "本机保存失败，请导出备份后重试。" +
      (error instanceof Error ? " " + error.message : "");
  }
  const nextRevision = () => (revision = Math.max(revision + 1, Date.now()));
  function readJournal(): PendingJournal | undefined {
    const raw = localStorage.getItem(PENDING_JOURNAL_KEY);
    if (!raw) return;
    try {
      const value = JSON.parse(raw) as PendingJournal;
      if (
        value.version !== 1 ||
        !Number.isSafeInteger(value.revision) ||
        value.revision < 1
      )
        throw new Error("journal version");
      return {
        version: 1,
        revision: value.revision,
        progress: validateProgress(value.progress, ids),
      };
    } catch (error) {
      unreadableJournal = raw;
      throw error;
    }
  }
  function clearJournal(committedRevision: number) {
    const raw = localStorage.getItem(PENDING_JOURNAL_KEY);
    if (!raw) return;
    const pending = JSON.parse(raw) as PendingJournal;
    if (pending.version === 1 && pending.revision <= committedRevision)
      localStorage.removeItem(PENDING_JOURNAL_KEY);
  }
  function persist() {
    if (recoveryRequired || readOnly.value) return;
    const snapshot = copy(),
      current = nextRevision();
    try {
      localStorage.setItem(
        PENDING_JOURNAL_KEY,
        JSON.stringify({
          version: 1,
          revision: current,
          progress: snapshot,
        } satisfies PendingJournal),
      );
    } catch (error) {
      report(error);
      return;
    }
    void repository
      .save(snapshot, undefined, current)
      .then(() => {
        clearJournal(current);
        if (current === revision) persistError.value = "";
      })
      .catch(report);
  }
  function legacy(): LegacyBackup {
    try {
      return {
        quiz: localStorage.getItem(LEGACY_QUIZ_KEY),
        practice: localStorage.getItem(LEGACY_PRACTICE_KEY),
        capturedAt: new Date().toISOString(),
      };
    } catch {
      return {
        quiz: null,
        practice: null,
        capturedAt: new Date().toISOString(),
      };
    }
  }
  async function init() {
    if (initializing) return initializing;
    initializing = (async () => {
      lease =
        typeof window === "undefined"
          ? { writable: true, release() {} }
          : await acquireWriterLease(navigator.locks);
      readOnly.value = !lease.writable;
      if (readOnly.value)
        readonlyReason.value = navigator.locks
          ? "已有窗口正在编辑，请关闭原窗口后刷新。"
          : "当前浏览器不支持安全的多窗口保存，请使用新版 Chrome、Edge 或 Safari。";
      try {
        const stored = await repository.loadState();
        revision = stored.revision;
        let pending: PendingJournal | undefined;
        try {
          pending = readJournal();
        } catch {
          recoveryRequired = true;
          persistError.value =
            "待保存记录无法识别，已停止覆盖。请先导出备份，再导入有效备份恢复。";
        }
        if (pending && pending.revision > stored.revision) {
          progress.value = pending.progress;
          revision = pending.revision;
          if (!readOnly.value) {
            await repository.save(copy(), undefined, pending.revision);
            clearJournal(pending.revision);
            migrationNotice.value = "已恢复上次关闭页面前的最新学习记录。";
          }
        } else if (stored.progress) {
          try {
            progress.value = validateProgress(stored.progress, ids);
            if (pending && !readOnly.value) clearJournal(stored.revision);
          } catch {
            unreadableStoredData = stored.progress;
            recoveryRequired = true;
            persistError.value =
              "本机记录格式无法识别，已停止覆盖。请先导出备份，再导入有效备份恢复。当前输入仍可随备份导出。";
          }
        } else {
          backup = legacy();
          progress.value = migrateLegacy(backup, ids);
          if (!readOnly.value && !recoveryRequired)
            await repository.save(copy(), backup, nextRevision());
          if (backup.quiz || backup.practice)
            migrationNotice.value =
              "已保留并迁移旧版错题、笔记和练习记录。旧版原始数据也包含在导出备份中。";
        }
      } catch (error) {
        if (
          !Object.keys(progress.value.records).length &&
          !progress.value.session
        ) {
          backup = legacy();
          if (!revision) progress.value = migrateLegacy(backup, ids);
        }
        report(error);
      } finally {
        ready.value = true;
      }
    })();
    return initializing;
  }
  const editable = () => {
    if (readOnly.value) {
      persistError.value = readonlyReason.value;
      return false;
    }
    if (importing) {
      persistError.value = "正在导入备份，请稍后再编辑。";
      return false;
    }
    return true;
  };
  function grade(id: string, value: Grade, correct?: boolean) {
    if (!editable()) return;
    const now = new Date(),
      before = ensureRecord(id);
    progress.value.records[id] = reviewRecord(before, value, now, correct);
    const day = localDateKey(now);
    progress.value.activity[day] = (progress.value.activity[day] || 0) + 1;
    progress.value.xp +=
      correct === false || value === "again" ? 2 : value === "easy" ? 15 : 10;
    persist();
  }
  function setNote(id: string, text: string) {
    if (!editable()) return;
    ensureRecord(id).note = text;
    persist();
  }
  function setDraft(id: string, text: string) {
    if (!editable()) return;
    ensureRecord(id).draft = text;
    persist();
  }
  function toggleBookmark(id: string) {
    if (!editable()) return;
    const r = ensureRecord(id);
    r.bookmarked = !r.bookmarked;
    persist();
  }
  function saveSession(session: StudySession | null) {
    if (!editable()) return;
    if (session) {
      const candidate = JSON.parse(JSON.stringify(session)) as StudySession;
      if (candidate.questionIds.some((id) => !ids.has(id)))
        throw new Error("练习包含无效题目");
      if (candidate.completedAt) {
        const index = progress.value.history.findIndex(
          (s) => s.id === candidate.id,
        );
        if (index === -1) progress.value.history.unshift(candidate);
        else progress.value.history[index] = candidate;
        progress.value.history = progress.value.history.slice(0, 500);
      }
      progress.value.session = candidate;
    } else progress.value.session = null;
    persist();
  }
  function setEvidence(id: string, text: string) {
    if (!editable()) return;
    if (!["__proto__", "constructor", "prototype"].includes(id)) {
      progress.value.evidence[id] = text;
      persist();
    }
  }
  function saveCode(id: string, text: string) {
    if (!editable()) return;
    if (!["__proto__", "constructor", "prototype"].includes(id)) {
      progress.value.code[id] = text;
      persist();
    }
  }
  function setGoal(goal: number) {
    if (!editable()) return;
    if (!Number.isInteger(goal) || goal < 1 || goal > 100)
      throw new Error("每日目标须在 1～100 题之间");
    progress.value.dailyGoal = goal;
    persist();
  }
  async function exportData() {
    await repository.flush().catch(() => {});
    const legacyBackup =
      backup || (await repository.legacyBackup().catch(() => undefined));
    return JSON.stringify(
      {
        app: "interview-workbench",
        exportVersion: 1,
        exportedAt: new Date().toISOString(),
        progress: copy(),
        ...(legacyBackup ? { legacyBackup } : {}),
        ...(unreadableStoredData !== undefined ? { unreadableStoredData } : {}),
        ...(unreadableJournal ? { unreadableJournal } : {}),
      },
      null,
      2,
    );
  }
  async function importData(text: string) {
    const validated = parseBackup(text, ids);
    if (!editable())
      throw new Error(readOnly.value ? readonlyReason.value : "正在导入备份");
    importing = true;
    try {
      const current = nextRevision();
      await repository.save(validated.progress, validated.legacy, current);
      progress.value = validated.progress;
      recoveryRequired = false;
      unreadableStoredData = undefined;
      unreadableJournal = undefined;
      try {
        localStorage.removeItem(PENDING_JOURNAL_KEY);
      } catch {
        /* IDB revision protects against stale recovery. */
      }
      if (validated.legacy) backup = validated.legacy;
      persistError.value = "";
      migrationNotice.value = "备份已导入，学习记录已恢复。";
    } catch (error) {
      report(error);
      throw error;
    } finally {
      importing = false;
    }
  }
  return {
    progress,
    records,
    ready,
    persistError,
    migrationNotice,
    readOnly,
    readonlyReason,
    stats,
    init,
    getRecord,
    grade,
    setNote,
    setDraft,
    toggleBookmark,
    saveSession,
    setEvidence,
    saveCode,
    setGoal,
    exportData,
    importData,
  };
});
