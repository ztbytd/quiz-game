import { openDB } from "idb";
import type { Bank, StudyQuestion } from "../domain/types";
const database = () =>
  openDB("zhixu-content-v1", 1, {
    upgrade(db) {
      db.createObjectStore("content");
    },
  });
export async function cachedContent(
  owner = typeof localStorage === "undefined"
    ? "guest"
    : localStorage.getItem("zhixu-active-account") || "guest",
): Promise<{
  bank?: Bank;
  personal?: StudyQuestion[];
  archive?: StudyQuestion[];
}> {
  const db = await database();
  const [bank, personal, archive] = await Promise.all([
    db.get("content", "public"),
    db.get("content", "personal:" + owner),
    db.get("content", "archive"),
  ]);
  return { bank, personal, archive };
}
export async function cachePublic(bank: Bank) {
  const db = await database();
  const tx = db.transaction("content", "readwrite");
  const previous = await tx.store.get("public");
  const archived: StudyQuestion[] = (await tx.store.get("archive")) || [];
  const snapshots = new Map(
    [...archived, ...(previous?.questions || [])].map((q) => [q.id, q]),
  );
  await tx.store.put([...snapshots.values()], "archive");
  await tx.store.put(JSON.parse(JSON.stringify(bank)), "public");
  await tx.done;
}
export async function cachePersonal(
  questions: StudyQuestion[],
  owner = localStorage.getItem("zhixu-active-account") || "guest",
) {
  const db = await database();
  await db.put(
    "content",
    JSON.parse(JSON.stringify(questions)),
    "personal:" + owner,
  );
}
export async function clearPersonalCache(
  owner = localStorage.getItem("zhixu-active-account") || "guest",
) {
  const db = await database();
  await db.delete("content", "personal:" + owner);
}
