export function normalizeQuestion(value: any) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const q = structuredClone(value);
  if (q.kind === "oral") {
    delete q.choices;
    delete q.correctAnswer;
  }
  if (q.kind === "boolean") delete q.choices;
  if (q.detail === null) delete q.detail;
  if (q.detail && typeof q.detail === "object")
    for (const key of Object.keys(q.detail))
      if (q.detail[key] === null) delete q.detail[key];
  if (q.detail && typeof q.detail === "object")
    for (const key of ["principle", "example", "pitfalls"])
      if (
        Array.isArray(q.detail[key]) &&
        q.detail[key].every((line: unknown) => typeof line === "string")
      )
        q.detail[key] = q.detail[key].join("\n");
  if (q.rubric && typeof q.rubric === "object")
    for (const key of ["alternatives", "mistakes"])
      if (q.rubric[key] === null) q.rubric[key] = [];
  return q;
}
