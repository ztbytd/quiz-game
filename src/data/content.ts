import raw from "./bank.json";
import type { Bank } from "@/domain/types";
import type { StudyQuestion } from "@/domain/types";
import { reactive, shallowReactive } from "vue";
import {
  cachedContent,
  cachePublic,
  cachePersonal,
  clearPersonalCache,
} from "../infrastructure/content-repository";
import { api } from "../infrastructure/ai-client";
import { validQuestion } from "../domain/content-validation";

export const bank = reactive(structuredClone(raw) as unknown as Bank);
export const quizQuestions = reactive(
  bank.questions.filter((q) => q.id.startsWith("quiz:")),
);
export const oralQuestions = reactive(
  bank.questions.filter((q) => q.id.startsWith("oral:")),
);
export const questionById = shallowReactive(
  new Map(bank.questions.map((q) => [q.id, q])),
);
export const topicById = shallowReactive(
  new Map(bank.topics.map((t) => [t.id, t])),
);
export const chainById = shallowReactive(
  new Map(bank.chains.map((c) => [c.id, c])),
);
export const groupById = shallowReactive(
  new Map(bank.groups.map((g) => [g.id, g])),
);
export const getQuestion = (id: string) => questionById.get(id);
export const knownQuestionIds = new Set(questionById.keys());
function reindex() {
  for (const q of bank.questions) {
    questionById.set(q.id, q);
    knownQuestionIds.add(q.id);
  }
  for (const t of bank.topics) topicById.set(t.id, t);
  for (const c of bank.chains) chainById.set(c.id, c);
  for (const g of bank.groups) groupById.set(g.id, g);
  quizQuestions.splice(
    0,
    quizQuestions.length,
    ...bank.questions.filter((q) => q.kind !== "oral" || !q.chainId),
  );
  oralQuestions.splice(
    0,
    oralQuestions.length,
    ...bank.questions.filter((q) => q.kind === "oral"),
  );
}
export function addPersonal(questions: StudyQuestion[]) {
  for (const q of questions) {
    if (!questionById.has(q.id)) {
      bank.questions.push(q);
      questionById.set(q.id, q);
    }
  }
  reindex();
}
export function validateBank(value: any): Bank {
  if (
    value?.schemaVersion !== 1 ||
    !Array.isArray(value.questions) ||
    !Array.isArray(value.topics) ||
    !Array.isArray(value.chains) ||
    !Array.isArray(value.groups)
  )
    throw new Error("题库版本不兼容");
  const ids = new Set<string>();
  for (const q of value.questions) {
    if (
      typeof q.id !== "string" ||
      ids.has(q.id) ||
      ["__proto__", "constructor", "prototype"].includes(q.id) ||
      typeof q.prompt !== "string" ||
      typeof q.explanation !== "string" ||
      !["oral", "choice", "boolean"].includes(q.kind)
    )
      throw new Error("题目内容格式不正确");
    if (
      q.kind === "choice" &&
      (!Array.isArray(q.choices) ||
        q.choices.length < 2 ||
        !Number.isInteger(q.correctAnswer) ||
        q.correctAnswer < 0 ||
        q.correctAnswer >= q.choices.length)
    )
      throw new Error("选项不完整");
    if (q.kind === "boolean" && typeof q.correctAnswer !== "boolean")
      throw new Error("判断答案不完整");
    ids.add(q.id);
  }
  for (const t of value.topics) {
    if (
      !Array.isArray(t.questionIds) ||
      !Array.isArray(t.sections) ||
      t.questionIds.some((x: string) => !ids.has(x))
    )
      throw new Error("题库目录不完整");
  }
  return value;
}
function activate(next: Bank) {
  const personal = bank.questions.filter((q) => q.origin === "ai-private");
  Object.assign(bank, next);
  addPersonal(personal);
  reindex();
}
export async function restoreContent() {
  const cached = await cachedContent();
  for (const q of cached.archive || []) {
    if (validQuestion(q)) {
      questionById.set(q.id, q);
      knownQuestionIds.add(q.id);
    }
  }
  if (cached.bank) activate(validateBank(cached.bank));
  if (cached.personal) addPersonal(cached.personal);
}
export async function syncContent() {
  const result = await api<{ bank: Bank }>("/content/manifest", {
    signal: AbortSignal.timeout(5000),
  });
  const next = validateBank(result.bank);
  await cachePublic(next);
  activate(next);
}
export async function syncPersonal(owner?: string) {
  const { items } = await api("/my/questions");
  const questions = items
    .filter((x: any) => x.saved)
    .map((x: any) => ({
      ...x.question,
      id: x.id,
      version: x.version,
      origin: "ai-private",
      label: "AI 生成 · 待复核",
    }));
  await cachePersonal(questions, owner);
  addPersonal(questions);
  return questions;
}
export async function clearPersonal(owner?: string, erase = true) {
  const privateIds = bank.questions
    .filter((q) => q.origin === "ai-private")
    .map((q) => q.id);
  bank.questions = bank.questions.filter((q) => q.origin !== "ai-private");
  for (const key of privateIds) questionById.delete(key);
  if (erase) await clearPersonalCache(owner);
}
