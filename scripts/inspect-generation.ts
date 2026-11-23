import { mkdir, writeFile } from "node:fs/promises";
import { provider } from "../server/provider.ts";
import { questionSchema } from "../packages/contracts/ai.ts";
import { basePrompt, generationPrompt } from "../server/prompts.ts";
import { normalizeQuestion } from "../server/generated-question.ts";
process.loadEnvFile("server/.env.local");
const complete = provider({
  baseUrl: process.env.AI_BASE_URL!,
  model: process.env.AI_MODEL!,
  apiKey: process.env.AI_API_KEY!,
});
const result = await complete(
  [
    { role: "system", content: basePrompt + "\n" + generationPrompt },
    {
      role: "user",
      content: JSON.stringify({
        scope: "前端异步取消与过期结果覆盖，分别考查搜索请求和组件卸载",
        count: 2,
        kind: "oral",
        difficulty: "进阶",
      }),
    },
  ],
  { structured: true, maxTokens: 6000, signal: AbortSignal.timeout(180000) },
);
await mkdir("test-results", { recursive: true });
await writeFile("test-results/live-generation.json", result.text);
const data = JSON.parse(result.text);
console.log(
  JSON.stringify({
    questions: data.questions?.map((q: any) => {
      const parsed = questionSchema.safeParse(normalizeQuestion(q));
      return {
        keys: Object.keys(q),
        success: parsed.success,
        issues: parsed.success ? [] : parsed.error.issues,
      };
    }),
    tokens: result.tokens,
  }),
);
