import pg from "pg";
import { mkdir } from "node:fs/promises";
export interface Sql {
  query(sql: string, params?: any[]): Promise<{ rows: any[] }>;
}
export interface Database extends Sql {
  transaction<T>(fn: (tx: Sql) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
export async function database(
  url?: string,
  localPath = "server/data",
): Promise<Database> {
  if (url) {
    const pool = new pg.Pool({ connectionString: url, max: 8 });
    return {
      query: (s, p) => pool.query(s, p),
      transaction: async (fn) => {
        const c = await pool.connect();
        try {
          await c.query("BEGIN");
          const r = await fn(c);
          await c.query("COMMIT");
          return r;
        } catch (e) {
          await c.query("ROLLBACK");
          throw e;
        } finally {
          c.release();
        }
      },
      close: () => pool.end(),
    };
  }
  if (process.env.NODE_ENV === "production")
    throw new Error("生产环境必须配置 DATABASE_URL");
  const { PGlite } = await import("@electric-sql/pglite");
  if (localPath !== ":memory:") await mkdir(localPath, { recursive: true });
  const db = new PGlite(localPath === ":memory:" ? undefined : localPath);
  // Serialize embedded transactions and reads so development matches pool isolation.
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(fn: () => Promise<T>) => {
    const p = queue.then(fn, fn);
    queue = p.catch(() => {});
    return p;
  };
  return {
    query: (s, p) => serial(() => db.query(s, p)),
    transaction: (fn) =>
      serial(() =>
        db.transaction((tx) => fn({ query: (s, p) => tx.query(s, p) })),
      ),
    close: () => db.close(),
  };
}
export async function migrate(db: Database) {
  const statements = [
    `CREATE TABLE IF NOT EXISTS users (id text PRIMARY KEY, username text UNIQUE NOT NULL, password text NOT NULL, role text NOT NULL DEFAULT 'learner', created_at timestamptz NOT NULL DEFAULT now())`,
    `CREATE TABLE IF NOT EXISTS sessions (token text PRIMARY KEY, user_id text REFERENCES users(id), csrf text NOT NULL, expires_at timestamptz NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS invitations (token text PRIMARY KEY, used boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now())`,
    `CREATE TABLE IF NOT EXISTS conversations (id text PRIMARY KEY, owner text REFERENCES users(id), title text NOT NULL, mode text NOT NULL, context jsonb NOT NULL DEFAULT '{}', updated_at timestamptz NOT NULL DEFAULT now())`,
    `CREATE TABLE IF NOT EXISTS messages (id text PRIMARY KEY, conversation_id text REFERENCES conversations(id) ON DELETE CASCADE, role text NOT NULL, text text NOT NULL, result jsonb, run_id text, created_at timestamptz NOT NULL DEFAULT now())`,
    `CREATE TABLE IF NOT EXISTS runs (id text PRIMARY KEY, owner text REFERENCES users(id), conversation_id text REFERENCES conversations(id) ON DELETE CASCADE, kind text NOT NULL, key text NOT NULL, input jsonb NOT NULL, output jsonb NOT NULL DEFAULT '{}', status text NOT NULL DEFAULT 'queued', error text, fence integer NOT NULL DEFAULT 0, lease_until timestamptz, reserved integer NOT NULL DEFAULT 0, usage_day date NOT NULL DEFAULT CURRENT_DATE, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(owner,key))`,
    `CREATE INDEX IF NOT EXISTS runs_queue ON runs(status,created_at)`,
    `CREATE TABLE IF NOT EXISTS usage (owner text REFERENCES users(id), day date NOT NULL DEFAULT CURRENT_DATE, reserved integer NOT NULL DEFAULT 0, consumed integer NOT NULL DEFAULT 0, PRIMARY KEY(owner,day))`,
    `CREATE TABLE IF NOT EXISTS candidates (id text PRIMARY KEY, owner text REFERENCES users(id), question jsonb NOT NULL, checks jsonb NOT NULL, review text NOT NULL DEFAULT 'unreviewed', saved boolean NOT NULL DEFAULT false, version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now())`,
    `CREATE TABLE IF NOT EXISTS candidate_versions (question_id text NOT NULL REFERENCES candidates(id),version integer NOT NULL,question jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(question_id,version))`,
    `CREATE TABLE IF NOT EXISTS releases (id bigserial PRIMARY KEY, bank jsonb NOT NULL, by_user text, created_at timestamptz NOT NULL DEFAULT now())`,
    `CREATE TABLE IF NOT EXISTS content_upgrades (id text PRIMARY KEY,release_id bigint REFERENCES releases(id),detail jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now())`,
    `CREATE TABLE IF NOT EXISTS audits (id bigserial PRIMARY KEY, actor text NOT NULL, action text NOT NULL, target text NOT NULL, detail jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now())`,
    `CREATE TABLE IF NOT EXISTS notes (id text PRIMARY KEY,owner text NOT NULL REFERENCES users(id),message_id text NOT NULL,title text NOT NULL,content text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(owner,message_id))`,
    `ALTER TABLE notes ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1`,
  ];
  await db.transaction(async (tx) => {
    // PostgreSQL can race on CREATE TABLE IF NOT EXISTS itself; serialize schema setup
    // before the content row lock is available to concurrently starting API/Workers.
    await tx.query("SELECT pg_advisory_xact_lock(764121,1)");
    for (const sql of statements) await tx.query(sql);
  });
}
