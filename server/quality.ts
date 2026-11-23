import { z } from "zod";
export const reviewSchema = z.object({
  reviews: z
    .array(
      z.object({
        index: z.number().int().min(0),
        issues: z.array(z.string().min(1).max(500)).max(8),
      }),
    )
    .max(5),
});
export const qualityPrompt =
  'QUALITY_REVIEW：独立复核以下面试题。检查题干与答案是否对应、技术事实与条件、选择题是否唯一正确、干扰项是否有意义、合理替代方案、是否捏造来源。只输出 JSON {"reviews":[{"index":0,"issues":["具体严重问题"]}]}。逐题按从0起始的index返回，所有题均须覆盖；无实质问题时issues为空数组。不要因为表达不同而否定正确方案。';
export function nearDuplicate(a: string, b: string) {
  const norm = (s: string) => s.toLowerCase().replace(/[\s\p{P}\p{S}]/gu, "");
  a = norm(a);
  b = norm(b);
  if (a === b) return true;
  if (a.length < 12 || b.length < 12) return false;
  const grams = (s: string) =>
    new Set(Array.from({ length: s.length - 2 }, (_, i) => s.slice(i, i + 3)));
  const x = grams(a),
    y = grams(b);
  let overlap = 0;
  for (const g of x) if (y.has(g)) overlap++;
  return overlap / (x.size + y.size - overlap) > 0.86;
}
export function optionChecks(q: any): string[] {
  if (q.kind !== "choice" || !q.choices || typeof q.correctAnswer !== "number")
    return [];
  const lengths = q.choices.map((s: string) => s.replace(/\s/g, "").length);
  const correct = lengths[q.correctAnswer],
    others = lengths.filter((_: number, i: number) => i !== q.correctAnswer);
  return correct > 30 && correct > Math.max(...others) * 1.7
    ? ["正确选项明显过长，需平衡选项信息量"]
    : [];
}
