import { readFile, writeFile } from "node:fs/promises";
import { provider } from "../server/provider.ts";
import { qualityPrompt, reviewSchema } from "../server/quality.ts";
import { normalizeQuestion } from "../server/generated-question.ts";
process.loadEnvFile("server/.env.local");
const questions = JSON.parse(
  await readFile("test-results/live-generation.json", "utf8"),
).questions.map(normalizeQuestion);
const complete = provider({
  baseUrl: process.env.AI_BASE_URL!,
  apiKey: process.env.AI_API_KEY!,
  model: process.env.AI_MODEL!,
});
try {
  const result = await complete(
    [
      { role: "system", content: qualityPrompt },
      { role: "user", content: JSON.stringify(questions) },
    ],
    { structured: true, maxTokens: 2000, signal: AbortSignal.timeout(180000) },
  );
  await writeFile("test-results/live-quality.json", result.text);
  const data = reviewSchema.parse(JSON.parse(result.text));
  console.log(JSON.stringify({ reviews: data.reviews, tokens: result.tokens }));
} catch (e: any) {
  console.log(JSON.stringify({ error: e.message, code: e.cause?.code }));
  process.exitCode = 1;
}
