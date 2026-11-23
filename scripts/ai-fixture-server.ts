// Integration test provider: never selected by the application entry point.
import { database } from "../server/db.ts";
import { createApp } from "../server/app.ts";
const db = await database(undefined, ":memory:");
let generated = 0;
const { app } = await createApp({
  db,
  origin: process.env.AI_TEST_ORIGIN || "http://127.0.0.1:5174",
  adminName: "tester",
  adminPassword: "test-only-password",
  dailyTokens: 2_000_000,
  complete: async (messages, options) => {
    if (messages[0]?.content.includes("INTERVIEW_STEP"))
      return {
        text: JSON.stringify({
          question: "路由切换时，上传请求怎样取消并正确保存任务状态？",
          action:
            messages[0]!.content.includes("追问是否允许=true") &&
            messages.at(-1)!.content.includes("AbortController")
              ? "followup"
              : "next",
        }),
        tokens: 150,
      };
    if (messages[0]?.content.includes("INTERVIEW_REPORT")) {
      const { transcript } = JSON.parse(messages.at(-1)!.content);
      return {
        text: JSON.stringify({
          summary: transcript.length
            ? "本次说明了取消请求的方法，后续需要补充状态恢复与并发处理。"
            : "本次只完成了面试开场，没有提交技术作答，后续需要独立完成场景题。",
          strengths: transcript.length
            ? [
                {
                  quote: transcript[0].answer,
                  comment: "明确了取消请求的实现。",
                },
              ]
            : [],
          gaps: [],
          answers: transcript.map((t: any, i: number) => ({
            index: i + 1,
            comment: "需要继续说明取消和旧响应校验的配合。",
            improvedAnswer:
              "我会取消不再需要的请求，再校验请求序号，避免旧响应覆盖新状态。",
          })),
          nextSteps: ["练习上传取消和恢复。"],
        }),
        tokens: 150,
      };
    }
    if (messages[0]?.content.includes("QUALITY_REVIEW"))
      return {
        text: JSON.stringify({
          reviews: JSON.parse(messages.at(-1)!.content).map(
            (_: unknown, index: number) => ({ index, issues: [] }),
          ),
        }),
        tokens: 100,
      };
    if (messages[0]?.content.includes("questions")) {
      const input = JSON.parse(messages.at(-1)!.content);
      return {
        text: JSON.stringify({
          questions: Array.from({ length: input.count }, (_, i) => ({
            kind: "oral",
            prompt: [
              "上传合并发生重复请求时，如何利用幂等键避免多次生成文件？",
              "异步搜索发生响应乱序时，怎样确保界面展示最近一次输入的结果？",
              "浏览器刷新后，如何从服务端恢复已经成功上传的分片进度？",
              "临时文件清理任务与正在执行的合并任务冲突时，怎样保证结果一致？",
              "文件摘要计算影响输入响应时，怎样定位长任务并安排后台计算？",
            ][generated++ % 5],
            explanation:
              "我会为上传批次建立唯一任务，使用服务端原子状态变化取得执行权，重复请求返回已有状态。合并先写入临时结果，完成完整性校验后再切换为正式文件。任务失败时记录可恢复状态，并校验版本令牌，防止过期任务覆盖新结果。",
            knowledgePoints: ["上传幂等", "异常恢复"],
            angle: "场景",
            rubric: {
              required: ["唯一任务", "原子状态变化"],
              alternatives: ["数据库唯一键"],
              mistakes: ["只依赖客户端"],
            },
          })),
        }),
        tokens: 1800,
      };
    }
    const text =
      "幂等是同一个请求执行多次，产生的业务结果与执行一次保持一致。\n\n例如合并上传文件时，我会用文件标识和上传批次建立唯一任务，再通过服务端的原子状态变化取得执行权。重复请求返回已有任务状态，避免反复生成文件。\n\n如果执行过程中失败，还需要记录可恢复状态，并防止已经过期的旧任务覆盖新结果。";
    await options.delta?.(text.slice(0, 22));
    await new Promise((r) => setTimeout(r, 300));
    await options.delta?.(text);
    return { text, tokens: 300 };
  },
});
await app.listen({
  host: "127.0.0.1",
  port: Number(process.env.AI_TEST_PORT || 3102),
});
console.log("AI integration fixture ready");
for (const event of ["SIGINT", "SIGTERM"])
  process.on(event, () => {
    void app
      .close()
      .then(() => db.close())
      .then(() => process.exit());
  });
