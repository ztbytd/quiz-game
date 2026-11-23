import { readFile } from "node:fs/promises";
import type { Database, Sql } from "./db.ts";

interface FieldPatch {
  id: string;
  path: string[];
  before: string;
  after: string;
}
interface ReviewedRevision {
  id: string;
  bankVersion: string;
  questionVersion: number;
  patches: FieldPatch[];
}
export const reviewedRevision: ReviewedRevision = JSON.parse(
  await readFile(
    new URL("./content-revisions/2026.11.23-quality.2.json", import.meta.url),
    "utf8",
  ),
);
interface FieldReference {
  id: string;
  path: string;
}
export interface ContentUpgradeResult {
  id: string;
  sourceRelease: string;
  publishedRelease: string | null;
  seeded: boolean;
  applied: FieldReference[];
  alreadyCurrent: FieldReference[];
  conflicts: Array<
    FieldReference & { reason: "missing_question" | "modified_field" }
  >;
}

/** Apply only bundled, reviewed old-value/new-value changes to the latest public bank. */
export async function initializeContent(db: Database, seed: any) {
  return db.transaction(async (tx): Promise<ContentUpgradeResult> => {
    await lockPublicContent(tx);
    const recorded = (
      await tx.query("SELECT detail FROM content_upgrades WHERE id=$1", [
        reviewedRevision.id,
      ])
    ).rows[0];
    if (recorded) return recorded.detail;

    let current = (
      await tx.query(
        "SELECT id,bank FROM releases ORDER BY id DESC LIMIT 1 FOR UPDATE",
      )
    ).rows[0];
    const seeded = !current;
    if (!current)
      current = (
        await tx.query(
          "INSERT INTO releases(bank) VALUES($1) RETURNING id,bank",
          [JSON.stringify(seed)],
        )
      ).rows[0];

    const next = structuredClone(current.bank);
    const questions = new Map<string, any>(
      next.questions.map((question: any) => [question.id, question]),
    );
    const result: ContentUpgradeResult = {
      id: reviewedRevision.id,
      sourceRelease: String(current.id),
      publishedRelease: null,
      seeded,
      applied: [],
      alreadyCurrent: [],
      conflicts: [],
    };
    const changed = new Set<string>();
    for (const patch of reviewedRevision.patches) {
      const reference = { id: patch.id, path: patch.path.join(".") };
      const question = questions.get(patch.id);
      if (!question) {
        result.conflicts.push({ ...reference, reason: "missing_question" });
        continue;
      }
      const key = patch.path.at(-1)!;
      const target = patch.path
        .slice(0, -1)
        .reduce((value: any, part) => value?.[part], question);
      const actual = target?.[key];
      if (actual === patch.after) {
        result.alreadyCurrent.push(reference);
      } else if (actual === patch.before) {
        target[key] = patch.after;
        changed.add(question.id);
        result.applied.push(reference);
      } else {
        result.conflicts.push({ ...reference, reason: "modified_field" });
      }
    }
    if (changed.size) {
      for (const id of changed) {
        const question = questions.get(id)!;
        const version =
          Number.isSafeInteger(question.version) && question.version > 0
            ? question.version
            : 1;
        question.version = Math.max(
          version + 1,
          reviewedRevision.questionVersion,
        );
      }
      next.version = reviewedRevision.bankVersion;
      const published = await tx.query(
        "INSERT INTO releases(bank,by_user) VALUES($1,'system:content-upgrade') RETURNING id",
        [JSON.stringify(next)],
      );
      result.publishedRelease = String(published.rows[0].id);
    }
    await tx.query(
      "INSERT INTO content_upgrades(id,release_id,detail) VALUES($1,$2,$3)",
      [
        reviewedRevision.id,
        result.publishedRelease || result.sourceRelease,
        JSON.stringify(result),
      ],
    );
    if (result.applied.length || result.conflicts.length)
      await tx.query(
        "INSERT INTO audits(actor,action,target,detail) VALUES('system:content-upgrade',$1,$2,$3)",
        [
          result.applied.length
            ? "content_upgrade"
            : "content_upgrade_conflict",
          reviewedRevision.id,
          JSON.stringify(result),
        ],
      );
    return result;
  });
}

/** Acquire before reading the latest release in every transaction that publishes public content. */
export async function lockPublicContent(tx: Sql) {
  await tx.query(
    "INSERT INTO content_upgrades(id) VALUES('__bootstrap_lock__') ON CONFLICT DO NOTHING",
  );
  await tx.query(
    "SELECT id FROM content_upgrades WHERE id='__bootstrap_lock__' FOR UPDATE",
  );
}
