import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import type { ServerResponse } from "node:http";
import { database } from "./db.ts";
import { createApp } from "./app.ts";
import type { Complete } from "./provider.ts";
import { LiveSseWriter, RunStreamHub, TextCheckpoint } from "./run-stream.ts";

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const origin = "http://127.0.0.1:5173";
const original = await database(undefined, ":memory:");
let ownerRead:
  | {
      id: string;
      entered: ReturnType<typeof deferred>;
      release: ReturnType<typeof deferred>;
      used: boolean;
    }
  | undefined;
const db = {
  ...original,
  async query(sql: string, params?: any[]) {
    const result = await original.query(sql, params);
    if (
      ownerRead &&
      !ownerRead.used &&
      sql === "SELECT * FROM runs WHERE id=$1 AND owner=$2" &&
      params?.[0] === ownerRead.id
    ) {
      ownerRead.used = true;
      ownerRead.entered.resolve();
      await ownerRead.release.promise;
    }
    return result;
  },
};
let model: Complete = async () => ({ text: "完成", tokens: 10 });
const { app, processOne } = await createApp({
  db,
  origin,
  dailyTokens: 1_000_000,
  worker: false,
  adminName: "stream_test",
  adminPassword: "stream-test-password",
  complete: (...args) => model(...args),
});
let base: string, cookie: string, csrf: string;
async function request(method: string, endpoint: string, body?: any) {
  const response = await fetch(base + endpoint, {
    method,
    headers: {
      origin,
      cookie,
      "x-csrf-token": csrf,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  assert.equal(response.status, 200, await response.clone().text());
  return response.json();
}
async function queued() {
  const conversation = await request("POST", "/conversations", {
    mode: "chat",
  });
  return request("POST", `/conversations/${conversation.id}/messages`, {
    text: "解释一个事件循环场景",
    key: crypto.randomUUID(),
    action: "chat",
  });
}
async function events(run: any, live = true) {
  const abort = new AbortController();
  const response = await fetch(
    base + `/runs/${run.id}/events${live ? "?live=1" : ""}`,
    { headers: { cookie }, signal: abort.signal },
  );
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type")!, /text\/event-stream/);
  const reader = response
    .body!.pipeThrough(new TextDecoderStream())
    .getReader();
  let buffer = "";
  return {
    abort,
    async next() {
      while (true) {
        const end = buffer.indexOf("\n\n");
        if (end >= 0) {
          const frame = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          const event = /^event: (.*)$/m.exec(frame)?.[1];
          const data = /^data: (.*)$/m.exec(frame)?.[1];
          if (event && data) return { event, data: JSON.parse(data) };
        } else {
          const item = await reader.read();
          if (item.done) return undefined;
          buffer += item.value;
        }
      }
    },
    async until(predicate: (event: any) => boolean) {
      while (true) {
        const event = await this.next();
        assert.ok(event, "The stream must not end before its expected event");
        if (predicate(event)) return event;
      }
    },
  };
}
before(async () => {
  const address = await app.listen({ port: 0, host: "127.0.0.1" });
  base = address + "/quiz/api/v1";
  const response = await fetch(base + "/auth/login", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({
      username: "stream_test",
      password: "stream-test-password",
    }),
  });
  assert.equal(response.status, 200);
  cookie = response.headers.get("set-cookie")!.split(";")[0]!;
  csrf = (await response.json()).csrf;
});
after(async () => {
  await app.close();
  await original.close();
});

test(
  "live SSE sends native deltas before completion and reconnects to the current cursor",
  { timeout: 10000 },
  async (t) => {
    const release = deferred(),
      entered = deferred();
    model = async (_messages, options) => {
      await options.delta?.("甲");
      entered.resolve();
      await release.promise;
      await options.delta?.("甲乙🙂");
      return { text: "甲乙🙂完成", tokens: 12 };
    };
    const run = await queued();
    const stream = await events(run);
    t.after(() => stream.abort.abort());
    assert.equal((await stream.next())!.data.status, "queued");
    const work = processOne();
    t.after(async () => {
      release.resolve();
      await work;
    });
    await entered.promise;
    const delta = await stream.until((event) => event.event === "delta");
    assert.deepEqual(
      { text: delta.data.text, seq: delta.data.seq, offset: delta.data.offset },
      { text: "甲", seq: 1, offset: 0 },
    );
    assert.equal(delta.data.streamId, `${run.id}:1`);
    const reconnect = await events(run);
    t.after(() => reconnect.abort.abort());
    const snapshot = (await reconnect.next())!.data;
    assert.equal(snapshot.status, "running");
    assert.equal(snapshot.output.text, "甲");
    assert.deepEqual(snapshot.stream, { id: `${run.id}:1`, seq: 1, offset: 1 });
    release.resolve();
    const final = await stream.until(
      (event) => event.data.status === "succeeded",
    );
    assert.equal(final.data.output.text, "甲乙🙂完成");
    assert.equal(
      (
        await request("GET", `/conversations/${run.conversation_id}`)
      ).messages.at(-1).text,
      final.data.output.text,
    );
    await work;
  },
);

test(
  "a completed task between authorization read and subscription starts with its final snapshot",
  { timeout: 10000 },
  async (t) => {
    const release = deferred(),
      entered = deferred();
    model = async (_messages, options) => {
      await options.delta?.("已有片段");
      entered.resolve();
      await release.promise;
      return { text: "完整回答", tokens: 10 };
    };
    const run = await queued(),
      work = processOne();
    t.after(async () => {
      ownerRead?.release.resolve();
      release.resolve();
      await work;
      ownerRead = undefined;
    });
    await entered.promise;
    ownerRead = {
      id: run.id,
      entered: deferred(),
      release: deferred(),
      used: false,
    };
    const connection = events(run);
    await ownerRead.entered.promise;
    release.resolve();
    await work;
    ownerRead.release.resolve();
    const stream = await connection;
    t.after(() => stream.abort.abort());
    const initial = (await stream.next())!;
    assert.equal(initial.event, "snapshot");
    assert.equal(initial.data.status, "succeeded");
    assert.equal(initial.data.output.text, "完整回答");
  },
);

test(
  "cancellation persists the latest fragment and rejects a provider's late callbacks",
  { timeout: 10000 },
  async (t) => {
    const release = deferred(),
      entered = deferred();
    model = async (_messages, options) => {
      await options.delta?.("停止前");
      entered.resolve();
      await release.promise;
      await options.delta?.("停止前不该出现");
      return { text: "停止前不该出现", tokens: 10 };
    };
    const run = await queued(),
      stream = await events(run);
    t.after(() => stream.abort.abort());
    await stream.next();
    const work = processOne();
    t.after(async () => {
      release.resolve();
      await work;
    });
    await entered.promise;
    await stream.until((event) => event.event === "delta");
    const canceled = await request("POST", `/runs/${run.id}/cancel`);
    assert.equal(canceled.status, "canceled");
    assert.equal(canceled.output.text, "停止前");
    const final = await stream.until(
      (event) => event.data.status === "canceled",
    );
    assert.equal(final.data.fence, 2);
    assert.equal(final.data.stream.id, `${run.id}:2`);
    release.resolve();
    await work;
    assert.equal(
      (await request("GET", `/runs/${run.id}`)).output.text,
      "停止前",
    );
  },
);

test(
  "failed providers retain the last received text and legacy clients still receive snapshots",
  { timeout: 10000 },
  async (t) => {
    model = async (_messages, options) => {
      await options.delta?.("已收到的正文");
      throw new Error("网络断开");
    };
    const run = await queued(),
      legacy = await events(run, false);
    t.after(() => legacy.abort.abort());
    assert.equal((await legacy.next())!.event, "snapshot");
    await processOne();
    const final = await legacy.until(
      (event) => event.data.status === "outcome_unknown",
    );
    assert.equal(final.event, "snapshot");
    assert.equal(final.data.output.text, "已收到的正文");
  },
);

test("SSE ownership checks run before opening a live connection", async () => {
  const run = await queued();
  const response = await fetch(base + `/runs/${run.id}/events?live=1`);
  assert.equal(response.status, 401);
  await request("POST", `/runs/${run.id}/cancel`);
});

test(
  "queued cancellation is broadcast immediately without waiting for the recovery poll",
  { timeout: 10000 },
  async (t) => {
    const run = await queued(),
      stream = await events(run);
    t.after(() => stream.abort.abort());
    await stream.next();
    const before = Date.now();
    await request("POST", `/runs/${run.id}/cancel`);
    const final = await stream.next();
    assert.equal(final!.data.status, "canceled");
    assert.ok(
      Date.now() - before < 400,
      "Queued cancellation must not wait for the 600ms legacy poll",
    );
  },
);

test("hub coalesces live bursts, snapshots catch up, and invalid fences cannot publish", async () => {
  const hub = new RunStreamHub(35),
    received: any[] = [];
  const run = { id: "r", fence: 1, status: "running", output: {} };
  const unsubscribe = hub.subscribe("r", (value) => received.push(value));
  hub.begin(run);
  hub.text("r", 1, "a");
  for (let i = 2; i <= 50; i++) hub.text("r", 1, "a".repeat(i));
  assert.equal(received.filter((event) => event.event === "delta").length, 1);
  const snapshot = hub.snapshot(run);
  assert.equal(snapshot.output.text.length, 50);
  assert.equal(snapshot.stream.seq, 2);
  hub.text("r", 0, "旧进程");
  hub.pause("r", 1);
  hub.text("r", 1, "迟到");
  assert.equal(hub.currentText("r", 1)!.length, 50);
  hub.finish({ ...run, status: "succeeded", output: { text: "a".repeat(50) } });
  await pause(50);
  assert.equal(received.at(-1).terminal, true);
  unsubscribe();
  hub.close();
});

test("slow clients coalesce to one latest snapshot and cannot stall the producer", () => {
  class Response extends EventEmitter {
    frames: string[] = [];
    destroyed = false;
    writableEnded = false;
    write(frame: string) {
      this.frames.push(frame);
      return this.frames.length > 1;
    }
    end() {
      this.writableEnded = true;
      this.emit("close");
    }
    destroy() {
      this.destroyed = true;
      this.emit("close");
    }
  }
  const response = new Response(),
    writer = new LiveSseWriter(response as unknown as ServerResponse);
  for (let i = 1; i <= 100; i++) {
    const snapshot = {
      id: "r",
      status: "running",
      output: { text: "a".repeat(i) },
      stream: { id: "r:1", seq: i, offset: i },
    };
    writer.send({
      event: "delta",
      data: { text: "a" },
      snapshot,
      terminal: false,
    });
  }
  assert.equal(response.frames.length, 1);
  response.emit("drain");
  assert.equal(response.frames.length, 2);
  assert.match(response.frames[1]!, /event: snapshot/);
  assert.match(response.frames[1]!, /"offset":100/);
  response.end();
});

test("checkpoint writes coalesce behind a slow database without delaying live updates", async () => {
  const gate = deferred(),
    saved: string[] = [];
  const checkpoint = new TextCheckpoint(
    async (value) => {
      saved.push(value);
      if (saved.length === 1) await gate.promise;
    },
    (error) => {
      throw error;
    },
  );
  checkpoint.set("a");
  for (let i = 2; i <= 100; i++) checkpoint.set("a".repeat(i));
  assert.equal(saved.length, 1);
  gate.resolve();
  await checkpoint.flush();
  assert.deepEqual(
    saved.map((value) => value.length),
    [1, 100],
  );
  await checkpoint.stop();
});

test(
  "preClose ends active SSE connections so a service restart can finish",
  { timeout: 10000 },
  async () => {
    const run = await queued(),
      stream = await events(run);
    await stream.next();
    const close = app.close();
    assert.equal(await stream.next(), undefined);
    await close;
  },
);
