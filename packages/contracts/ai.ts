import { z } from "zod";

export const questionSchema = z
  .object({
    id: z.string().min(1).max(160).optional(),
    kind: z.enum(["choice", "boolean", "oral"]),
    prompt: z.string().min(8).max(4000),
    explanation: z.string().min(40).max(10000),
    choices: z.array(z.string().min(1).max(2000)).min(2).max(6).optional(),
    correctAnswer: z.union([z.number().int(), z.boolean()]).optional(),
    detail: z
      .object({
        principle: z.string().max(10000).optional(),
        example: z.string().max(10000).optional(),
        code: z.string().max(16000).optional(),
        pitfalls: z.string().max(8000).optional(),
        followups: z
          .array(z.tuple([z.string(), z.string()]))
          .max(5)
          .optional(),
      })
      .optional(),
    knowledgePoints: z.array(z.string().max(120)).min(1).max(8),
    angle: z.enum(["概念", "机制", "实现", "场景", "排错", "取舍"]),
    rubric: z.object({
      required: z.array(z.string().max(1000)).min(1).max(10),
      alternatives: z.array(z.string().max(1000)).max(8),
      mistakes: z.array(z.string().max(1000)).max(8),
    }),
  })
  .superRefine((q, ctx) => {
    if (
      q.kind === "choice" &&
      (!q.choices ||
        new Set(q.choices).size !== q.choices.length ||
        typeof q.correctAnswer !== "number" ||
        q.correctAnswer < 0 ||
        q.correctAnswer >= q.choices.length)
    )
      ctx.addIssue({ code: "custom", message: "选择项或正确答案不合法" });
    if (q.kind === "boolean" && typeof q.correctAnswer !== "boolean")
      ctx.addIssue({ code: "custom", message: "判断题缺少布尔答案" });
  });
export type GeneratedQuestion = z.infer<typeof questionSchema>;
export const assessmentSchema = z.object({
  covered: z.array(z.object({ quote: z.string(), comment: z.string() })).max(8),
  improvements: z
    .array(
      z.object({
        type: z.enum(["错误", "遗漏", "表达", "待核实", "拓展"]),
        point: z.string(),
        reason: z.string(),
      }),
    )
    .max(5)
    .superRefine((items, context) => {
      if (items.filter((item) => item.type !== "拓展").length > 3)
        context.addIssue({ code: "custom", message: "必要改进最多三项" });
      if (items.filter((item) => item.type === "拓展").length > 2)
        context.addIssue({ code: "custom", message: "拓展建议最多两项" });
    }),
  dimensions: z
    .array(
      z.object({
        name: z.string(),
        level: z.enum(["充分", "部分", "缺失", "无法判断"]),
        reason: z.string(),
      }),
    )
    .min(1)
    .max(5),
  answer: z.string().min(30).max(6000),
  followup: z.string().min(5).max(1000),
});
export type Assessment = z.infer<typeof assessmentSchema>;
export const interviewOptionsSchema = z.object({
  mainQuestions: z.number().int().min(2).max(8).default(6),
  followups: z.number().int().min(0).max(3).default(2),
  minutes: z.number().int().min(5).max(45).default(20),
});
export type InterviewOptions = z.infer<typeof interviewOptionsSchema>;
export const interviewReportSchema = z.object({
  summary: z.string().min(10).max(2000),
  strengths: z
    .array(
      z.object({
        quote: z.string().min(1).max(1000),
        comment: z.string().max(1000),
      }),
    )
    .max(8),
  gaps: z
    .array(
      z.object({
        point: z.string().max(500),
        reason: z.string().max(1200),
        practice: z.string().max(1200),
      }),
    )
    .max(8),
  answers: z
    .array(
      z.object({
        index: z.number().int().positive(),
        comment: z.string().max(1000),
        improvedAnswer: z.string().max(4000),
      }),
    )
    .max(32),
  nextSteps: z.array(z.string().max(1000)).max(5),
});
export type InterviewReport = z.infer<typeof interviewReportSchema> & {
  transcript: Array<{
    question: string;
    answer: string;
    main: number;
    followup: number;
  }>;
  answered: number;
};
export const conversationInput = z.object({
  title: z.string().max(80).default("新对话"),
  mode: z.enum(["chat", "assess", "interview", "recap"]).default("chat"),
  questionId: z.string().max(160).optional(),
  questionVersion: z.number().int().positive().optional(),
  answer: z.string().max(12000).optional(),
  scope: z.string().max(1000).optional(),
  quote: z.string().max(4000).optional(),
  interview: interviewOptionsSchema.optional(),
});
export const messageInput = z.object({
  text: z.string().min(1).max(16000),
  key: z.string().min(8).max(160),
  action: z.enum(["chat", "assess", "followup", "recap"]).default("chat"),
  answer: z.string().max(12000).optional(),
});
export const generationInput = z.object({
  scope: z.string().min(2).max(1500),
  count: z.number().int().min(1).max(20).default(5),
  difficulty: z.enum(["基础", "进阶", "深入"]).default("进阶"),
  kind: z.enum(["mixed", "choice", "boolean", "oral"]).default("oral"),
  key: z.string().min(8).max(160),
  questionId: z.string().max(160).optional(),
});
export interface AiUser {
  id: string;
  username: string;
  role: "admin" | "learner";
}
export interface Conversation {
  id: string;
  title: string;
  mode: string;
  context: {
    question?: any;
    answer?: string;
    scope?: string;
    quote?: string;
    startedAt?: string;
    finished?: boolean;
    interview?: InterviewOptions;
    interviewState?: { main: number; followup: number };
  };
  updated_at: string;
}
export interface AiMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  result?: Assessment;
  report?: InterviewReport;
  interviewStep?: { main: number; followup: number };
  runId?: string;
  createdAt: string;
}
export interface AiRun {
  id: string;
  status:
    | "queued"
    | "running"
    | "succeeded"
    | "partially_succeeded"
    | "failed"
    | "outcome_unknown"
    | "canceled";
  kind: string;
  output: any;
  error?: string;
  conversation_id?: string;
  created_at: string;
}
export interface Candidate {
  id: string;
  question: GeneratedQuestion;
  checks: string[];
  review: string;
  saved: boolean;
  version: number;
  owner: string;
}
