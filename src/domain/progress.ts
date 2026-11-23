import type {
  Grade,
  LearningRecord,
  ProgressSnapshot,
  StudySession,
} from "./types";

export const LEGACY_QUIZ_KEY = "quiz-game.progress.v1";
export const LEGACY_PRACTICE_KEY = "frontend-deep-review-2026-v1";
export interface LegacyBackup {
  quiz: string | null;
  practice: string | null;
  capturedAt: string;
}
export const emptyRecord = (): LearningRecord => ({
  status: "new",
  attempts: 0,
  correct: 0,
  note: "",
  draft: "",
  bookmarked: false,
});
export const emptyProgress = (): ProgressSnapshot => ({
  version: 2,
  records: {},
  session: null,
  history: [],
  evidence: {},
  code: {},
  dailyGoal: 10,
  activity: {},
  xp: 0,
});
export const localDateKey = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export function reviewRecord(
  record: LearningRecord,
  grade: Grade,
  now = new Date(),
  correct?: boolean,
): LearningRecord {
  const passed = correct === undefined ? grade !== "again" : correct;
  const effective = passed ? grade : "again";
  const due = new Date(now);
  if (effective === "again") due.setMinutes(due.getMinutes() + 10);
  else due.setDate(due.getDate() + (effective === "easy" ? 3 : 1));
  return {
    ...record,
    status: effective === "again" ? "learning" : "mastered",
    attempts: record.attempts + 1,
    correct: record.correct + (passed ? 1 : 0),
    lastReviewedAt: now.toISOString(),
    nextReviewAt: due.toISOString(),
  };
}

export function progressStats(progress: ProgressSnapshot, now = new Date()) {
  const records = Object.values(progress.records),
    days = Object.keys(progress.activity).filter(
      (k) => progress.activity[k] > 0,
    );
  let streak = 0;
  const cursor = new Date(now);
  const today = localDateKey(now);
  if (!progress.activity[today]) cursor.setDate(cursor.getDate() - 1);
  while (progress.activity[localDateKey(cursor)] > 0) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return {
    answered: records.filter((r) => r.attempts > 0).length,
    mastered: records.filter((r) => r.status === "mastered").length,
    due: records.filter(
      (r) => r.nextReviewAt && Date.parse(r.nextReviewAt) <= now.getTime(),
    ).length,
    studyDays: days.length,
    xp: progress.xp,
    streak,
    todayCount: progress.activity[today] || 0,
    weak: records.filter((r) => r.status === "learning").length,
  };
}

type Dict = Record<string, unknown>;
const object = (value: unknown): value is Dict =>
  !!value && typeof value === "object" && !Array.isArray(value);
const ownEntries = (value: unknown) =>
  object(value) ? Object.entries(value) : [];
const boundedString = (value: unknown, max = 100000): value is string =>
  typeof value === "string" && value.length <= max;
const integer = (value: unknown, max = 1000000): value is number =>
  Number.isInteger(value) && Number(value) >= 0 && Number(value) <= max;
const isoDate = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length <= 40 &&
  Number.isFinite(Date.parse(value));
const safeKey = (key: string) =>
  !["__proto__", "prototype", "constructor"].includes(key) && key.length <= 160;
const fail = (part: string): never => {
  throw new Error(`备份格式不正确：${part}。原有记录未被覆盖。`);
};

function validateSession(
  raw: unknown,
  ids: ReadonlySet<string>,
): StudySession | null {
  if (raw === null) return null;
  if (
    !object(raw) ||
    !boundedString(raw.id, 200) ||
    !boundedString(raw.title, 500) ||
    !["quiz", "oral", "mock"].includes(String(raw.mode))
  )
    return fail("练习记录");
  if (
    !Array.isArray(raw.questionIds) ||
    raw.questionIds.length > ids.size ||
    !raw.questionIds.length ||
    raw.questionIds.some((id) => typeof id !== "string" || !ids.has(id))
  )
    return fail("练习题目");
  if (
    new Set(raw.questionIds).size !== raw.questionIds.length ||
    !integer(raw.index, raw.questionIds.length) ||
    !object(raw.answers) ||
    !isoDate(raw.startedAt) ||
    (raw.completedAt !== undefined && !isoDate(raw.completedAt))
  )
    return fail("练习进度");
  for (const [id, a] of Object.entries(raw.answers)) {
    if (
      !raw.questionIds.includes(id) ||
      !object(a) ||
      !boundedString(a.text) ||
      typeof a.revealed !== "boolean"
    )
      return fail("作答内容");
    if (
      a.pick !== undefined &&
      typeof a.pick !== "boolean" &&
      !integer(a.pick, 100)
    )
      return fail("作答选项");
    if (
      a.grade !== undefined &&
      !["again", "good", "easy"].includes(String(a.grade))
    )
      return fail("自评结果");
  }
  return structuredClone(raw) as unknown as StudySession;
}

/** Treat imported backup as untrusted data. Validate the whole payload before returning a replacement. */
export function validateProgress(
  raw: unknown,
  ids: ReadonlySet<string>,
): ProgressSnapshot {
  if (
    !object(raw) ||
    raw.version !== 2 ||
    !object(raw.records) ||
    !object(raw.evidence) ||
    !object(raw.code) ||
    !object(raw.activity) ||
    !Array.isArray(raw.history)
  )
    return fail("数据版本或结构");
  if (
    !integer(raw.dailyGoal, 100) ||
    raw.dailyGoal < 1 ||
    !integer(raw.xp, 100000000) ||
    raw.history.length > 500
  )
    return fail("目标或统计");
  for (const [id, r] of Object.entries(raw.records)) {
    if (
      !ids.has(id) ||
      !object(r) ||
      !["new", "learning", "mastered"].includes(String(r.status)) ||
      !integer(r.attempts) ||
      !integer(r.correct) ||
      r.correct > r.attempts ||
      !boundedString(r.note) ||
      !boundedString(r.draft) ||
      typeof r.bookmarked !== "boolean"
    )
      return fail("题目学习记录");
    if (
      (r.lastReviewedAt !== undefined && !isoDate(r.lastReviewedAt)) ||
      (r.nextReviewAt !== undefined && !isoDate(r.nextReviewAt))
    )
      return fail("复习日期");
  }
  for (const name of ["evidence", "code"] as const)
    for (const [id, text] of Object.entries(raw[name] as Dict))
      if (!safeKey(id) || !boundedString(text, 200000))
        return fail(name === "code" ? "代码草稿" : "项目证据");
  for (const [day, count] of Object.entries(raw.activity)) {
    const d = new Date(`${day}T12:00:00`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
      !Number.isFinite(d.getTime()) ||
      localDateKey(d) !== day ||
      !integer(count)
    )
      return fail("学习日历");
  }
  if (raw.migratedAt !== undefined && !isoDate(raw.migratedAt))
    return fail("迁移日期");
  const result = structuredClone(raw) as unknown as ProgressSnapshot;
  result.session = validateSession(raw.session, ids);
  result.history = raw.history.map((s) => {
    const session = validateSession(s, ids);
    if (!session) return fail("历史记录");
    return session;
  });
  return result;
}

function parseLegacy(raw: string | null): Dict | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    return object(value) ? value : null;
  } catch {
    return null;
  }
}
function putLegacyText(target: Record<string, string>, raw: unknown) {
  for (const [key, value] of ownEntries(raw))
    if (safeKey(key) && boundedString(value, 200000)) target[key] = value;
}

export function migrateLegacy(
  backup: LegacyBackup,
  ids: ReadonlySet<string>,
): ProgressSnapshot {
  const result = emptyProgress(),
    quiz = parseLegacy(backup.quiz),
    practice = parseLegacy(backup.practice);
  if (!backup.quiz && !backup.practice) return result;
  result.migratedAt = backup.capturedAt;
  const record = (id: string) => (result.records[id] ??= emptyRecord());
  if (quiz && integer(quiz.xp, 100000000)) result.xp = quiz.xp;
  for (const [key, value] of ownEntries(quiz?.mistakes)) {
    const id = "quiz:" + key;
    if (ids.has(id) && value) {
      Object.assign(record(id), {
        status: "learning",
        attempts: 1,
        nextReviewAt: backup.capturedAt,
      });
    }
  }
  for (const [key, value] of ownEntries(practice?.grades)) {
    const id = "oral:" + key;
    if (ids.has(id) && (value === "ok" || value === "weak"))
      Object.assign(record(id), {
        status: value === "ok" ? "mastered" : "learning",
        attempts: 1,
        correct: value === "ok" ? 1 : 0,
        nextReviewAt: backup.capturedAt,
      });
  }
  for (const [key, value] of ownEntries(practice?.notes)) {
    const id = "oral:" + key;
    if (ids.has(id) && boundedString(value)) {
      record(id).note = value;
      record(id).draft = value;
    }
  }
  putLegacyText(result.evidence, practice?.resumeEvidence);
  putLegacyText(result.code, practice?.programs);
  const oldQuiz = object(quiz?.run) ? quiz.run : null;
  if (oldQuiz && Array.isArray(oldQuiz.keys)) {
    const original = oldQuiz.keys as unknown[],
      questionIds = original
        .filter((x): x is string => typeof x === "string")
        .map((x) => "quiz:" + x)
        .filter((id) => ids.has(id));
    if (questionIds.length) {
      const index = original
        .slice(0, Number(oldQuiz.index) || 0)
        .filter((x) => typeof x === "string" && ids.has("quiz:" + x)).length;
      const s: StudySession = {
        id: "legacy-quiz",
        title: "继续旧版练习",
        mode: "quiz",
        questionIds,
        index: Math.min(index, questionIds.length),
        answers: {},
        startedAt: backup.capturedAt,
      };
      const id = questionIds[s.index];
      if (id) {
        const text = boundedString(oldQuiz.draft) ? oldQuiz.draft : "";
        const pick =
          typeof oldQuiz.pick === "boolean" || integer(oldQuiz.pick, 100)
            ? oldQuiz.pick
            : undefined;
        s.answers[id] = { text, pick, revealed: oldQuiz.answered === true };
        record(id).draft = text;
      }
      result.session = s;
    }
  }
  const migrateOralSession = (
    raw: unknown,
    key: string,
  ): StudySession | null => {
    if (!object(raw) || !Array.isArray(raw.queue)) return null;
    const original = raw.queue,
      questionIds = original
        .filter((x): x is string => typeof x === "string")
        .map((x) => "oral:" + x)
        .filter((id) => ids.has(id));
    if (!questionIds.length) return null;
    const index = original
      .slice(0, Number(raw.index) || 0)
      .filter((x) => typeof x === "string" && ids.has("oral:" + x)).length;
    const opened =
      typeof raw.opened === "number" && Number.isFinite(raw.opened)
        ? new Date(raw.opened).toISOString()
        : backup.capturedAt;
    const s: StudySession = {
      id: key,
      title: boundedString(raw.title, 500) ? raw.title : "旧版口述练习",
      mode: raw.mode === "mock" ? "mock" : "oral",
      questionIds,
      index: Math.min(index, questionIds.length),
      answers: {},
      startedAt: opened,
    };
    const replies = object(raw.replies) ? raw.replies : {},
      round = object(raw.round) ? raw.round : {};
    for (const [i, id] of questionIds.entries()) {
      const old = id.slice(5),
        grade =
          round[old] === "ok"
            ? "good"
            : round[old] === "weak"
              ? "again"
              : undefined;
      const text = boundedString(replies[old])
        ? replies[old]
        : result.records[id]?.draft || "";
      s.answers[id] = {
        text,
        ...(grade ? { grade } : {}),
        revealed:
          !!grade ||
          (s.mode !== "mock" &&
            (i < s.index || (i === s.index && raw.reveal === true))),
      };
    }
    if (s.index === s.questionIds.length) s.completedAt = backup.capturedAt;
    return s;
  };
  const oral = migrateOralSession(practice?.session, "legacy-oral");
  if (oral) {
    if (oral.completedAt) result.history.push(oral);
    else if (!result.session || quiz?.returnTo === "quiz") {
      if (result.session) result.history.push(result.session);
      result.session = oral;
    } else result.history.push(oral);
  }
  const historical = [
    practice?.mock,
    ...ownEntries(practice?.trackMocks).map(([, v]) => v),
  ];
  for (const [i, old] of historical.entries()) {
    const session = migrateOralSession(old, `legacy-mock-${i}`);
    if (
      session &&
      !result.history.some(
        (s) => s.title === session.title && s.startedAt === session.startedAt,
      ) &&
      !(
        result.session?.title === session.title &&
        result.session?.startedAt === session.startedAt
      )
    )
      result.history.push(session);
  }
  return result;
}

export function parseBackup(text: string, ids: ReadonlySet<string>) {
  if (text.length > 12_000_000)
    throw new Error("备份文件过大，请使用本应用导出的 JSON 备份。");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("无法读取 JSON 文件，原有记录未被覆盖。");
  }
  if (
    !object(parsed) ||
    parsed.app !== "interview-workbench" ||
    parsed.exportVersion !== 1
  )
    return fail("备份标识");
  const progress = validateProgress(parsed.progress, ids);
  let legacy: LegacyBackup | undefined;
  if (parsed.legacyBackup !== undefined) {
    const raw = parsed.legacyBackup;
    if (
      !object(raw) ||
      (raw.quiz !== null && !boundedString(raw.quiz, 5_000_000)) ||
      (raw.practice !== null && !boundedString(raw.practice, 5_000_000)) ||
      !isoDate(raw.capturedAt)
    )
      return fail("旧版原始备份");
    legacy = structuredClone(raw) as unknown as LegacyBackup;
  }
  return { progress, legacy };
}
