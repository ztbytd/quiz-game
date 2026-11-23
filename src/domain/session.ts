import type {
  Bank,
  LearningRecord,
  StudyQuestion,
  StudySession,
} from "./types";

function seedOf(value: string): number {
  let hash = 2166136261;
  for (const char of value)
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
}

/** A session keeps the same shuffled option identities after reload. */
export function shuffled<T>(items: readonly T[], seed: string): T[] {
  const result = [...items];
  let state = seedOf(seed) || 1;
  for (let index = result.length - 1; index > 0; index--) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    const other = (state >>> 0) % (index + 1);
    [result[index], result[other]] = [result[other]!, result[index]!];
  }
  return result;
}

export function optionOrder(
  question: StudyQuestion,
  sessionId: string,
): (number | boolean)[] {
  if (question.kind === "boolean") return [true, false];
  return shuffled(
    (question.choices || []).map((_, index) => index),
    sessionId + question.id,
  );
}

export function isCorrect(
  question: StudyQuestion,
  pick: number | boolean | undefined,
): boolean {
  return (
    question.kind !== "oral" &&
    pick !== undefined &&
    pick === question.correctAnswer
  );
}

export interface SessionRequest {
  mode?: string;
  topic?: string;
  chain?: string;
  question?: string;
  filter?: string;
  dailyGoal?: number;
}

export function createSession(
  bank: Bank,
  request: SessionRequest,
  records: Record<string, LearningRecord>,
  now = new Date(),
): StudySession | null {
  const id = `${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`;
  const known = new Map(
    bank.questions.map((question) => [question.id, question]),
  );
  let queue: string[] = [];
  let title = "自主练习";
  let mode: StudySession["mode"] = "quiz";
  if (request.mode === "daily") {
    title = "今日练习";
    const goal = Math.min(
      100,
      Math.max(1, Math.floor(request.dailyGoal || 10)),
    );
    const due = bank.questions
      .filter((question) => {
        const record = records[question.id];
        return (
          record &&
          (record.status === "learning" ||
            (record.nextReviewAt &&
              Date.parse(record.nextReviewAt) <= now.getTime()))
        );
      })
      .map((question) => question.id);
    const fresh = bank.questions
      .filter((question) => {
        if (records[question.id]?.attempts) return false;
        if (question.id.startsWith("quiz:") || !question.stepIndex) return true;
        // Do not pull a follow-up out of an untouched chain. Its predecessors must have been studied.
        const chain = bank.chains.find((item) => item.id === question.chainId);
        return chain?.questionIds
          .slice(0, question.stepIndex)
          .every((id) => records[id]?.attempts);
      })
      .map((question) => question.id);
    queue = [...new Set([...due, ...fresh])].slice(0, goal);
  } else if (request.mode === "mock") {
    mode = "mock";
    title = "跨专题模拟面试";
    // Select one opening question from each group first: follow-up questions may require prior context.
    for (const group of shuffled(bank.groups, id)) {
      const candidates = bank.chains.filter(
        (chain) => chain.groupId === group.id && chain.questionIds.length,
      );
      const chain = shuffled(candidates, id + group.id)[0];
      if (chain?.questionIds[0]) queue.push(chain.questionIds[0]);
      if (queue.length === 12) break;
    }
  } else if (request.mode === "review") {
    title = request.filter === "bookmarks" ? "收藏练习" : "薄弱与到期复习";
    queue = bank.questions
      .filter((question) => {
        const record = records[question.id];
        if (!record) return false;
        if (request.filter === "bookmarks") return record.bookmarked;
        return (
          record.status === "learning" ||
          (record.nextReviewAt &&
            Date.parse(record.nextReviewAt) <= now.getTime())
        );
      })
      .map((question) => question.id)
      .slice(0, 30);
  } else if (request.chain) {
    const chain = bank.chains.find((item) => item.id === request.chain);
    if (chain) {
      queue = [...chain.questionIds];
      title = chain.title;
      mode = "oral";
    }
  } else if (request.topic) {
    const topic = bank.topics.find((item) => item.id === request.topic);
    if (topic) {
      queue = [...topic.questionIds];
      title = topic.title;
    }
  }
  if (request.question && known.has(request.question)) {
    if (!queue.includes(request.question)) queue = [request.question];
    if (known.get(request.question)?.kind === "oral" && !request.topic)
      mode = "oral";
  }
  if (
    !queue.length &&
    !request.mode &&
    !request.topic &&
    !request.chain &&
    !request.question
  ) {
    const topic = bank.topics[0];
    if (topic) {
      queue = [...topic.questionIds];
      title = topic.title;
    }
  }
  queue = queue.filter((key) => known.has(key));
  if (!queue.length) return null;
  return {
    id,
    title,
    mode,
    questionIds: queue,
    index: request.question ? Math.max(0, queue.indexOf(request.question)) : 0,
    answers: {},
    startedAt: now.toISOString(),
  };
}

export function answerLabel(
  question: StudyQuestion,
  answer: number | boolean | undefined,
): string {
  if (answer === undefined) return "尚未作答";
  return question.kind === "boolean"
    ? answer
      ? "正确"
      : "错误"
    : question.choices?.[Number(answer)] || "尚未作答";
}
