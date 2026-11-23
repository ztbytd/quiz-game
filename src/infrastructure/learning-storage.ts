export const LEARNING_DATABASE = "zhixu-learning-v3";
export const PENDING_JOURNAL_KEY = "zhixu-learning.v3.pending";
export const RECORDS_RESET_MARKER = "zhixu-learning.v3.reset-complete";

export function learningDatabaseName(accountId = "") {
  return accountId ? `${LEARNING_DATABASE}-${accountId}` : LEARNING_DATABASE;
}

const oldDatabase = (name: string) =>
  name === "interview-workbench-v2" ||
  name.startsWith("interview-workbench-v2-");

function deleteRecordsDatabase(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(new Error("请关闭其他知序页面，再刷新以完成旧记录清理。"));
  });
}

/** One-time removal of retired learning records; content databases are excluded. */
export async function resetOldLearningRecords() {
  if (localStorage.getItem(RECORDS_RESET_MARKER) === "done") return;

  const names = new Set(["interview-workbench-v2"]);
  const previousAccount = localStorage.getItem("zhixu-active-account");
  if (previousAccount) names.add(`interview-workbench-v2-${previousAccount}`);
  if (typeof indexedDB.databases === "function") {
    for (const database of await indexedDB.databases())
      if (database.name && oldDatabase(database.name)) names.add(database.name);
  }
  for (const name of names) await deleteRecordsDatabase(name);

  const keys = Array.from({ length: localStorage.length }, (_, i) =>
    localStorage.key(i),
  );
  for (const key of keys) {
    if (
      key &&
      (key === "quiz-game.progress.v1" ||
        key === "frontend-deep-review-2026-v1" ||
        key === "interview-workbench.v2.pending" ||
        key.startsWith("interview-workbench.v2.pending:") ||
        key.startsWith("zhixu-ai-draft:"))
    )
      localStorage.removeItem(key);
  }
  localStorage.setItem(RECORDS_RESET_MARKER, "done");
}
