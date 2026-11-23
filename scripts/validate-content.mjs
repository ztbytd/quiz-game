import fs from "node:fs";
import assert from "node:assert/strict";
const bank = JSON.parse(
  fs.readFileSync(new URL("../src/data/bank.json", import.meta.url), "utf8"),
);
const questions = new Map(bank.questions.map((q) => [q.id, q]));
assert.equal(questions.size, bank.questions.length, "duplicate question IDs");
const chains = new Map(bank.chains.map((c) => [c.id, c]));
const groups = new Map(bank.groups.map((g) => [g.id, g]));
const topics = new Map(bank.topics.map((t) => [t.id, t]));
assert.equal(topics.size, bank.topics.length);
assert.equal(chains.size, bank.chains.length);
assert.equal(groups.size, bank.groups.length);
const unique = (ids, name) => assert.equal(new Set(ids).size, ids.length, name);
for (const q of questions.values()) {
  assert.ok(q.prompt.trim() && q.explanation.trim(), q.id);
  assert.ok(["choice", "boolean", "oral"].includes(q.kind), q.id);
  if (q.kind === "choice") {
    assert.ok(
      q.choices.length >= 2 &&
        Number.isInteger(q.correctAnswer) &&
        q.choices[q.correctAnswer],
      q.id,
    );
    assert.ok(
      q.choices.every((s) => s.trim()),
      q.id,
    );
    unique(q.choices, q.id);
  }
  if (q.kind === "boolean")
    assert.equal(typeof q.correctAnswer, "boolean", q.id);
  if (q.chainId) assert.ok(chains.has(q.chainId), q.id);
  assert.ok(topics.has(q.topicId), q.id);
  for (const source of [
    ...(q.source ? [q.source] : []),
    ...(q.detail?.sources || []),
  ])
    assert.ok(source[0] && /^https:\/\//.test(source[1]), q.id);
  if (q.id.includes(":supplement-")) {
    assert.ok(
      q.explanation.length >= 100 && q.explanation.length <= 260,
      q.id + " main answer length",
    );
    assert.ok(
      q.detail?.followups?.length &&
        q.detail.followups.every(([p, a]) => p && a.length >= 30),
      q.id,
    );
  }
}
const covered = new Set();
for (const t of bank.topics) {
  assert.ok(t.questionIds.length >= 20, t.id + " topic coverage");
  unique(t.questionIds, t.id);
  unique(
    t.sections.map((s) => s.id),
    t.id,
  );
  assert.ok(
    t.sections.some((s) => s.kind === "foundation") &&
      t.sections.some((s) => s.kind === "application"),
    t.id,
  );
  const chapterIds = [];
  for (const section of t.sections) {
    assert.ok(section.questionIds.length && section.title, t.id);
    unique(section.questionIds, section.id);
    if (section.kind === "chain")
      assert.deepEqual(
        section.questionIds,
        chains.get(section.id)?.questionIds,
        section.id,
      );
    for (const id of section.questionIds) {
      assert.ok(questions.has(id), id);
      covered.add(id);
      chapterIds.push(id);
    }
  }
  assert.deepEqual([...new Set(chapterIds)], t.questionIds, t.id);
}
assert.equal(
  covered.size,
  questions.size,
  "all questions must appear in a curriculum",
);
for (const c of bank.chains) {
  assert.ok(groups.has(c.groupId), c.id);
  assert.ok(groups.get(c.groupId).chainIds.includes(c.id), c.id);
  unique(c.questionIds, c.id);
  c.questionIds.forEach((id, index) => {
    assert.equal(questions.get(id)?.chainId, c.id, id);
    assert.equal(questions.get(id)?.stepIndex, index, id);
  });
}
for (const g of bank.groups)
  for (const id of g.chainIds) assert.ok(chains.has(id), id);
for (const item of bank.coverage)
  for (const id of [...item.existing, ...item.added])
    assert.ok(chains.has(id), id);
const choices = bank.questions.filter((q) => q.kind === "choice");
let longest = 0,
  shortest = 0,
  double = 0;
for (const q of choices) {
  const lengths = q.choices.map((s) => s.length),
    correct = lengths[q.correctAnswer];
  longest += correct === Math.max(...lengths);
  shortest += correct === Math.min(...lengths);
  double +=
    correct >
    (2 * (lengths.reduce((a, b) => a + b) - correct)) / (lengths.length - 1);
}
assert.ok(
  longest / choices.length <= 0.35,
  "correct choices too often longest",
);
assert.ok(
  shortest / choices.length <= 0.35,
  "correct choices too often shortest",
);
assert.ok(
  double / choices.length <= 0.05,
  "correct choices disproportionately verbose",
);
console.log(
  JSON.stringify(
    {
      questions: questions.size,
      topics: topics.size,
      chains: chains.size,
      perTopic: [
        Math.min(...bank.topics.map((t) => t.questionIds.length)),
        Math.max(...bank.topics.map((t) => t.questionIds.length)),
      ],
      choices: choices.length,
      correctLongest: longest,
      correctShortest: shortest,
      overTwiceOthers: double,
    },
    null,
    2,
  ),
);
