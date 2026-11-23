import type { StudyQuestion } from "./types";
export function validQuestion(q: any): q is StudyQuestion {
  const text = (s: unknown, max = 20000) =>
    typeof s === "string" && s.length <= max;
  if (
    !q ||
    typeof q !== "object" ||
    !text(q.id, 160) ||
    !q.id ||
    ["__proto__", "constructor", "prototype"].includes(q.id) ||
    !text(q.prompt, 8000) ||
    !text(q.explanation) ||
    !["choice", "boolean", "oral"].includes(q.kind)
  )
    return false;
  if (
    q.kind === "choice" &&
    (!Array.isArray(q.choices) ||
      q.choices.length < 2 ||
      q.choices.length > 6 ||
      !q.choices.every((x: unknown) => text(x, 4000)) ||
      !Number.isInteger(q.correctAnswer) ||
      q.correctAnswer < 0 ||
      q.correctAnswer >= q.choices.length)
  )
    return false;
  if (q.kind === "boolean" && typeof q.correctAnswer !== "boolean")
    return false;
  if (q.detail) {
    if (typeof q.detail !== "object" || Array.isArray(q.detail)) return false;
    for (const key of ["principle", "example", "code", "pitfalls"])
      if (q.detail[key] !== undefined && !text(q.detail[key], 40000))
        return false;
    if (
      q.detail.followups !== undefined &&
      (!Array.isArray(q.detail.followups) ||
        !q.detail.followups.every(
          (x: unknown) =>
            Array.isArray(x) && x.length === 2 && x.every((t) => text(t)),
        ))
    )
      return false;
  }
  return true;
}
