import { test } from "node:test";
import assert from "node:assert/strict";
import { provider } from "./provider.ts";
test("structured output is received through SSE across arbitrary chunk boundaries", async (t) => {
  let body: any;
  const stream =
    "data: " +
    JSON.stringify({
      choices: [
        { delta: { content: '{"问题":"取消请求"}' }, finish_reason: null },
      ],
    }) +
    "\n\ndata: " +
    JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] }) +
    "\n\ndata: " +
    JSON.stringify({ choices: [], usage: { total_tokens: 123 } }) +
    "\n\ndata: [DONE]\n\n";
  const bytes = new TextEncoder().encode(stream);
  t.mock.method(globalThis, "fetch", async (_url: any, options: any) => {
    body = JSON.parse(options.body);
    return new Response(
      new ReadableStream({
        start(c) {
          for (let i = 0; i < bytes.length; i += 7)
            c.enqueue(bytes.slice(i, i + 7));
          c.close();
        },
      }),
      { headers: { "content-type": "text/event-stream" } },
    );
  });
  const result = await provider({
    baseUrl: "https://example.test/v1",
    apiKey: "test",
    model: "test",
  })([{ role: "user", content: "生成" }], {
    structured: true,
    maxTokens: 100,
    signal: AbortSignal.timeout(3000),
  });
  assert.equal(body.stream, true);
  assert.equal(body.response_format.type, "json_object");
  assert.equal(result.text, '{"问题":"取消请求"}');
  assert.equal(result.tokens, 123);
});
test("truncated stream is rejected rather than saved as a completed answer", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response('data: {"choices":[{"delta":{"content":"半个答案"}}]}\n\n', {
        headers: { "content-type": "text/event-stream" },
      }),
  );
  await assert.rejects(
    () =>
      provider({
        baseUrl: "https://example.test/v1",
        apiKey: "test",
        model: "test",
      })([], { maxTokens: 100, signal: AbortSignal.timeout(3000) }),
    /输出未完成/,
  );
});
