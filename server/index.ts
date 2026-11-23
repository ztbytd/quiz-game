import { database } from "./db.ts";
import { createApp } from "./app.ts";
import { provider } from "./provider.ts";
import { existsSync } from "node:fs";
if (existsSync("server/.env.local")) process.loadEnvFile("server/.env.local");
const prod = process.env.NODE_ENV === "production";
if (prod && !process.env.APP_ORIGIN?.startsWith("https://"))
  throw new Error("生产环境需要 HTTPS APP_ORIGIN");
const db = await database(
  process.env.DATABASE_URL,
  process.env.LOCAL_DATABASE_PATH || "server/data",
);
const { app } = await createApp({
  db,
  origin: process.env.APP_ORIGIN || "http://127.0.0.1:5173",
  dailyTokens: Number(process.env.AI_DAILY_TOKENS || 0),
  adminName: process.env.ADMIN_USERNAME,
  adminPassword: process.env.ADMIN_PASSWORD,
  secure: prod,
  worker: process.env.SERVICE_ROLE !== "api",
  complete: process.env.AI_API_KEY
    ? provider({
        baseUrl: process.env.AI_BASE_URL || "https://us.xigong.cloud/v1",
        model: process.env.AI_MODEL || "gpt-6.1-sol",
        apiKey: process.env.AI_API_KEY,
      })
    : undefined,
});
if (process.env.SERVICE_ROLE !== "worker")
  await app.listen({
    host: process.env.HOST || "127.0.0.1",
    port: Number(process.env.PORT || 3100),
  });
console.log(
  process.env.SERVICE_ROLE === "worker"
    ? "知序 Worker 已启动"
    : `知序 API 已启动：${process.env.HOST || "127.0.0.1"}:${process.env.PORT || 3100}`,
);
for (const event of ["SIGINT", "SIGTERM"])
  process.on(event, () => {
    void app
      .close()
      .then(() => db.close())
      .then(() => process.exit(0));
  });
