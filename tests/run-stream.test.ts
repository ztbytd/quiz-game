import { describe, expect, it } from "vitest";
import {
  RunStreamCursor,
  type RunSnapshot,
  type RunDelta,
} from "../src/infrastructure/run-stream";

const snapshot = (
  text: string,
  seq = 0,
  extra: Partial<RunSnapshot> = {},
): RunSnapshot => ({
  id: "r1",
  kind: "chat",
  status: "running",
  fence: 2,
  output: { text },
  created_at: "2026-11-24T00:00:00Z",
  stream: { id: "r1:2", seq, offset: text.length },
  ...extra,
});
const delta = (
  text: string,
  seq: number,
  offset: number,
  extra: Partial<RunDelta> = {},
): RunDelta => ({
  runId: "r1",
  streamId: "r1:2",
  fence: 2,
  seq,
  offset,
  text,
  ...extra,
});
describe("live run cursor", () => {
  it("appends exactly once and uses UTF-16 offsets without dropping emoji", () => {
    const cursor = new RunStreamCursor("r1");
    let run = snapshot("中");
    expect(cursor.snapshot(undefined, run)).toBe(true);
    const result = cursor.delta(run, delta("👩🏽‍💻", 1, 1));
    expect(result.kind).toBe("apply");
    if (result.kind !== "apply") throw new Error("not applied");
    run = result.run;
    expect(run.output.text).toBe("中👩🏽‍💻");
    expect(cursor.delta(run, delta("👩🏽‍💻", 1, 1))).toEqual({ kind: "ignore" });
    expect(cursor.delta(run, delta("文", 2, run.output.text.length)).kind).toBe(
      "apply",
    );
  });
  it("requests a fresh snapshot for gaps and ignores older fences and tasks", () => {
    const cursor = new RunStreamCursor("r1"),
      run = snapshot("第一段");
    cursor.snapshot(undefined, run);
    expect(cursor.delta(run, delta("缺段", 3, 3)).kind).toBe("resync");
    expect(cursor.delta(run, delta("错位", 1, 0)).kind).toBe("resync");
    expect(
      cursor.delta(run, delta("旧任务", 1, 3, { fence: 1, streamId: "r1:1" }))
        .kind,
    ).toBe("ignore");
    expect(
      cursor.delta(run, delta("别的任务", 1, 3, { runId: "r2" })).kind,
    ).toBe("ignore");
  });
  it("calibrates reconnects while preventing snapshots from rolling text backwards", () => {
    const cursor = new RunStreamCursor("r1"),
      current = snapshot("完整第一段", 2);
    cursor.snapshot(undefined, current);
    expect(cursor.snapshot(current, snapshot("完整", 1))).toBe(false);
    const recovered = snapshot("完整第一段接上第二段", 4);
    expect(cursor.snapshot(current, recovered)).toBe(true);
    expect(cursor.delta(recovered, delta("接上第二段", 4, 6)).kind).toBe(
      "ignore",
    );
    expect(
      cursor.delta(recovered, delta("末尾", 5, recovered.output.text.length))
        .kind,
    ).toBe("apply");
  });
  it("prefers a live sequence to a later database checkpoint timestamp", () => {
    const cursor = new RunStreamCursor("r1");
    const first = snapshot("第一段", 1, { updated_at: "2026-11-24T00:00:01Z" });
    cursor.snapshot(undefined, first);
    const checkpoint = {
      ...first,
      stream: undefined,
      updated_at: "2026-11-24T00:00:02Z",
    };
    expect(cursor.snapshot(first, checkpoint)).toBe(true);
    const recovered = snapshot("第一段第二段", 2, {
      updated_at: "2026-11-24T00:00:01Z",
    });
    expect(cursor.snapshot(checkpoint, recovered)).toBe(true);
    expect(
      cursor.delta(recovered, delta("第三段", 3, recovered.output.text.length))
        .kind,
    ).toBe("apply");
  });
  it("accepts final authority and cannot resurrect a completed task", () => {
    const cursor = new RunStreamCursor("r1"),
      run = snapshot("暂存");
    cursor.snapshot(undefined, run);
    const complete = snapshot("暂存最后一截", 2, { status: "succeeded" });
    expect(cursor.snapshot(run, complete)).toBe(true);
    expect(cursor.snapshot(complete, snapshot("暂存最后一截更晚", 3))).toBe(
      false,
    );
    expect(cursor.delta(complete, delta("迟到", 3, 7))).toEqual({
      kind: "ignore",
    });
  });
});
