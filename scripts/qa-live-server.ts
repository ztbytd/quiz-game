// Isolated browser QA only. Never imported by the application entry point.
import { database } from "../server/db.ts";
import { createApp } from "../server/app.ts";
import { provider } from "../server/provider.ts";
process.loadEnvFile("server/.env.local");
const db = await database(undefined, ":memory:");
const { app } = await createApp({
  db,
  origin: process.env.AI_TEST_ORIGIN || "http://127.0.0.1:5190",
  adminName: "tester",
  adminPassword: "test-only-password",
  dailyTokens: 300000,
  complete: provider({
    baseUrl: process.env.AI_BASE_URL!,
    model: process.env.AI_MODEL!,
    apiKey: process.env.AI_API_KEY!,
  }),
});
await app.listen({
  host: "127.0.0.1",
  port: Number(process.env.AI_TEST_PORT || 3120),
});
for (const event of ["SIGINT", "SIGTERM"])
  process.on(
    event,
    () =>
      void app
        .close()
        .then(() => db.close())
        .then(() => process.exit()),
  );
