import { spawn } from "node:child_process";
const base = "http://127.0.0.1:4176/quiz/";
const server = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "preview",
    "--host",
    "127.0.0.1",
    "--port",
    "4176",
    "--strictPort",
  ],
  { stdio: "inherit" },
);
let serverExited = false;
server.on("exit", () => {
  serverExited = true;
});
try {
  let ready = false;
  for (let attempt = 0; attempt < 50; attempt++) {
    if (serverExited)
      throw new Error("Preview could not start; ensure port 4176 is free.");
    try {
      const response = await fetch(base);
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  if (!ready) throw new Error("Preview did not become ready.");
  for (const file of [
    "scripts/verify-record-reset.cjs",
    "scripts/verify-browser.cjs",
    "scripts/verify-practice.cjs",
    "scripts/verify-quality.cjs",
    "scripts/verify-update.cjs",
  ]) {
    await new Promise((resolve, reject) => {
      const test = spawn(process.execPath, [file], {
        stdio: "inherit",
        env: { ...process.env, BASE_URL: base },
      });
      test.on("error", reject);
      test.on("exit", (code) =>
        code === 0 ? resolve() : reject(new Error(`${file} exited ${code}`)),
      );
    });
  }
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  server.kill();
}
