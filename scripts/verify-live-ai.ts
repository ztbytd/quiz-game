import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { database } from "../server/db.ts";
import { createApp } from "../server/app.ts";
import { provider } from "../server/provider.ts";
process.loadEnvFile("server/.env.local");
const db = await database(undefined, ":memory:");
const origin = "http://127.0.0.1:5185",
  password = randomUUID();
const { app, processOne } = await createApp({
  db,
  origin,
  dailyTokens: 1_000_000,
  adminName: "live-test",
  adminPassword: password,
  worker: false,
  complete: provider({
    baseUrl: process.env.AI_BASE_URL!,
    model: process.env.AI_MODEL!,
    apiKey: process.env.AI_API_KEY!,
  }),
});
let cookie = "",
  csrf = "";
const request = async (method: any, path: string, body?: any) => {
  const r = await app.inject({
    method,
    url: "/quiz/api/v1" + path,
    headers: { origin, cookie, "x-csrf-token": csrf },
    payload: body,
  });
  if (r.statusCode >= 400) throw new Error(`${r.statusCode} ${r.json().error}`);
  return r.json();
};
const results: any[] = [];
async function completeRun(run: any, label: string) {
  const started = Date.now();
  await processOne();
  const result = await request("GET", "/runs/" + run.id);
  results.push({
    label,
    status: result.status,
    seconds: (Date.now() - started) / 1000,
    error: result.error,
    tokens: result.output.tokens,
    candidates: result.output.candidates?.map((c: any) => ({
      prompt: c.question.prompt,
      checks: c.checks,
    })),
    sample: result.output.text?.slice(0, 280),
  });
  console.log(JSON.stringify(results.at(-1)));
  return result;
}
try {
  const login = await request("POST", "/auth/login", {
    username: "live-test",
    password,
  });
  csrf = login.csrf;
  const loginResponse = await app.inject({
    method: "POST",
    url: "/quiz/api/v1/auth/login",
    headers: { origin },
    payload: { username: "live-test", password },
  });
  cookie = String(loginResponse.headers["set-cookie"]).split(";")[0]!;
  csrf = loginResponse.json().csrf;
  const chat = await request("POST", "/conversations", {});
  await completeRun(
    await request("POST", `/conversations/${chat.id}/messages`, {
      key: randomUUID(),
      text: "为什么 Promise.then 里的耗时计算仍会阻塞 loading 的渲染？用一个简短例子说明。",
    }),
    "chat",
  );
  const assessment = await request("POST", "/conversations", {
    questionId: "oral:loop:0",
    answer:
      "设置 loading 后同步解析 JSON 会占用主线程，浏览器要等这段 JavaScript 执行完才能渲染。应该把大计算放到 Worker，或者分批处理并让出主线程。",
  });
  await completeRun(
    await request("POST", `/conversations/${assessment.id}/messages`, {
      key: randomUUID(),
      action: "assess",
      text: "请点评我的回答，并给出适合面试的表达。",
    }),
    "assessment",
  );
  const generation = await completeRun(
    await request("POST", "/generations", {
      key: randomUUID(),
      scope:
        "围绕前端异步取消与过期结果覆盖生成场景题，分别考查搜索请求与组件卸载，不要用术语记忆题。",
      count: 2,
      kind: "oral",
      difficulty: "进阶",
    }),
    "generation",
  );
  assert.equal(
    generation.output.candidates?.length,
    2,
    JSON.stringify(generation.output.invalid),
  );
  assert.ok(
    generation.output.candidates.every((c: any) => !c.checks.length),
    "生成题存在质量问题",
  );
  const interview = await request("POST", "/conversations", {
    mode: "interview",
    scope: "Vue 3 与大文件上传，重点考查异常处理",
  });
  await completeRun(
    await request("POST", `/conversations/${interview.id}/messages`, {
      key: randomUUID(),
      text: "开始面试，先问一个项目场景问题。",
    }),
    "interview",
  );
  await completeRun(
    await request("POST", `/conversations/${interview.id}/messages`, {
      key: randomUUID(),
      action: "recap",
      answer:
        "路由卸载时通过 AbortController 中止页面请求，上传任务如果需要后台继续则由独立任务管理器持有，页面重新进入后查询服务端进度。",
      text: "结束并根据我这次实际作答复盘。",
    }),
    "recap",
  );
  assert.ok(
    results.every((r) =>
      ["succeeded", "partially_succeeded"].includes(r.status),
    ),
    "部分真实模型流程未通过",
  );
} finally {
  await app.close();
  await db.close();
}
