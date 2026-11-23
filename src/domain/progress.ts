import { validQuestion } from "./content-validation";
import type {
  Grade,
  LearningRecord,
  ProgressSnapshot,
  StudySession,
} from "./types";

export const emptyRecord = (): LearningRecord => ({
  status: "new",
  attempts: 0,
  correct: 0,
  note: "",
  draft: "",
  bookmarked: false,
});
export const emptyProgress = (): ProgressSnapshot => ({
  version: 3,
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
  if (raw.optionOrders !== undefined) {
    if (!object(raw.optionOrders)) return fail("选项顺序");
    for (const [id, order] of Object.entries(raw.optionOrders)) {
      if (
        !raw.questionIds.includes(id) ||
        !Array.isArray(order) ||
        order.length < 2 ||
        order.length > 100 ||
        new Set(order).size !== order.length ||
        order.some((value) => !integer(value, order.length - 1))
      )
        return fail("选项顺序");
    }
  }
  if (raw.questionSnapshots !== undefined) {
    if (!object(raw.questionSnapshots)) return fail("题目版本快照");
    for (const [id, q] of Object.entries(raw.questionSnapshots))
      if (!raw.questionIds.includes(id) || !validQuestion(q) || q.id !== id)
        return fail("题目版本快照");
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
    raw.version !== 3 ||
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
  const result = structuredClone(raw) as unknown as ProgressSnapshot;
  result.session = validateSession(raw.session, ids);
  result.history = raw.history.map((s) => {
    const session = validateSession(s, ids);
    if (!session) return fail("历史记录");
    return session;
  });
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
    parsed.exportVersion !== 2
  )
    return fail("备份标识");
  const progress = validateProgress(parsed.progress, ids);
  return { progress };
}
