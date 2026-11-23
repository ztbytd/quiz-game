import { computed, onScopeDispose, ref } from "vue";
import { defineStore } from "pinia";
import {
  questionById,
  knownQuestionIds,
  restoreContent,
  addPersonal,
  validateBank,
} from "@/data/content";
import type { Grade, ProgressSnapshot, StudySession } from "@/domain/types";
import {
  emptyProgress,
  emptyRecord,
  localDateKey,
  parseBackup,
  progressStats,
  reviewRecord,
  validateProgress,
} from "@/domain/progress";
import {
  acquireWriterLease,
  createProgressRepository,
  type WriterLease,
} from "@/infrastructure/progress-repository";

import {
  PENDING_JOURNAL_KEY,
  learningDatabaseName,
  resetOldLearningRecords,
} from "../infrastructure/learning-storage";
export { PENDING_JOURNAL_KEY } from "../infrastructure/learning-storage";
interface PendingJournal {
  version: 1;
  revision: number;
  progress: ProgressSnapshot;
}

export const useLearningStore = defineStore("learning", () => {
  const progress = ref(emptyProgress()),
    ready = ref(false),
    persistError = ref(""),
    storageNotice = ref("");
  const readOnly = ref(false),
    readonlyReason = ref("");
  const ids = knownQuestionIds;
  const accountId = ref(
    typeof localStorage === "undefined"
      ? ""
      : localStorage.getItem("zhixu-active-account") || "",
  );
  let repository = createProgressRepository(
    learningDatabaseName(accountId.value),
  );
  let pendingJournalKey = accountId.value
    ? `${PENDING_JOURNAL_KEY}:${accountId.value}`
    : PENDING_JOURNAL_KEY;
  let initializing: Promise<void> | undefined,
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
    const raw = localStorage.getItem(pendingJournalKey);
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
    const raw = localStorage.getItem(pendingJournalKey);
    if (!raw) return;
    const pending = JSON.parse(raw) as PendingJournal;
    if (pending.version === 1 && pending.revision <= committedRevision)
      localStorage.removeItem(pendingJournalKey);
  }
  function persist() {
    if (recoveryRequired || readOnly.value) return;
    const snapshot = copy(),
      current = nextRevision();
    try {
      localStorage.setItem(
        pendingJournalKey,
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
      .save(snapshot, current)
      .then(() => {
        clearJournal(current);
        if (current === revision) persistError.value = "";
      })
      .catch(report);
  }
  async function init() {
    if (initializing) return initializing;
    initializing = (async () => {
      await restoreContent().catch(() => {});
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
        if (!readOnly.value) await resetOldLearningRecords();
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
            await repository.save(copy(), pending.revision);
            clearJournal(pending.revision);
            storageNotice.value = "已恢复上次关闭页面前的最新学习记录。";
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
          progress.value = emptyProgress();
          if (!readOnly.value && !recoveryRequired)
            await repository.save(copy(), nextRevision());
        }
      } catch (error) {
        if (
          !Object.keys(progress.value.records).length &&
          !progress.value.session
        ) {
          if (!revision) progress.value = emptyProgress();
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
    return JSON.stringify(
      {
        app: "interview-workbench",
        exportVersion: 2,
        personalQuestions: [...questionById.values()].filter(
          (q) => q.origin === "ai-private",
        ),
        exportedAt: new Date().toISOString(),
        progress: copy(),
        ...(unreadableStoredData !== undefined ? { unreadableStoredData } : {}),
        ...(unreadableJournal ? { unreadableJournal } : {}),
      },
      null,
      2,
    );
  }
  async function importData(text: string) {
    if (text.length > 12_000_000)
      throw new Error("备份文件过大，请使用应用导出的 JSON 文件");
    const payload = JSON.parse(text);
    const importIds = new Set(ids);
    if (Array.isArray(payload.personalQuestions)) {
      validateBank({
        schemaVersion: 1,
        questions: payload.personalQuestions,
        topics: [],
        groups: [],
        chains: [],
      });
      for (const q of payload.personalQuestions) importIds.add(q.id);
    }
    const validated = parseBackup(text, importIds);
    if (!editable())
      throw new Error(readOnly.value ? readonlyReason.value : "正在导入备份");
    importing = true;
    try {
      const current = nextRevision();
      if (Array.isArray(payload.personalQuestions)) {
        const questions = payload.personalQuestions.map((q: any) => ({
          ...q,
          origin: "ai-private",
        }));
        const { cachePersonal } =
          await import("../infrastructure/content-repository");
        await cachePersonal(questions);
      }
      await repository.save(validated.progress, current);
      if (Array.isArray(payload.personalQuestions))
        addPersonal(
          payload.personalQuestions.map((q: any) => ({
            ...q,
            origin: "ai-private",
          })),
        );
      progress.value = validated.progress;
      recoveryRequired = false;
      unreadableStoredData = undefined;
      unreadableJournal = undefined;
      try {
        localStorage.removeItem(pendingJournalKey);
      } catch {
        /* IDB revision protects against stale recovery. */
      }
      persistError.value = "";
      storageNotice.value = "备份已导入，学习记录已恢复。";
    } catch (error) {
      report(error);
      throw error;
    } finally {
      importing = false;
    }
  }
  async function switchAccount(next: string) {
    if (accountId.value === next) return;
    await repository.flush();
    const { cachedContent } =
      await import("../infrastructure/content-repository");
    const cached = await cachedContent(next || "guest");
    if (cached.personal) addPersonal(cached.personal);
    const nextRepo = createProgressRepository(learningDatabaseName(next));
    const state = await nextRepo.loadState();
    const beforeJournal = pendingJournalKey;
    pendingJournalKey = next
      ? `${PENDING_JOURNAL_KEY}:${next}`
      : PENDING_JOURNAL_KEY;
    let pending: PendingJournal | undefined;
    try {
      pending = readJournal();
    } catch (e) {
      pendingJournalKey = beforeJournal;
      throw e;
    }
    const nextProgress =
      pending && pending.revision > state.revision
        ? pending.progress
        : state.progress
          ? validateProgress(state.progress, ids)
          : emptyProgress();
    repository = nextRepo;
    revision = Math.max(state.revision, pending?.revision || 0);
    unreadableStoredData = undefined;
    unreadableJournal = undefined;
    recoveryRequired = false;
    persistError.value = "";
    accountId.value = next;
    progress.value = nextProgress;
    if (next) localStorage.setItem("zhixu-active-account", next);
    else localStorage.removeItem("zhixu-active-account");
    if (pending && !readOnly.value) {
      await repository.save(copy(), revision);
      clearJournal(revision);
    }
  }
  return {
    accountId,
    switchAccount,
    progress,
    records,
    ready,
    persistError,
    storageNotice,
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
