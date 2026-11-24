import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useAiStore } from "../src/stores/ai";
import type { RunSnapshot, RunDelta } from "../src/infrastructure/run-stream";

const transport = vi.hoisted(() => ({
  api: vi.fn(),
  subscriptions: [] as Array<{
    snapshot: (run: RunSnapshot) => void;
    fail: () => void;
    delta: (delta: RunDelta) => void;
    connected: () => void;
    close: ReturnType<typeof vi.fn>;
  }>,
}));
vi.mock("../src/infrastructure/ai-client", () => ({
  api: transport.api,
  clearIdentity: vi.fn(),
  ApiError: class extends Error {},
  subscribeRun: (
    _id: string,
    snapshot: (run: RunSnapshot) => void,
    fail: () => void,
    live: { delta: (delta: RunDelta) => void; connected: () => void },
  ) => {
    const close = vi.fn();
    transport.subscriptions.push({ snapshot, fail, ...live, close });
    return close;
  },
}));
vi.mock("../src/data/content", () => ({
  syncPersonal: vi.fn(),
  clearPersonal: vi.fn(),
}));
vi.mock("../src/stores/learning", () => ({
  useLearningStore: () => ({ accountId: "fixture" }),
}));
const run = (
  text = "",
  seq = 0,
  extra: Partial<RunSnapshot> = {},
): RunSnapshot => ({
  id: "r1",
  conversation_id: "c1",
  kind: "chat",
  status: "running",
  fence: 1,
  output: { text },
  created_at: "2026-11-24T00:00:00Z",
  stream: { id: "r1:1", seq, offset: text.length },
  ...extra,
});
const delta = (text: string, seq: number, offset: number): RunDelta => ({
  runId: "r1",
  streamId: "r1:1",
  fence: 1,
  seq,
  offset,
  text,
});
const flush = async () => {
  for (let index = 0; index < 5; index++) await Promise.resolve();
};
const conversation = (id: string) => ({
  id,
  title: "test",
  mode: "chat" as const,
  context: {},
  updated_at: "2026-11-24",
});
beforeEach(() => {
  vi.useFakeTimers();
  setActivePinia(createPinia());
  transport.subscriptions.length = 0;
  transport.api.mockReset();
  transport.api.mockImplementation(async (path: string) => {
    if (path === "/usage") return { consumed: 0, reserved: 0, limit: 10 };
    if (
      path === "/conversations" ||
      path === "/runs" ||
      path === "/my/questions"
    )
      return { items: [] };
    if (path === "/conversations/c1")
      return { conversation: conversation("c1"), messages: [], runs: [] };
    throw new Error("Unexpected path " + path);
  });
});
afterEach(() => {
  vi.useRealTimers();
});

describe("AI live subscription ownership", () => {
  it("ignores an in-flight fallback response when live delivery has recovered", async () => {
    const store = useAiStore();
    store.watchRun(run());
    const source = transport.subscriptions[0]!;
    source.snapshot(run());
    source.delta(delta("先", 1, 0));
    let resolvePoll!: (value: RunSnapshot) => void;
    transport.api.mockImplementationOnce(
      () =>
        new Promise<RunSnapshot>((resolve) => {
          resolvePoll = resolve;
        }),
    );
    source.fail();
    await vi.advanceTimersByTimeAsync(1800);
    source.connected();
    source.snapshot(run("先", 1));
    source.delta(delta("后", 2, 1));
    resolvePoll(run("先", 1, { stream: undefined }));
    await flush();
    expect(store.run?.output.text).toBe("先后");
    const calls = transport.api.mock.calls.length;
    await vi.advanceTimersByTimeAsync(4000);
    expect(transport.api.mock.calls.length).toBe(calls);
    store.stopSubscription();
  });
  it("resubscribes on a gap and discards events queued by the old connection", () => {
    const store = useAiStore();
    store.watchRun(run());
    const first = transport.subscriptions[0]!;
    first.snapshot(run());
    first.delta(delta("缺段", 2, 0));
    expect(first.close).toHaveBeenCalled();
    expect(transport.subscriptions).toHaveLength(2);
    const second = transport.subscriptions[1]!;
    second.snapshot(run("已校准", 2));
    first.delta(delta("旧回调", 3, 3));
    second.delta(delta("继续", 3, 3));
    expect(store.run?.output.text).toBe("已校准继续");
    store.stopSubscription();
  });
  it("cannot change a new chat from old stream or old conversation fetch responses", async () => {
    const store = useAiStore();
    store.watchRun(run());
    const source = transport.subscriptions[0]!;
    source.snapshot(run());
    store.newChat();
    source.delta(delta("旧文字", 1, 0));
    source.snapshot(run("迟到终态", 1, { status: "succeeded" }));
    expect(store.run).toBeUndefined();
    let resolveOpen!: (value: unknown) => void;
    transport.api.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOpen = resolve;
        }),
    );
    const opening = store.open("c1");
    store.stopSubscription();
    resolveOpen({
      conversation: conversation("c1"),
      messages: [],
      runs: [run()],
    });
    await opening;
    expect(store.current).toBeUndefined();
    expect(transport.subscriptions).toHaveLength(1);
  });
  it("applies a terminal snapshot once and closes any remaining delivery", async () => {
    const store = useAiStore();
    store.current = conversation("c1");
    store.watchRun(run());
    const source = transport.subscriptions[0]!;
    source.snapshot(run());
    source.delta(delta("首段", 1, 0));
    source.snapshot(run("首段末尾", 2, { status: "succeeded" }));
    await flush();
    source.delta(delta("迟到", 3, 4));
    source.snapshot(run("首段", 1));
    expect(store.run?.output.text).toBe("首段末尾");
    expect(store.run?.status).toBe("succeeded");
    expect(store.active).toBe(false);
    expect(source.close).toHaveBeenCalledTimes(1);
  });
});
