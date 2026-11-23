const { spawn } = require("node:child_process");
const path = require("node:path");
const root = path.resolve(__dirname, ".."),
  children = [];
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
(async () => {
  try {
    const origin = "http://127.0.0.1:5180";
    launch(["--import", "tsx", "scripts/ai-fixture-server.ts"], {
      AI_TEST_ORIGIN: origin,
      AI_TEST_PORT: "3110",
    });
    launch(
      [
        "node_modules/vite/bin/vite.js",
        "--host",
        "127.0.0.1",
        "--port",
        "5180",
        "--strictPort",
      ],
      { API_TARGET: "http://127.0.0.1:3110" },
    );
    for (let i = 0; i < 60; i++) {
      try {
        const res = await fetch(origin + "/quiz/api/v1/health");
        if (res.ok) break;
      } catch {}
      if (i === 59) throw new Error("预览未能启动");
      await new Promise((r) => setTimeout(r, 500));
    }
    const verify = launch(["scripts/verify-ai.cjs"], { AI_TEST_BASE: origin });
    verify.stdout.on("data", (d) => process.stdout.write(d));
    const code = await new Promise((r) => verify.on("exit", r));
    if (code) process.exitCode = code;
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  } finally {
    for (const child of children) child.kill();
  }
})();
