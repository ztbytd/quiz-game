import { z } from "zod";
import type { InterviewOptions } from "../packages/contracts/ai.ts";
export const stepSchema = z.object({
  question: z.string().min(8).max(3000),
  action: z.enum(["next", "followup"]),
});
export interface InterviewState {
  main: number;
  followup: number;
}
export function stepRules(options: InterviewOptions, state: InterviewState) {
  const canFollow = state.main > 0 && state.followup < options.followups;
  const canNext = state.main < options.mainQuestions;
  return { canFollow, canNext, finished: !canFollow && !canNext };
}
export function advanceInterview(
  options: InterviewOptions,
  state: InterviewState,
  action: "next" | "followup",
): InterviewState {
  const rules = stepRules(options, state);
  if (action === "followup" && !rules.canFollow)
    throw new Error("已达到本题追问上限");
  if (action === "next" && !rules.canNext)
    throw new Error("已达到主问题数量上限");
  return action === "next"
    ? { main: state.main + 1, followup: 0 }
    : { main: state.main, followup: state.followup + 1 };
}
export function interviewPrompt(
  options: InterviewOptions,
  state: InterviewState,
) {
  const rules = stepRules(options, state);
  return `INTERVIEW_STEP 正式模拟面试。已完成主问题${state.main}/${options.mainQuestions}，当前主问题已追问${state.followup}/${options.followups}次。依据实际回答决定继续深挖或换主问题：追问是否允许=${rules.canFollow}；新主问题是否允许=${rules.canNext}。只返回JSON {"question":"一个具体问题","action":"next或followup"}。必须选择允许的动作。首次提问选择next。用户回答已完整时选择next；存在值得验证的机制、实现、异常或取舍时选择followup。每次只问一个问题，不给提示、参考答案或即时点评。不得重复用户已经讲清的点。`;
}
export function transcriptOf(rows: any[], finalAnswer?: string) {
  const turns: Array<{
    question: string;
    answer: string;
    main: number;
    followup: number;
  }> = [];
  let question: any;
  for (const row of rows) {
    if (row.role === "assistant" && row.kind === "interview")
      question = {
        question: row.text,
        ...(row.result?.type === "interview_step"
          ? row.result.state
          : { main: 1, followup: 0 }),
      };
    if (row.role === "user" && row.kind === "interview" && question) {
      turns.push({ ...question, answer: row.text });
      question = undefined;
    }
    if (
      row.role === "user" &&
      row.kind === "recap" &&
      row.final_answer &&
      question
    ) {
      turns.push({ ...question, answer: row.final_answer });
      question = undefined;
    }
  }
  if (question && finalAnswer?.trim())
    turns.push({ ...question, answer: finalAnswer.trim() });
  return turns;
}
export function formatReport(report: any) {
  const blocks = [report.summary];
  if (report.strengths.length)
    blocks.push(
      "## 已经讲清",
      ...report.strengths.map((s: any) => `> ${s.quote}\n\n${s.comment}`),
    );
  if (report.gaps.length)
    blocks.push(
      "## 下一步补足",
      ...report.gaps.map(
        (g: any) => `### ${g.point}\n\n${g.reason}\n\n${g.practice}`,
      ),
    );
  for (const answer of report.answers) {
    const turn = report.transcript[answer.index - 1];
    blocks.push(
      `## ${turn.question}\n\n我的回答：${turn.answer}\n\n${answer.comment}\n\n参考表达：${answer.improvedAnswer}`,
    );
  }
  if (report.nextSteps.length)
    blocks.push(
      "## 复习安排",
      ...report.nextSteps.map((s: string) => "- " + s),
    );
  return blocks.join("\n\n");
}
export const reportPrompt =
  'INTERVIEW_REPORT 根据实际模拟作答生成复盘。只输出JSON {"summary":"整体复盘，不给面试通过概率","strengths":[{"quote":"用户实际回答的精确片段","comment":"对应优点"}],"gaps":[{"point":"缺口或待验证点","reason":"依据","practice":"具体补练方向"}],"answers":[{"index":1,"comment":"对该次作答的点评","improvedAnswer":"连贯可口述的参考回答"}],"nextSteps":["具体建议"]}。index从1开始，对应输入中的作答记录。没有作答时strengths与answers必须为空；不推断用户没展示的能力。合理替代方案应接受。引用必须逐字来自用户答案；原文被截取时只判断可见部分。';
