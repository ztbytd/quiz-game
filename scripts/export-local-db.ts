import {
  access,
  chmod,
  lstat,
  open,
  readFile,
  realpath,
} from "node:fs/promises";
import path from "node:path";
import net from "node:net";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import {
  assertKnownTables,
  checksum,
  readTables,
  statistics,
  TransferError,
  type TransferEnvelope,
} from "./db-transfer.ts";

interface ExportOptions {
  source: string;
  output: string;
  offline: boolean;
  checkPorts?: number[];
}

async function listening(port: number) {
  return new Promise<boolean>((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    const finish = (value: boolean) => {
      socket.destroy();
      resolve(value);
    };
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.setTimeout(1000, () => finish(true));
  });
}

export async function exportLocalDb(options: ExportOptions) {
  if (!options.offline)
    throw new TransferError("OFFLINE_CONFIRMATION_REQUIRED");
  if (
    !path.isAbsolute(options.source) ||
    !path.isAbsolute(options.output) ||
    !options.output.endsWith(".private.local")
  )
    throw new TransferError("EXPLICIT_PRIVATE_PATH_REQUIRED");
  const source = await realpath(options.source);
  const output = path.join(
    await realpath(path.dirname(options.output)),
    path.basename(options.output),
  );
  if (!(await lstat(source)).isDirectory())
    throw new TransferError("SOURCE_NOT_DIRECTORY");
  await readFile(path.join(source, "PG_VERSION"), "utf8");
  if (
    await access(path.join(source, "postmaster.pid")).then(
      () => true,
      () => false,
    )
  )
    throw new TransferError("SOURCE_NOT_CLEANLY_CLOSED");
  if (
    await access(output).then(
      () => true,
      () => false,
    )
  )
    throw new TransferError("OUTPUT_ALREADY_EXISTS");
  if (path.relative(source, output).split(path.sep)[0] !== "..")
    throw new TransferError("OUTPUT_INSIDE_DATABASE");
  for (const port of options.checkPorts || [3100, 3105]) {
    if (!Number.isInteger(port) || port < 1 || port > 65535)
      throw new TransferError("INVALID_PORT");
    if (await listening(port))
      throw new TransferError("API_PORT_STILL_LISTENING");
  }
  const db = new PGlite(source);
  let envelope: TransferEnvelope;
  let sessionsOmitted = 0;
  try {
    envelope = await db.transaction(async (tx) => {
      await tx.query(
        "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
      );
      await tx.query("SET LOCAL TIME ZONE 'UTC'");
      await tx.query("SET LOCAL datestyle = 'ISO, YMD'");
      await assertKnownTables(tx);
      if (
        (
          await tx.query(
            "SELECT 1 FROM runs WHERE status IN ('queued','running') LIMIT 1",
          )
        ).rows.length
      )
        throw new TransferError("ACTIVE_TASKS");
      sessionsOmitted = Number(
        (
          await tx.query<{ count: string }>(
            "SELECT count(*)::text AS count FROM sessions",
          )
        ).rows[0]!.count,
      );
      const payload = {
        format: "zhixu-offline-db-transfer" as const,
        version: 1 as const,
        exportedAt: new Date().toISOString(),
        sessionsExcluded: true as const,
        tables: await readTables(tx),
      };
      return { payload, sha256: checksum(payload) };
    });
  } finally {
    await db.close();
  }
  const content = JSON.stringify(envelope);
  const destination = await open(output, "wx", 0o600);
  try {
    await destination.writeFile(content, "utf8");
    await destination.sync();
  } finally {
    await destination.close();
  }
  await chmod(output, 0o600);
  return {
    ok: true,
    ...statistics(envelope.payload.tables),
    sessionsOmitted,
    bytes: Buffer.byteLength(content),
  };
}

function argumentsOf(args: string[]): ExportOptions {
  const options: ExportOptions = { source: "", output: "", offline: false };
  for (let index = 0; index < args.length; index++) {
    const key = args[index];
    if (key === "--offline") options.offline = true;
    else if (key === "--source") options.source = args[++index] || "";
    else if (key === "--output") options.output = args[++index] || "";
    else if (key === "--check-port")
      (options.checkPorts ||= []).push(Number(args[++index]));
    else throw new TransferError("INVALID_ARGUMENTS");
  }
  return options;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  Promise.resolve()
    .then(() => exportLocalDb(argumentsOf(process.argv.slice(2))))
    .then((result) => console.log(JSON.stringify(result)))
    .catch((error) => {
      console.error(
        JSON.stringify({
          ok: false,
          code: error instanceof TransferError ? error.code : "EXPORT_FAILED",
        }),
      );
      process.exitCode = 1;
    });
}
