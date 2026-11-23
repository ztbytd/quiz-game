import raw from "./bank.json";
import type { Bank } from "@/domain/types";

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value)) deepFreeze(item);
  }
  return value;
}
export const bank = deepFreeze(raw as unknown as Bank);
export const quizQuestions = bank.questions.filter((q) =>
  q.id.startsWith("quiz:"),
);
export const oralQuestions = bank.questions.filter((q) =>
  q.id.startsWith("oral:"),
);
export const questionById = new Map(bank.questions.map((q) => [q.id, q]));
export const topicById = new Map(bank.topics.map((t) => [t.id, t]));
export const chainById = new Map(bank.chains.map((c) => [c.id, c]));
export const groupById = new Map(bank.groups.map((g) => [g.id, g]));
export const getQuestion = (id: string) => questionById.get(id);
