import { describe, expect, it } from "vitest";
import {
  createSession,
  isCorrect,
  optionOrder,
  planOptionOrders,
} from "../src/domain/session";
import { bank, questionById } from "../src/data/content";
import type { LearningRecord } from "../src/domain/types";

const record = (extra: Partial<LearningRecord> = {}): LearningRecord => ({
  status: "new",
  attempts: 0,
  correct: 0,
  note: "",
  draft: "",
  bookmarked: false,
  ...extra,
});

describe("session planning", () => {
  it("keeps answer identity separate from shuffled display position", () => {
    const question = bank.questions.find((q) => q.kind === "choice")!;
    const first = optionOrder(question, "stable-session");
    expect(optionOrder(question, "stable-session")).toEqual(first);
    expect([...first].sort()).toEqual(question.choices!.map((_, i) => i));
    expect(isCorrect(question, question.correctAnswer)).toBe(true);
    expect(isCorrect(question, undefined)).toBe(false);
    expect(first.includes(question.correctAnswer!)).toBe(true);
  });
  it("preserves true/false identities without coercing false to an unanswered value", () => {
    const question = bank.questions.find(
      (q) => q.kind === "boolean" && q.correctAnswer === false,
    )!;
    expect(optionOrder(question, "s")).toEqual([true, false]);
    expect(isCorrect(question, false)).toBe(true);
    expect(isCorrect(question, 0)).toBe(false);
  });
  it("opens a searched question at its position in the original topic", () => {
    const topic = bank.topics[0]!;
    const question = topic.questionIds[3]!;
    const session = createSession(bank, { topic: topic.id, question }, {})!;
    expect(session.index).toBe(3);
    expect(session.questionIds).toEqual(topic.questionIds);
  });
  it("supports standalone oral-question deep links", () => {
    const question = bank.questions.find((q) => q.id.startsWith("oral:"))!;
    const session = createSession(bank, { question: question.id }, {})!;
    expect(session.mode).toBe("oral");
    expect(session.questionIds).toEqual([question.id]);
  });
  it("selects twelve opening questions from different groups for blind interviews", () => {
    const session = createSession(bank, { mode: "mock" }, {})!;
    expect(session.mode).toBe("mock");
    expect(session.questionIds).toHaveLength(12);
    const chains = session.questionIds.map((id) =>
      bank.chains.find((c) => c.questionIds[0] === id)!,
    );
    expect(chains.every(Boolean)).toBe(true);
    expect(new Set(chains.map((c) => c.groupId)).size).toBe(12);
    expect(Object.keys(session.answers)).toHaveLength(0);
  });
  it("prioritizes weak and due questions then fills the daily goal without duplicates", () => {
    const first = bank.topics[0]!.questionIds[0]!;
    const weak = bank.topics[1]!.questionIds[0]!;
    const future = bank.topics[2]!.questionIds[0]!;
    const records = {
      [first]: record({
        status: "mastered",
        attempts: 1,
        nextReviewAt: "2026-11-22T00:00:00Z",
      }),
      [weak]: record({ status: "learning", attempts: 1 }),
      [future]: record({
        status: "mastered",
        attempts: 1,
        nextReviewAt: "2026-12-30T00:00:00Z",
      }),
    };
    const session = createSession(
      bank,
      { mode: "daily", dailyGoal: 10 },
      records,
      new Date("2026-11-23T06:00:00Z"),
    )!;
    expect(session.questionIds).toHaveLength(10);
    expect(session.questionIds.slice(0, 2)).toEqual([first, weak]);
    expect(new Set(session.questionIds).size).toBe(10);
    expect(session.questionIds).not.toContain(future);
    expect(session.questionIds.every((id) => questionById.has(id))).toBe(true);
  });
  it("never silently starts a different topic for invalid deep links or empty reviews", () => {
    expect(createSession(bank, { topic: "missing" }, {})).toBeNull();
    expect(createSession(bank, { question: "unknown" }, {})).toBeNull();
    expect(createSession(bank, { mode: "review" }, {})).toBeNull();
  });
  it("lets bookmarks and weak reviews use separate selection rules", () => {
    const [one, two] = bank.topics[0]!.questionIds;
    const records = {
      [one!]: record({ bookmarked: true, status: "mastered", attempts: 2 }),
      [two!]: record({ status: "learning", attempts: 1 }),
    };
    expect(
      createSession(bank, { mode: "review", filter: "bookmarks" }, records)
        ?.questionIds,
    ).toEqual([one]);
    expect(
      createSession(bank, { mode: "review" }, records)?.questionIds,
    ).toEqual([two]);
  });
  it("only introduces an oral follow-up after its predecessors have been studied", () => {
    const records: Record<string, LearningRecord> = {};
    for (const question of bank.questions.filter((q) =>
      q.id.startsWith("quiz:"),
    ))
      records[question.id] = record({
        status: "mastered",
        attempts: 1,
        nextReviewAt: "2026-12-30T00:00:00Z",
      });
    const chain = bank.chains[0]!;
    records[chain.questionIds[0]!] = record({
      status: "mastered",
      attempts: 1,
      nextReviewAt: "2026-12-30T00:00:00Z",
    });
    const session = createSession(
      bank,
      { mode: "daily", dailyGoal: 100 },
      records,
      new Date("2026-11-23T06:00:00Z"),
    )!;
    expect(session.questionIds).toContain(chain.questionIds[1]);
    expect(session.questionIds).not.toContain(chain.questionIds[2]);
  });
  it("balances correct positions across sessions without moving answer identities", () => {
    const choices = bank.questions.filter((q) => q.kind === "choice");
    const seen = new Set<string>();
    for (let i = 0; i < 30; i++) {
      const seed = `sample-${i}`;
      const questions = choices.slice(i, i + 13);
      const orders = planOptionOrders(questions, seed);
      const counts = [0, 0, 0, 0];
      for (const question of questions) {
        const order = optionOrder(question, seed, orders);
        expect([...order].sort()).toEqual([0, 1, 2, 3]);
        counts[order.indexOf(question.correctAnswer!)]!++;
        expect(
          optionOrder(question, seed, JSON.parse(JSON.stringify(orders))),
        ).toEqual(order);
      }
      expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
      seen.add(JSON.stringify(orders[questions[0]!.id]));
    }
    expect(seen.size).toBeGreaterThan(8);
  });
  it("plans exactly one selected chapter and keeps its follow-ups in context", () => {
    const topic = bank.topics.find((t) => t.id === "7")!;
    for (const section of topic.sections) {
      const session = createSession(
        bank,
        { topic: topic.id, section: section.id },
        {},
      )!;
      expect(session.questionIds).toEqual(section.questionIds);
      expect(session.title).toContain(section.title);
      expect(session.optionOrders).toBeDefined();
    }
    expect(
      createSession(bank, { topic: "7", section: "missing" }, {}),
    ).toBeNull();
    expect(createSession(bank, { section: "foundation" }, {})).toBeNull();
  });
  it("falls back safely when a restored option permutation does not match the question", () => {
    const question = bank.questions.find((q) => q.kind === "choice")!;
    for (const invalid of [
      [0, 0, 2, 3],
      [0, 1, 2, 9],
      [0, 1],
    ])
      expect(optionOrder(question, "old", { [question.id]: invalid })).toEqual(
        optionOrder(question, "old"),
      );
  });
});
