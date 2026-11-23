import { test } from "node:test";
import assert from "node:assert/strict";
import { advanceInterview, stepRules, transcriptOf } from "./interview.ts";
import { normalizeQuestion } from "./generated-question.ts";
import { questionSchema } from "../packages/contracts/ai.ts";
import { optionChecks } from "./quality.ts";

test("interview follows actual answers within main-question and followup limits", () => {
  const options = { mainQuestions: 2, followups: 1, minutes: 10 };
  assert.throws(() =>
    advanceInterview(options, { main: 0, followup: 0 }, "followup"),
  );
  let state = advanceInterview(options, { main: 0, followup: 0 }, "next");
  state = advanceInterview(options, state, "followup");
  assert.throws(() => advanceInterview(options, state, "followup"));
  state = advanceInterview(options, state, "next");
  state = advanceInterview(options, state, "followup");
  assert.equal(stepRules(options, state).finished, true);
  assert.throws(() => advanceInterview(options, state, "next"));
});
test("transcript excludes control prompts and includes the final unsent answer exactly once", () => {
  const rows = [
    { role: "user", kind: "interview", text: "开始面试" },
    {
      role: "assistant",
      kind: "interview",
      text: "怎样取消请求？",
      result: { type: "interview_step", state: { main: 1, followup: 0 } },
    },
    { role: "user", kind: "interview", text: "通过 AbortController 取消。" },
    {
      role: "assistant",
      kind: "interview",
      text: "取消后如何防止旧结果覆盖？",
      result: { type: "interview_step", state: { main: 1, followup: 1 } },
    },
    { role: "user", kind: "recap", text: "结束并复盘" },
  ];
  const turns = transcriptOf(rows, "使用递增请求序号检查最新结果。");
  assert.deepEqual(
    turns.map((t) => t.answer),
    ["通过 AbortController 取消。", "使用递增请求序号检查最新结果。"],
  );
  assert.deepEqual(
    turns.map((t) => [t.main, t.followup]),
    [
      [1, 0],
      [1, 1],
    ],
  );
});
test("a final answer survives a failed recap and is included when recap is retried", () => {
  const rows = [
    {
      role: "assistant",
      kind: "interview",
      text: "如何阻止过期响应？",
      result: { type: "interview_step", state: { main: 1, followup: 1 } },
    },
    {
      role: "user",
      kind: "recap",
      text: "用序号校验。",
      final_answer: "用序号校验。",
    },
    { role: "user", kind: "recap", text: "重新复盘" },
  ];
  assert.deepEqual(
    transcriptOf(rows).map((t) => t.answer),
    ["用序号校验。"],
  );
});
test("equivalent model JSON is normalized without inventing an objective answer", () => {
  const raw = {
    kind: "oral",
    prompt: "组件卸载时如何处理未完成的搜索请求？",
    explanation:
      "组件卸载时，我会使用 AbortController 取消请求，并用请求序号阻止旧结果提交，避免过期请求覆盖当前状态。",
    choices: [],
    correctAnswer: null,
    knowledgePoints: ["请求取消"],
    angle: "场景",
    rubric: { required: ["取消请求"], alternatives: null, mistakes: null },
    detail: {
      pitfalls: ["取消不等于服务端回滚", "需要处理取消异常"],
      example: null,
    },
  };
  const q = questionSchema.parse(normalizeQuestion(raw));
  assert.equal(q.detail?.pitfalls, "取消不等于服务端回滚\n需要处理取消异常");
  assert.equal(q.choices, undefined);
  assert.equal(raw.correctAnswer, null);
  assert.equal(
    questionSchema.safeParse(
      normalizeQuestion({
        ...raw,
        kind: "choice",
        choices: ["取消", "不取消"],
      }),
    ).success,
    false,
  );
});
test("a long correct option is flagged when the other options reveal it by length", () => {
  assert.ok(
    optionChecks({
      kind: "choice",
      choices: [
        "直接重试",
        "直接取消",
        "仅加锁",
        "使用服务端唯一任务并通过原子状态变化取得执行权，完成后返回相同结果且校验任务版本，避免重复合并和旧结果覆盖",
      ],
      correctAnswer: 3,
    }).length,
  );
  assert.deepEqual(
    optionChecks({
      kind: "choice",
      choices: [
        "取消请求并校验结果",
        "只用防抖限制请求",
        "仅检查组件是否挂载",
        "直接提交最后的响应",
      ],
      correctAnswer: 0,
    }),
    [],
  );
});
