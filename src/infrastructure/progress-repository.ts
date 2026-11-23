import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { ProgressSnapshot } from "@/domain/types";
import { learningDatabaseName } from "./learning-storage";

interface StudyDB extends DBSchema {
  state: { key: string; value: unknown };
}
export interface ProgressRepository {
  load(): Promise<unknown>;
  loadState(): Promise<{ progress: unknown; revision: number }>;
  save(progress: ProgressSnapshot, revision?: number): Promise<void>;
  flush(): Promise<void>;
}

/** A serialized adapter. Content and domain code do not depend on browser storage. */
export function createProgressRepository(
  name = learningDatabaseName(),
): ProgressRepository {
  let connection: Promise<IDBPDatabase<StudyDB>> | undefined;
  let tail: Promise<void> = Promise.resolve();
  const database = () =>
    (connection ??= openDB<StudyDB>(name, 1, {
      upgrade(db) {
        db.createObjectStore("state");
      },
      terminated() {
        connection = undefined;
      },
    }));
  return {
    async load() {
      await tail.catch(() => {});
      return (await database()).get("state", "progress");
    },
    async loadState() {
      await tail.catch(() => {});
      const tx = (await database()).transaction("state", "readonly");
      const [progress, revision] = await Promise.all([
        tx.store.get("progress"),
        tx.store.get("revision"),
      ]);
      await tx.done;
      return {
        progress,
        revision: typeof revision === "number" ? revision : 0,
      };
    },
    save(progress, revision) {
      const snapshot = structuredClone(progress);
      const operation = tail
        .catch(() => {})
        .then(async () => {
          const db = await database(),
            tx = db.transaction("state", "readwrite");
          const previous = await tx.store.get("revision"),
            committed = typeof previous === "number" ? previous : 0;
          if (revision !== undefined && revision < committed) {
            await tx.done;
            return;
          }
          await tx.store.put(snapshot, "progress");
          await tx.store.put(revision ?? committed + 1, "revision");
          await tx.done;
        });
      tail = operation;
      return operation;
    },
    flush() {
      return tail;
    },
  };
}

export interface WriterLease {
  writable: boolean;
  release(): void;
}
/** Nonblocking exclusive lease. Holding it while editing also protects the shared journal. */
export function acquireWriterLease(
  manager: Pick<LockManager, "request"> | undefined,
): Promise<WriterLease> {
  if (!manager) return Promise.resolve({ writable: false, release() {} });
  return new Promise((resolve) => {
    let release = () => {};
    const held = new Promise<void>((done) => {
      release = done;
    });
    try {
      void manager
        .request(
          "interview-workbench-v2-writer",
          { ifAvailable: true },
          async (lock) => {
            if (!lock) {
              resolve({ writable: false, release() {} });
              return;
            }
            resolve({ writable: true, release });
            await held;
          },
        )
        .catch(() => resolve({ writable: false, release() {} }));
    } catch {
      resolve({ writable: false, release() {} });
    }
  });
}
