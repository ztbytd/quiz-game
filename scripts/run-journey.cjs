const { spawn } = require("node:child_process");
const net = require("node:net");
const path = require("node:path");
const root = path.resolve(__dirname, ".."),
  children = [];
const live = process.env.QA_LIVE_AI === "1" || process.argv.includes("--live");
function launch(args, env = {}) {
  const child = spawn(process.execPath, args, {
    cwd: root,
    env: { ...process.env, ...env },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.push(child);
  child.stdout.on("data", () => {});
  child.stderr.on("data", (d) => process.stderr.write(d));
  return child;
}
async function free(port) {
  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => server.close(resolve));
  });
}
async function ready(url, child) {
  for (let attempt = 0; attempt < 70; attempt++) {
    if (child.exitCode !== null)
      throw new Error("QA process exited before readiness");
    try {
      if ((await fetch(url)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("QA server did not become ready");
}
(async () => {
  try {
    await free(3120);
    await free(5190);
    const origin = "http://127.0.0.1:5190";
    const api = launch(
      [
        "--import",
        "tsx",
        live ? "scripts/qa-live-server.ts" : "scripts/ai-fixture-server.ts",
      ],
      { AI_TEST_ORIGIN: origin, AI_TEST_PORT: "3120", NODE_USE_ENV_PROXY: "1" },
    );
    await ready("http://127.0.0.1:3120/quiz/api/v1/health", api);
    const ui = launch(
      [
        "node_modules/vite/bin/vite.js",
        "--host",
        "127.0.0.1",
        "--port",
        "5190",
        "--strictPort",
      ],
      { API_TARGET: "http://127.0.0.1:3120" },
    );
    await ready(origin + "/quiz/", ui);
    const verify = launch(["scripts/verify-journey.cjs"], {
      QA_BASE: origin + "/quiz/",
      QA_LIVE_AI: live ? "1" : "0",
    });
    verify.stdout.on("data", (d) => process.stdout.write(d));
    const code = await new Promise((resolve) => verify.on("exit", resolve));
    if (code) process.exitCode = code;
    const regressions = launch(["scripts/verify-ui-regressions.cjs"], {
      BASE_URL: origin + "/quiz/",
    });
    regressions.stdout.on("data", (d) => process.stdout.write(d));
    if (await new Promise((resolve) => regressions.on("exit", resolve)))
      process.exitCode = 1;
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  } finally {
    for (const child of children) child.kill();
  }
})();
