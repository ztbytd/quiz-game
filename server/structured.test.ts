import { test } from "node:test";
import assert from "node:assert/strict";
import { createStructuredReader, StructuredOutputError } from "./structured.ts";

test("valid JSON is parsed without a model call", async () => {
  let calls = 0;
  const read = createStructuredReader(async () => {
    calls++;
    return "{}";
  }, new AbortController().signal);
  assert.deepEqual(await read(' {"answer":"正常回答"} ', 100), {
    answer: "正常回答",
  });
  assert.equal(calls, 0);
});

test("one complete Markdown JSON fence is removed without changing its data", async () => {
  const read = createStructuredReader(async () => {
    throw new Error("repair must not run");
  }, new AbortController().signal);
  assert.deepEqual(
    await read('```json\r\n{"text":"代码内的 ``` 标记"}\r\n```', 100),
    { text: "代码内的 ``` 标记" },
  );
});

test("prose, multiple fences and non-JSON fences are not silently extracted", async () => {
  for (const text of [
    "解释：\n```json\n{}\n```",
    "```json\n{}\n```\n```json\n{}\n```",
    "```js\n{}\n```",
  ]) {
    let calls = 0;
    const read = createStructuredReader(async (input) => {
      calls++;
      assert.equal(input, text);
      return '{"repaired":true}';
    }, new AbortController().signal);
    assert.deepEqual(await read(text, 100), { repaired: true });
    assert.equal(calls, 1);
  }
});

test("a task has one shared repair budget and a bounded output budget", async () => {
  let calls = 0;
  const read = createStructuredReader(async (input, maxTokens) => {
    calls++;
    assert.equal(input, '{"a":1 "b":2}');
    assert.equal(maxTokens, 6000);
    return '{"a":1,"b":2}';
  }, new AbortController().signal);
  assert.deepEqual(await read('{"a":1 "b":2}', 18000), { a: 1, b: 2 });
  assert.deepEqual(await read('{"still":"valid"}', 100), { still: "valid" });
  await assert.rejects(read('{"second":', 100), StructuredOutputError);
  assert.equal(calls, 1);
});

test("a second syntax failure gives a Chinese error without echoing content", async () => {
  let calls = 0;
  const read = createStructuredReader(async () => {
    calls++;
    return '{"private-repair":';
  }, new AbortController().signal);
  await assert.rejects(read('{"private-original":', 100), (error: any) => {
    assert.ok(error instanceof StructuredOutputError);
    assert.match(error.message, /格式不正确.*修复未成功/);
    assert.doesNotMatch(error.message, /private|JSON\.parse|position|Expected/);
    return true;
  });
  assert.equal(calls, 1);
});

test("repair network failures propagate unchanged and are never retried", async () => {
  for (const error of [
    Object.assign(new Error("503"), { upstreamRejected: true }),
    new TypeError("network failure"),
  ]) {
    let calls = 0;
    const read = createStructuredReader(async () => {
      calls++;
      throw error;
    }, new AbortController().signal);
    await assert.rejects(read('{"bad":', 100), (actual) => actual === error);
    assert.equal(calls, 1);
  }
});

test("aborts stop repair and prevent accepting a response received after cancellation", async () => {
  const controller = new AbortController();
  let calls = 0;
  const read = createStructuredReader(async () => {
    calls++;
    controller.abort();
    return "{}";
  }, controller.signal);
  await assert.rejects(
    read('{"bad":', 100),
    (error) => error === controller.signal.reason,
  );
  assert.equal(calls, 1);
  await assert.rejects(
    read("{}", 100),
    (error) => error === controller.signal.reason,
  );
  assert.equal(calls, 1);
});

test("oversized malformed output is rejected before a repair request", async () => {
  let calls = 0;
  const read = createStructuredReader(async () => {
    calls++;
    return "{}";
  }, new AbortController().signal);
  await assert.rejects(
    read('{"text":"' + "中".repeat(27000), 6000),
    /内容过长/,
  );
  assert.equal(calls, 0);
});
