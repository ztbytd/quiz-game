import { createHash } from "node:crypto";
import type { Database, Sql } from "../server/db.ts";
import { migrate } from "../server/db.ts";

type Table = {
  name: string;
  columns: readonly string[];
  order: readonly string[];
  json?: readonly string[];
  textCast?: readonly string[];
};

// Explicit columns and dependency order are part of transfer format version 1.
export const transferTables: readonly Table[] = [
  {
    name: "users",
    columns: ["id", "username", "password", "role", "created_at"],
    order: ["id"],
    textCast: ["created_at"],
  },
  {
    name: "invitations",
    columns: ["token", "used", "created_at"],
    order: ["token"],
    textCast: ["created_at"],
  },
  {
    name: "conversations",
    columns: ["id", "owner", "title", "mode", "context", "updated_at"],
    order: ["id"],
    json: ["context"],
    textCast: ["updated_at"],
  },
  {
    name: "runs",
    columns: [
      "id",
      "owner",
      "conversation_id",
      "kind",
      "key",
      "input",
      "output",
      "status",
      "error",
      "fence",
      "lease_until",
      "reserved",
      "usage_day",
      "created_at",
      "updated_at",
    ],
    order: ["id"],
    json: ["input", "output"],
    textCast: ["lease_until", "usage_day", "created_at", "updated_at"],
  },
  {
    name: "messages",
    columns: [
      "id",
      "conversation_id",
      "role",
      "text",
      "result",
      "run_id",
      "created_at",
    ],
    order: ["id"],
    json: ["result"],
    textCast: ["created_at"],
  },
  {
    name: "usage",
    columns: ["owner", "day", "reserved", "consumed"],
    order: ["owner", "day"],
    textCast: ["day"],
  },
  {
    name: "candidates",
    columns: [
      "id",
      "owner",
      "question",
      "checks",
      "review",
      "saved",
      "version",
      "created_at",
    ],
    order: ["id"],
    json: ["question", "checks"],
    textCast: ["created_at"],
  },
  {
    name: "candidate_versions",
    columns: ["question_id", "version", "question", "created_at"],
    order: ["question_id", "version"],
    json: ["question"],
    textCast: ["created_at"],
  },
  {
    name: "releases",
    columns: ["id", "bank", "by_user", "created_at"],
    order: ["id"],
    json: ["bank"],
    textCast: ["id", "created_at"],
  },
  {
    name: "content_upgrades",
    columns: ["id", "release_id", "detail", "created_at"],
    order: ["id"],
    json: ["detail"],
    textCast: ["release_id", "created_at"],
  },
  {
    name: "audits",
    columns: ["id", "actor", "action", "target", "detail", "created_at"],
    order: ["id"],
    json: ["detail"],
    textCast: ["id", "created_at"],
  },
  {
    name: "notes",
    columns: [
      "id",
      "owner",
      "message_id",
      "title",
      "content",
      "created_at",
      "version",
    ],
    order: ["id"],
    textCast: ["created_at"],
  },
];

export class TransferError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}
export type Rows = Record<string, Array<Record<string, unknown>>>;
export interface TransferPayload {
  format: "zhixu-offline-db-transfer";
  version: 1;
  exportedAt: string;
  sessionsExcluded: true;
  tables: Rows;
}
export interface TransferEnvelope {
  payload: TransferPayload;
  sha256: string;
}

export function canonical(value: unknown): string {
  const normalize = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(normalize);
    if (item !== null && typeof item === "object")
      return Object.fromEntries(
        Object.keys(item)
          .sort()
          .map((key) => [
            key,
            normalize((item as Record<string, unknown>)[key]),
          ]),
      );
    return item;
  };
  return JSON.stringify(normalize(value));
}
export const checksum = (value: unknown) =>
  createHash("sha256").update(canonical(value)).digest("hex");

// Database collation may change row order; preserve duplicates and every field.
export const rowsChecksum = (rows: Array<Record<string, unknown>>) =>
  checksum(rows.map((row) => canonical(row)).sort());

export function validateEnvelope(value: unknown): TransferPayload {
  const envelope = value as TransferEnvelope;
  if (
    !envelope ||
    typeof envelope !== "object" ||
    typeof envelope.sha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(envelope.sha256)
  )
    throw new TransferError("INVALID_ENVELOPE");
  const payload = envelope.payload;
  if (
    !payload ||
    payload.format !== "zhixu-offline-db-transfer" ||
    payload.version !== 1 ||
    payload.sessionsExcluded !== true ||
    typeof payload.exportedAt !== "string" ||
    !Number.isFinite(Date.parse(payload.exportedAt)) ||
    !payload.tables ||
    typeof payload.tables !== "object"
  )
    throw new TransferError("INVALID_PAYLOAD");
  if (checksum(payload) !== envelope.sha256)
    throw new TransferError("CHECKSUM_MISMATCH");
  const expected = transferTables.map((table) => table.name).sort();
  if (canonical(Object.keys(payload.tables).sort()) !== canonical(expected))
    throw new TransferError("UNEXPECTED_TABLES");
  for (const table of transferTables) {
    const rows = payload.tables[table.name];
    if (!Array.isArray(rows)) throw new TransferError("INVALID_ROWS");
    for (const row of rows) {
      if (
        !row ||
        Array.isArray(row) ||
        typeof row !== "object" ||
        canonical(Object.keys(row).sort()) !==
          canonical([...table.columns].sort())
      )
        throw new TransferError("UNEXPECTED_COLUMNS");
      for (const column of table.json || []) {
        if (row[column] === null) continue;
        if (typeof row[column] !== "string")
          throw new TransferError("INVALID_JSON_ENCODING");
        try {
          JSON.parse(row[column] as string);
        } catch {
          throw new TransferError("INVALID_JSON_ENCODING");
        }
      }
    }
  }
  if (
    payload.tables.runs.some(
      (row) => row.status === "queued" || row.status === "running",
    )
  )
    throw new TransferError("ACTIVE_TASKS");
  questionInventory(payload.tables);
  return payload;
}

export async function assertKnownTables(db: Sql, allowMissing = false) {
  const result = await db.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name",
  );
  const names = result.rows.map((row) => row.table_name as string);
  const expected = [
    ...transferTables.map((table) => table.name),
    "sessions",
  ].sort();
  if (
    names.some((name) => !expected.includes(name)) ||
    (!allowMissing && canonical(names) !== canonical(expected))
  )
    throw new TransferError("UNEXPECTED_DATABASE_SCHEMA");
  return names;
}

export async function readTables(db: Sql): Promise<Rows> {
  const tables: Rows = Object.create(null);
  for (const table of transferTables) {
    const columns = table.columns.map((column) =>
      table.textCast?.includes(column) || table.json?.includes(column)
        ? `${column}::text AS ${column}`
        : column,
    );
    tables[table.name] = (
      await db.query(
        `SELECT ${columns.join(",")} FROM ${table.name} ORDER BY ${table.order.map((column) => `${table.name}.${column}`).join(",")}`,
      )
    ).rows;
  }
  return tables;
}

export function questionInventory(tables: Rows) {
  return {
    releases: tables.releases
      .map((row) => {
        const questions = (
          typeof row.bank === "string" ? JSON.parse(row.bank) : undefined
        )?.questions;
        if (
          !Array.isArray(questions) ||
          questions.some((question) => typeof question?.id !== "string")
        )
          throw new TransferError("INVALID_QUESTION_INVENTORY");
        return {
          release: row.id,
          ids: questions.map((question) => question.id).sort(),
        };
      })
      .sort((left, right) => {
        const a = BigInt(String(left.release)),
          b = BigInt(String(right.release));
        return a < b ? -1 : a > b ? 1 : 0;
      }),
    candidates: tables.candidates.map((row) => row.id).sort(),
    versions: tables.candidate_versions
      .map((row) => [row.question_id, row.version])
      .sort((left, right) => {
        const a = canonical(left),
          b = canonical(right);
        return a < b ? -1 : a > b ? 1 : 0;
      }),
  };
}

export function statistics(tables: Rows) {
  const tableCounts = Object.fromEntries(
    transferTables.map((table) => [table.name, tables[table.name].length]),
  );
  const inventory = questionInventory(tables);
  return {
    tableCounts,
    totalRows: Object.values(tableCounts).reduce(
      (sum, count) => sum + count,
      0,
    ),
    latestPublicQuestions: inventory.releases.at(-1)?.ids.length || 0,
    personalQuestions: inventory.candidates.length,
  };
}

async function assertEmpty(db: Sql, names: string[]) {
  for (const name of names) {
    if ((await db.query(`SELECT 1 FROM ${name} LIMIT 1`)).rows.length)
      throw new TransferError("TARGET_NOT_EMPTY");
  }
}

// The CLI calls this only with PostgreSQL. The same SQL can be checked in an isolated PGlite fixture.
export async function restoreIntoEmpty(db: Database, payload: TransferPayload) {
  const before = await assertKnownTables(db, true);
  await assertEmpty(db, before);
  await migrate(db);
  return db.transaction(async (tx) => {
    await tx.query("SELECT pg_advisory_xact_lock(764121,1)");
    await tx.query(
      `LOCK TABLE ${[...transferTables.map((table) => table.name), "sessions"].join(",")} IN ACCESS EXCLUSIVE MODE`,
    );
    await tx.query("SET LOCAL TIME ZONE 'UTC'");
    await tx.query("SET LOCAL datestyle = 'ISO, YMD'");
    const names = await assertKnownTables(tx);
    await assertEmpty(tx, names);
    for (const table of transferTables) {
      const placeholders = table.columns.map(
        (column, index) =>
          `$${index + 1}${table.json?.includes(column) ? "::jsonb" : ""}`,
      );
      const sql = `INSERT INTO ${table.name} (${table.columns.join(",")}) VALUES (${placeholders.join(",")})`;
      for (const row of payload.tables[table.name])
        await tx.query(
          sql,
          table.columns.map((column) => row[column]),
        );
    }
    const restored = await readTables(tx);
    for (const table of transferTables)
      if (
        restored[table.name].length !== payload.tables[table.name].length ||
        rowsChecksum(restored[table.name]) !==
          rowsChecksum(payload.tables[table.name])
      )
        throw new TransferError(
          `ROW_VERIFICATION_FAILED_${table.name.toUpperCase()}`,
        );
    if (
      checksum(questionInventory(restored)) !==
      checksum(questionInventory(payload.tables))
    )
      throw new TransferError("QUESTION_IDS_MISMATCH");
    if ((await tx.query("SELECT 1 FROM sessions LIMIT 1")).rows.length)
      throw new TransferError("SESSIONS_NOT_EMPTY");
    // ALTER SEQUENCE participates in rollback, unlike setval().
    for (const name of ["releases", "audits"] as const) {
      const result = await tx.query(
        `SELECT COALESCE(MAX(id),0)::text AS maximum FROM ${name}`,
      );
      const next = BigInt(result.rows[0].maximum) + 1n;
      if (next > 9223372036854775807n)
        throw new TransferError("SEQUENCE_EXHAUSTED");
      await tx.query(
        `ALTER SEQUENCE ${name}_id_seq RESTART WITH ${next.toString()}`,
      );
    }
    return statistics(restored);
  });
}
