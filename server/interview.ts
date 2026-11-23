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
  return `INTERVIEW_STEP 正式模拟面试。已完成主问题${state.main}/${options.mainQuestions}，当前主问题已追问${state.followup}/${options.followups}次。依据实际回答决定继续深挖或换主问题：追问是否允许=${rules.canFollow}；新主问题是否允许=${rules.canNext}。只返回JSON {"question":"一个具体问题","action":"next或followup"}。必须选择允许的动作。首次提问选择next。用户回答已完整且允许新主问题时选择next；存在值得验证的机制、实现、异常或取舍时选择followup。每次只问一个问题，不给提示、参考答案或即时点评。不得重复用户已经讲清的点。
提问前先核实技术前提，接受在已述条件下成立的方案，不预设它仍有漏洞。拓展到不同条件时明确新增条件，允许用户回答“在这些前提下不会发生”，不要求为已充分的方案再增加措施。讨论时序或竞态时，区分连续同步执行与中途await、回调或其他异步间隔；不能假定普通事件能插入任意两条同步语句之间。条件不足时询问具体条件，不把推测写成已经发生的错误。`;
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
export const reportPrompt = `INTERVIEW_REPORT 根据实际模拟作答生成复盘。只输出JSON {"summary":"整体复盘，不给面试通过概率","strengths":[{"quote":"用户实际回答的精确片段","comment":"对应优点"}],"gaps":[{"point":"有证据的错误或必要遗漏","reason":"对应题干要求与作答依据","practice":"具体补练方向"}],"answers":[{"index":1,"comment":"对该次作答的点评","improvedAnswer":"连贯可口述的参考回答"}],"nextSteps":["具体建议"]}。index从1开始，对应输入中的作答记录。没有作答时strengths与answers必须为空；不推断用户没展示的能力。合理替代方案应接受。引用必须逐字来自用户答案；原文被截取时只判断可见部分。
先核实每道题和追问的技术前提，再按语义核对实际作答。模型先前提出的问题不自动构成正确事实；若追问前提错误或条件不足，应在对应answers.comment中说明，不能把用户没有接受该前提算作缺口。用户已正确表达的等价要点不能既列为优点又称为遗漏。
gaps只列可由原文证明的错误或题干必要要求的遗漏，合计最多3项，可以为空；不为了凑改进而增加要求。描述方案失效时明确失效条件，不把未说明的异步间隔、身份复用或状态变化当作必然发生；连续同步执行与中途让出执行权应区分。已能解决题干问题的方案无需额外措施才能算充分。
可选深入练习放在nextSteps，以“拓展：”开头；条件不足但值得验证的点同样放在nextSteps，以“待验证：”开头，不作为已证实的缺口，二者合计最多2项。summary和逐题comment沿用同一判断，不在其他字段重新引入未经证明的缺陷。improvedAnswer保留用户正确思路，直接回应题干，不把全部拓展堆入主回答。`;
