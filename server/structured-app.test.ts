import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { database } from "./db.ts";
import { createApp } from "./app.ts";
import type { Complete } from "./provider.ts";

const origin = "http://localhost";
const question = (index = 0) => ({
  kind: "oral",
  prompt:
    [
      "上传合并阶段发生重复请求，服务端如何建立幂等的任务状态？",
      "实时搜索结果发生响应乱序时，前端如何防止过期数据覆盖界面？",
    ][index] || "浏览器重新进入页面后，怎样查询远端任务的实际状态？",
  explanation:
    "我会先定义任务标识和状态边界，通过原子状态变化取得执行权，并保存可查询的结果。重复请求返回同一任务状态，异常恢复时校验任务版本，防止过期执行者覆盖已确认的结果。",
  knowledgePoints: ["幂等", "并发状态"],
  angle: "场景",
  rubric: {
    required: ["稳定标识", "状态校验"],
    alternatives: ["版本条件更新"],
    mistakes: ["只靠按钮禁用"],
  },
});
const generated = (count: number) =>
  JSON.stringify({
    questions: Array.from({ length: count }, (_, index) => question(index)),
  });
const malformed = (count: number) =>
  generated(count).replace(',"knowledgePoints"', ' "knowledgePoints"');
async function fixture(complete: Complete) {
  const db = await database(undefined, ":memory:");
  const { app, processOne } = await createApp({
    db,
    origin,
    dailyTokens: 1_000_000,
    adminName: "format-test",
    adminPassword: "format-test-password",
    worker: false,
    complete,
  });
  const login = await app.inject({
    method: "POST",
    url: "/quiz/api/v1/auth/login",
    headers: { origin },
    payload: { username: "format-test", password: "format-test-password" },
  });
  const headers = {
    origin,
    cookie: String(login.headers["set-cookie"]).split(";")[0]!,
    "x-csrf-token": login.json().csrf,
  };
  return {
    db,
    app,
    processOne,
    async request(method: any, path: string, payload?: any) {
      const response = await app.inject({
        method,
        url: "/quiz/api/v1" + path,
        headers,
        payload,
      });
      assert.equal(response.statusCode, 200, response.body);
      return response.json();
    },
    async close() {
      await app.close();
      await db.close();
    },
  };
}

test("format repair is metered as a separate call and generated questions still pass content review", async () => {
  const calls: string[] = [];
  const f = await fixture(async (messages, options) => {
    if (messages[0]!.content.includes("JSON_FORMAT_REPAIR")) {
      calls.push("repair");
      assert.equal(options.structured, true);
      assert.equal(
        JSON.parse(messages.at(-1)!.content).malformed,
        malformed(1),
      );
      return { text: generated(1), tokens: 200 };
    }
    if (messages[0]!.content.includes("QUALITY_REVIEW")) {
      calls.push("review");
      return { text: '{"reviews":[{"index":0,"issues":[]}]}', tokens: 50 };
    }
    calls.push("generate");
    return { text: malformed(1), tokens: 100 };
  });
  try {
    const run = await f.request("POST", "/generations", {
      key: randomUUID(),
      scope: "上传任务幂等场景",
      count: 1,
    });
    await f.processOne();
    const result = await f.request("GET", "/runs/" + run.id);
    assert.equal(result.status, "succeeded");
    assert.equal(result.output.candidates.length, 1);
    assert.deepEqual(result.output.candidates[0].checks, []);
    assert.equal(result.output.tokens, 350);
    assert.deepEqual(calls, ["generate", "repair", "review"]);
  } finally {
    await f.close();
  }
});

test("a multi-batch generation task does not receive a second repair budget", async () => {
  let generationCalls = 0,
    repairCalls = 0;
  const f = await fixture(async (messages) => {
    if (messages[0]!.content.includes("JSON_FORMAT_REPAIR")) {
      repairCalls++;
      return { text: generated(2), tokens: 200 };
    }
    if (messages[0]!.content.includes("QUALITY_REVIEW"))
      return {
        text: '{"reviews":[{"index":0,"issues":[]},{"index":1,"issues":[]}]}',
        tokens: 50,
      };
    generationCalls++;
    return {
      text: malformed(JSON.parse(messages.at(-1)!.content).count),
      tokens: 100,
    };
  });
  try {
    const run = await f.request("POST", "/generations", {
      key: randomUUID(),
      scope: "上传与请求竞态场景",
      count: 3,
    });
    await f.processOne();
    const result = await f.request("GET", "/runs/" + run.id);
    assert.equal(result.status, "failed");
    assert.match(result.error, /格式不正确.*修复未成功/);
    assert.equal(result.output.candidates.length, 2);
    assert.equal(generationCalls, 2);
    assert.equal(repairCalls, 1);
  } finally {
    await f.close();
  }
});

test("a repaired JSON object cannot bypass question schema checks", async () => {
  const f = await fixture(async (messages) => {
    if (messages[0]!.content.includes("JSON_FORMAT_REPAIR"))
      return {
        text: JSON.stringify({
          questions: [{ ...question(), explanation: "过短" }],
        }),
        tokens: 200,
      };
    if (messages[0]!.content.includes("QUALITY_REVIEW"))
      return { text: '{"reviews":[{"index":0,"issues":[]}]}', tokens: 50 };
    return { text: malformed(1), tokens: 100 };
  });
  try {
    const run = await f.request("POST", "/generations", {
      key: randomUUID(),
      scope: "格式与质量分开验证",
      count: 1,
    });
    await f.processOne();
    const result = await f.request("GET", "/runs/" + run.id);
    assert.equal(result.status, "failed");
    assert.equal(
      Number(
        (await f.db.query("SELECT count(*) AS n FROM candidates")).rows[0].n,
      ),
      0,
    );
    assert.equal(result.output.invalid.length, 1);
  } finally {
    await f.close();
  }
});

test("a failed repair returns a Chinese task error and retains the completed call charges", async () => {
  let calls = 0;
  const f = await fixture(async (messages) => {
    calls++;
    if (messages[0]!.content.includes("JSON_FORMAT_REPAIR"))
      return { text: '{"private-repair":', tokens: 200 };
    return { text: '{"private-original":', tokens: 100 };
  });
  try {
    const run = await f.request("POST", "/generations", {
      key: randomUUID(),
      scope: "二次格式失败清晰提示",
      count: 1,
    });
    await f.processOne();
    const result = await f.request("GET", "/runs/" + run.id);
    assert.equal(result.status, "failed");
    assert.match(result.error, /格式不正确.*修复未成功/);
    assert.doesNotMatch(result.error, /private|position|Expected/);
    assert.equal(calls, 2);
    assert.equal((await f.request("GET", "/usage")).consumed, 300);
  } finally {
    await f.close();
  }
});

test("original transport failures never start a format repair", async () => {
  let calls = 0;
  let failure: Error = Object.assign(new Error("模型服务返回 503"), {
    upstreamRejected: true,
  });
  const f = await fixture(async () => {
    calls++;
    throw failure;
  });
  try {
    const run = await f.request("POST", "/generations", {
      key: randomUUID(),
      scope: "网络错误不重试",
      count: 1,
    });
    await f.processOne();
    const result = await f.request("GET", "/runs/" + run.id);
    assert.equal(result.status, "failed");
    assert.equal(calls, 1);
    assert.match(result.error, /503/);
    failure = new DOMException("模型连接超时", "TimeoutError");
    const timeout = await f.request("POST", "/generations", {
      key: randomUUID(),
      scope: "超时不重发原任务",
      count: 1,
    });
    await f.processOne();
    const timedOut = await f.request("GET", "/runs/" + timeout.id);
    assert.equal(timedOut.status, "outcome_unknown");
    assert.equal(calls, 2);
    assert.equal(timedOut.error, failure.message);
  } finally {
    await f.close();
  }
});

test("an obsolete execution fence prevents a repair request", async () => {
  let calls = 0;
  let f: Awaited<ReturnType<typeof fixture>>;
  f = await fixture(async () => {
    calls++;
    await f.db.query(
      "UPDATE runs SET status='canceled',fence=fence+1 WHERE status='running'",
    );
    return { text: malformed(1), tokens: 100 };
  });
  try {
    const run = await f.request("POST", "/generations", {
      key: randomUUID(),
      scope: "过期任务不得修复",
      count: 1,
    });
    await f.processOne();
    const result = await f.request("GET", "/runs/" + run.id);
    assert.equal(result.status, "canceled");
    assert.equal(calls, 1);
    assert.equal(
      Number(
        (await f.db.query("SELECT count(*) AS n FROM candidates")).rows[0].n,
      ),
      0,
    );
  } finally {
    await f.close();
  }
});
