import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { database } from "./db.ts";
import { createApp } from "./app.ts";
import type { Complete } from "./provider.ts";
const origin = "http://127.0.0.1:5173";
const q = {
  kind: "oral",
  prompt: "在分片上传中怎样确保合并请求可以安全重复执行？",
  explanation:
    "我会使用用户、文件标识和上传批次建立唯一任务，记录服务端合并状态，通过原子状态变化取得执行权。重复请求返回已有状态，失败任务可以恢复。合并先写临时结果，完成完整性校验后再切换为正式文件，同时校验执行令牌，防止旧任务覆盖新结果。",
  knowledgePoints: ["上传幂等"],
  angle: "场景",
  rubric: {
    required: ["唯一标识", "原子状态变化"],
    alternatives: ["数据库唯一键"],
    mistakes: ["只依赖前端禁止点击"],
  },
};
let calls = 0;
const complete: Complete = async (messages, options) => {
  calls++;
  if (messages[0]?.content.includes("INTERVIEW_STEP"))
    return {
      text: JSON.stringify({
        question:
          "上传任务执行期间用户切换路由，你怎样保证任务状态与页面状态一致？",
        action: "next",
      }),
      tokens: 150,
    };
  if (messages[0]?.content.includes("INTERVIEW_REPORT"))
    return {
      text: JSON.stringify({
        summary:
          "本次只完成了面试开场，没有提交技术作答，仍需要通过实际回答验证。",
        strengths: [],
        gaps: [],
        answers: [],
        nextSteps: ["独立完成一道项目场景题。"],
      }),
      tokens: 150,
    };
  if (messages.at(-1)?.content === "simulate-upstream-503")
    throw Object.assign(new Error("模型服务返回 503"), {
      upstreamRejected: true,
    });
  if (messages[0]?.content.includes("QUALITY_REVIEW"))
    return {
      text: JSON.stringify({ reviews: [{ index: 0, issues: [] }] }),
      tokens: 100,
    };
  const gen = messages[0]?.content.includes("questions");
  if (gen) return { text: JSON.stringify({ questions: [q] }), tokens: 1200 };
  if (options.structured)
    return {
      text: JSON.stringify({
        covered: [{ quote: "数据库唯一键", comment: "说明了幂等标识" }],
        improvements: [],
        dimensions: [{ name: "机制", level: "部分", reason: "需说明失败恢复" }],
        answer:
          "我会用数据库唯一键约束合并任务，并记录任务状态，通过原子更新取得执行权，重复请求返回相同任务结果。",
        followup: "任务失败后如何恢复合并？",
      }),
      tokens: 500,
    };
  await options.delta?.("先确定任务的唯一标识。");
  return {
    text: "先确定任务的唯一标识，然后通过服务端状态变化取得执行权。",
    tokens: 300,
  };
};
const db = await database(undefined, ":memory:");
const { app, processOne } = await createApp({
  db,
  complete,
  origin,
  dailyTokens: 1_000_000,
  adminName: "admin",
  adminPassword: "test-password-123",
  worker: false,
});
let cookie = "",
  csrf = "";
const request = (
  method: any,
  url: string,
  body?: any,
  extra: Record<string, string> = {},
) =>
  app.inject({
    method,
    url: "/quiz/api/v1" + url,
    headers: { origin, cookie, "x-csrf-token": csrf, ...extra },
    payload: body,
  });
before(async () => {
  const login = await request("POST", "/auth/login", {
    username: "admin",
    password: "test-password-123",
  });
  assert.equal(login.statusCode, 200);
  cookie = String(login.headers["set-cookie"]).split(";")[0]!;
  csrf = login.json().csrf;
});
after(async () => {
  await app.close();
  await db.close();
});
test("public content works without identity; writes reject foreign origins", async () => {
  const content = await app.inject({
    method: "GET",
    url: "/quiz/api/v1/content/manifest",
  });
  assert.equal(content.json().bank.questions.length, 1011);
  const denied = await request(
    "POST",
    "/conversations",
    {},
    { origin: "https://evil.invalid" },
  );
  assert.equal(denied.statusCode, 403);
});
test("chat persists, completes once, and idempotent retry does not add a second message", async () => {
  const c = (await request("POST", "/conversations", {})).json();
  const body = { text: "解释上传幂等", key: "same-key-123456" };
  const run = (
    await request("POST", `/conversations/${c.id}/messages`, body)
  ).json();
  assert.equal(run.status, "queued");
  await processOne();
  const completed = (await request("GET", `/runs/${run.id}`)).json();
  assert.equal(completed.status, "succeeded");
  const retry = await request("POST", `/conversations/${c.id}/messages`, body);
  assert.equal(retry.statusCode, 200);
  assert.equal(retry.json().id, run.id);
  const view = (await request("GET", `/conversations/${c.id}`)).json();
  assert.equal(view.messages.length, 2);
  assert.ok(view.messages[1].text.includes("唯一标识"));
  const conflict = await request("POST", `/conversations/${c.id}/messages`, {
    ...body,
    text: "不同的问题",
  });
  assert.equal(conflict.statusCode, 409);
});
test("generation requires checks, personal save, explicit review, then atomic public release", async () => {
  const run = (
    await request("POST", "/generations", {
      scope: "上传幂等",
      count: 1,
      key: "generation-123",
    })
  ).json();
  await processOne();
  const result = (await request("GET", `/runs/${run.id}`)).json();
  assert.equal(result.status, "succeeded");
  const candidate = result.output.candidates[0];
  assert.equal(candidate.review, "unreviewed");
  const premature = await request("POST", "/admin/releases", {
    ids: [candidate.id],
    topicId: (await request("GET", "/content/manifest")).json().bank.topics[0]
      .id,
  });
  assert.equal(premature.statusCode, 409);
  assert.equal(
    (await request("POST", `/candidates/${candidate.id}/save`)).statusCode,
    200,
  );
  const content = (await request("GET", "/content/manifest")).json();
  const topicId = content.bank.topics[0].id;
  assert.equal(
    content.bank.questions.some((x: any) => x.id === candidate.id),
    false,
  );
  const approved = await request(
    "POST",
    `/admin/candidates/${candidate.id}/review`,
    { version: 1, approved: true, reason: "核对机制和答案" },
  );
  assert.equal(approved.statusCode, 200);
  const published = await request("POST", "/admin/releases", {
    ids: [candidate.id],
    topicId,
  });
  assert.equal(published.statusCode, 200);
  assert.equal(
    (await request("GET", "/content/manifest")).json().bank.questions.length,
    1012,
  );
});
test("cancel before execution releases reservations without calling provider", async () => {
  const before = calls;
  const c = (await request("POST", "/conversations", {})).json();
  const run = (
    await request("POST", `/conversations/${c.id}/messages`, {
      text: "不要开始",
      key: "cancel-key-123",
    })
  ).json();
  assert.equal(
    (await request("POST", `/runs/${run.id}/cancel`)).json().status,
    "canceled",
  );
  await processOne();
  assert.equal(calls, before);
});
test("assessment cites actual words and rejects fabricated evidence", async () => {
  for (const [answer, expected] of [
    ["我使用数据库唯一键来确保幂等。", "succeeded"],
    ["我还没有决定方案。", "failed"],
  ]) {
    const c = (await request("POST", "/conversations", { answer })).json();
    const run = (
      await request("POST", `/conversations/${c.id}/messages`, {
        text: "请点评我的回答",
        action: "assess",
        key: "assessment-" + c.id,
      })
    ).json();
    await processOne();
    const result = (await request("GET", `/runs/${run.id}`)).json();
    assert.equal(result.status, expected);
    if (expected === "succeeded")
      assert.equal(result.output.assessment.covered[0].quote, "数据库唯一键");
    else assert.match(result.error, /引用/);
  }
});
test("known upstream rejection releases reservation instead of charging unknown usage", async () => {
  const before = (await request("GET", "/usage")).json();
  const c = (await request("POST", "/conversations", {})).json();
  const run = (
    await request("POST", `/conversations/${c.id}/messages`, {
      text: "simulate-upstream-503",
      key: "upstream-503-123",
    })
  ).json();
  await processOne();
  assert.equal(
    (await request("GET", `/runs/${run.id}`)).json().status,
    "failed",
  );
  const after = (await request("GET", "/usage")).json();
  assert.equal(after.consumed, before.consumed);
  assert.equal(after.reserved, before.reserved);
});
test("interview closes after recap and prevents accidental continuation", async () => {
  const c = (
    await request("POST", "/conversations", { mode: "interview" })
  ).json();
  const start = (
    await request("POST", `/conversations/${c.id}/messages`, {
      text: "开始模拟",
      key: "interview-start-123",
    })
  ).json();
  assert.equal(start.kind, "interview");
  await processOne();
  const end = (
    await request("POST", `/conversations/${c.id}/messages`, {
      text: "结束并复盘",
      action: "recap",
      key: "interview-end-123",
    })
  ).json();
  await processOne();
  assert.equal(
    (await request("GET", `/runs/${end.id}`)).json().status,
    "succeeded",
  );
  assert.equal(
    (
      await request("POST", `/conversations/${c.id}/messages`, {
        text: "继续",
        key: "interview-again-123",
      })
    ).statusCode,
    409,
  );
});
test("saved notes persist independently of deleting the conversation", async () => {
  const c = (await request("POST", "/conversations", {})).json();
  await request("POST", `/conversations/${c.id}/messages`, {
    text: "解释幂等",
    key: "notes-start-123",
  });
  await processOne();
  const view = (await request("GET", `/conversations/${c.id}`)).json();
  const note = (
    await request("POST", "/notes", { messageId: view.messages[1].id })
  ).json();
  assert.ok(note.content);
  const edited = await request("PUT", `/notes/${note.id}`, {
    version: note.version,
    title: "修改后的笔记",
    content: "保留我的修改。",
  });
  assert.equal(edited.statusCode, 200);
  assert.equal(
    (
      await request("PUT", `/notes/${note.id}`, {
        version: note.version,
        title: "冲突笔记",
        content: "不覆盖新版本。",
      })
    ).statusCode,
    409,
  );
  assert.equal(
    (await request("DELETE", `/conversations/${c.id}`)).statusCode,
    200,
  );
  assert.ok(
    (await request("GET", "/notes"))
      .json()
      .items.some((n: any) => n.id === note.id),
  );
});
test("failed content review can be rerun without regenerating or duplicating a question", async () => {
  const candidate = "review-recovery-123";
  await db.query(
    "INSERT INTO candidates(id,owner,question,checks) VALUES($1,$2,$3,$4)",
    [
      candidate,
      (await request("GET", "/me")).json().user.id,
      JSON.stringify(q),
      JSON.stringify(["内容复核未完成"]),
    ],
  );
  assert.equal(
    (await request("POST", `/candidates/${candidate}/save`)).statusCode,
    400,
  );
  const task = (
    await request("POST", `/candidates/${candidate}/check`, {
      key: "retry-review-123",
      version: 1,
    })
  ).json();
  await processOne();
  assert.equal(
    (await request("GET", `/runs/${task.id}`)).json().status,
    "succeeded",
  );
  assert.equal(
    (await request("POST", `/candidates/${candidate}/save`)).statusCode,
    200,
  );
});
test("publication rollback preserves history and creates a new release", async () => {
  const versions = (await request("GET", "/admin/releases")).json().items;
  const restored = (await request("POST", "/admin/releases/1/restore")).json();
  assert.ok(Number(restored.release) > Number(versions[0].id));
  assert.equal(
    (await request("GET", "/content/manifest")).json().bank.questions.length,
    1011,
  );
});
test("CSRF and owner authorization protect private histories", async () => {
  const c = (await request("POST", "/conversations", {})).json();
  assert.equal(
    (await request("POST", "/conversations", {}, { "x-csrf-token": "wrong" }))
      .statusCode,
    403,
  );
  const invite = (await request("POST", "/admin/invitations")).json();
  const registered = await request("POST", "/auth/register", {
    username: "other",
    password: "long-test-password",
    invitation: invite.invitation,
  });
  assert.equal(registered.statusCode, 200);
  const otherCookie = String(registered.headers["set-cookie"]).split(";")[0]!;
  const denied = await request("GET", `/conversations/${c.id}`, undefined, {
    cookie: otherCookie,
  });
  assert.equal(denied.statusCode, 404);
  assert.equal(
    (
      await request("GET", "/admin/candidates", undefined, {
        cookie: otherCookie,
      })
    ).statusCode,
    403,
  );
});
test("changing password rotates the current session and revokes older sessions", async () => {
  const invite = (await request("POST", "/admin/invitations")).json();
  const created = await request("POST", "/auth/register", {
    username: "password-test",
    password: "initial-test-password",
    invitation: invite.invitation,
  });
  const oldCookie = String(created.headers["set-cookie"]).split(";")[0]!;
  const change = await request(
    "POST",
    "/auth/password",
    {
      currentPassword: "initial-test-password",
      newPassword: "updated-test-password",
    },
    { cookie: oldCookie, "x-csrf-token": created.json().csrf },
  );
  assert.equal(change.statusCode, 200);
  assert.equal(
    (await request("GET", "/me", undefined, { cookie: oldCookie })).statusCode,
    401,
  );
  assert.equal(
    (
      await request("POST", "/auth/login", {
        username: "password-test",
        password: "initial-test-password",
      })
    ).statusCode,
    401,
  );
  assert.equal(
    (
      await request("POST", "/auth/login", {
        username: "password-test",
        password: "updated-test-password",
      })
    ).statusCode,
    200,
  );
});
