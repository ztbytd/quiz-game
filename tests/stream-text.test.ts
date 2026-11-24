import { describe, expect, it } from "vitest";
import { createStreamText } from "../src/domain/stream-text";

function harness() {
  let time = 0,
    sequence = 0;
  const frames = new Map<number, (time: number) => void>();
  const commits: Array<{ text: string; time: number }> = [];
  const presenter = createStreamText((text) => commits.push({ text, time }), {
    now: () => time,
    request(callback) {
      const id = ++sequence;
      frames.set(id, callback);
      return id;
    },
    cancel(id) {
      frames.delete(id);
    },
  });
  return {
    presenter,
    commits,
    step(milliseconds = 16) {
      time += milliseconds;
      const batch = [...frames.values()];
      frames.clear();
      batch.forEach((callback) => callback(time));
    },
    get visible() {
      return commits.at(-1)?.text || "";
    },
    get pending() {
      return frames.size;
    },
  };
}

describe("received text presentation", () => {
  it("shows a first fragment immediately and commits bounded, continuous updates", () => {
    const h = harness(),
      text = "连续显示已收到的内容。".repeat(60);
    h.presenter.update(text);
    expect(h.visible.length).toBeGreaterThan(0);
    expect(h.visible.length).toBeLessThan(text.length);
    for (let index = 0; index < 12; index++) h.step();
    expect(h.visible).toBe(text);
    expect(h.commits.length).toBeGreaterThan(3);
    expect(h.commits.length).toBeLessThanOrEqual(7);
    expect(h.pending).toBe(0);
  });
  it("never reveals a split emoji or combining character", () => {
    const h = harness(),
      text = "中👩🏽‍💻文é🇨🇳👍🏾".repeat(15);
    const boundaries = new Set(
      [
        ...new Intl.Segmenter("zh", { granularity: "grapheme" }).segment(text),
      ].map((part) => part.index + part.segment.length),
    );
    h.presenter.update(text);
    for (let index = 0; index < 12; index++) h.step();
    for (const commit of h.commits)
      expect(boundaries.has(commit.text.length)).toBe(true);
    expect(h.visible).toBe(text);
  });
  it("catches up after growing bursts without waiting at a fixed typing speed", () => {
    const h = harness();
    for (let index = 1; index <= 20; index++) {
      h.presenter.update("很长的真实增量".repeat(index * 10));
      h.step(33);
    }
    const final = "很长的真实增量".repeat(200);
    for (let index = 0; index < 6; index++) h.step(33);
    expect(h.visible).toBe(final);
    expect(h.commits.every((commit) => final.startsWith(commit.text))).toBe(
      true,
    );
  });
  it("flushes terminal content, replacement snapshots, and motion-free updates", () => {
    const h = harness();
    h.presenter.update("正文".repeat(500));
    h.presenter.update("正文".repeat(500) + "最后一截👩‍💻", true);
    expect(h.visible).toBe("正文".repeat(500) + "最后一截👩‍💻");
    expect(h.pending).toBe(0);
    h.presenter.update("另一会话的快照");
    expect(h.visible).toBe("另一会话的快照");
    h.presenter.immediate(true);
    h.presenter.update("另一会话的快照继续增长");
    expect(h.visible).toBe("另一会话的快照继续增长");
    expect(h.pending).toBe(0);
  });
  it("discards scheduled display work when disposed", () => {
    const h = harness();
    h.presenter.update("尚未显示完毕".repeat(100));
    const before = h.visible;
    h.presenter.dispose();
    h.step(1000);
    h.presenter.update("已离开页面");
    expect(h.visible).toBe(before);
    expect(h.pending).toBe(0);
  });
});
