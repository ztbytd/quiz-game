const { spawn } = require("node:child_process");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const children = [];
function run(args, env) {
  const child = spawn(process.execPath, args, {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: "inherit",
    windowsHide: true,
  });
  children.push(child);
  return child;
}
run(["server/index.ts"], {
  PORT: "3105",
  APP_ORIGIN: "http://127.0.0.1:5185",
  NODE_USE_ENV_PROXY: "1",
});
run(
  [
    "node_modules/vite/bin/vite.js",
    "--host",
    "127.0.0.1",
    "--port",
    "5185",
    "--strictPort",
  ],
  { API_TARGET: "http://127.0.0.1:3105" },
);
console.log("本地预览：http://127.0.0.1:5185/quiz/#/ai");
for (const event of ["SIGINT", "SIGTERM"])
  process.on(event, () => {
    for (const child of children) child.kill();
    process.exit();
  });
