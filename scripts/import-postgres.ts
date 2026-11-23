import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { database } from "../server/db.ts";
import {
  restoreIntoEmpty,
  TransferError,
  validateEnvelope,
} from "./db-transfer.ts";

export async function importPostgres(input: string) {
  if (!path.isAbsolute(input) || !input.endsWith(".private.local"))
    throw new TransferError("EXPLICIT_PRIVATE_PATH_REQUIRED");
  const url = process.env.DATABASE_URL;
  if (!url || !["postgres:", "postgresql:"].includes(new URL(url).protocol))
    throw new TransferError("POSTGRES_URL_REQUIRED");
  if ((await stat(input)).size > 128 * 1024 * 1024)
    throw new TransferError("SNAPSHOT_TOO_LARGE");
  const payload = validateEnvelope(JSON.parse(await readFile(input, "utf8")));
  const db = await database(url);
  try {
    return {
      ok: true,
      ...(await restoreIntoEmpty(db, payload)),
      sessionsImported: 0,
    };
  } finally {
    await db.close();
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const args = process.argv.slice(2);
  const input = args.length === 2 && args[0] === "--input" ? args[1]! : "";
  importPostgres(input)
    .then((result) => console.log(JSON.stringify(result)))
    .catch((error) => {
      console.error(
        JSON.stringify({
          ok: false,
          code: error instanceof TransferError ? error.code : "IMPORT_FAILED",
        }),
      );
      process.exitCode = 1;
    });
}
