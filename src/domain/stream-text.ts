export interface TextFrameScheduler {
  now(): number;
  request(callback: (time: number) => void): number;
  cancel(id: number): void;
}

const segmenter = new Intl.Segmenter("zh", { granularity: "grapheme" });
const endsOf = (text: string) =>
  [...segmenter.segment(text)].map((part) => part.index + part.segment.length);

/** Smooth only content already received, with a bounded tail rather than a typing speed. */
export function createStreamText(
  commit: (text: string) => void,
  scheduler: TextFrameScheduler,
) {
  let target = "",
    shown = "",
    ends: number[] = [],
    frame: number | undefined;
  let lastCommit = 0,
    receivedAt = 0,
    instant = false,
    disposed = false;
  const cancel = () => {
    if (frame !== undefined) scheduler.cancel(frame);
    frame = undefined;
  };
  const show = (value: string, now: number) => {
    lastCommit = now;
    if (shown !== value) {
      shown = value;
      commit(value);
    }
  };
  const flush = () => {
    cancel();
    show(target, scheduler.now());
  };
  const tick = (now: number) => {
    frame = undefined;
    if (disposed) return;
    const elapsed = now - lastCommit;
    if (instant || now - receivedAt >= 160) {
      flush();
      return;
    }
    if (elapsed >= 32) {
      const remaining = ends.filter((end) => end > shown.length);
      const take = Math.max(
        1,
        Math.ceil(remaining.length * Math.min(1, elapsed / 85)),
      );
      const end = remaining[take - 1];
      if (end !== undefined) show(target.slice(0, end), now);
    }
    if (shown !== target) frame = scheduler.request(tick);
  };
  return {
    update(value: string, immediate = false) {
      if (disposed) return;
      const append = value.startsWith(target);
      target = value;
      ends = endsOf(value);
      receivedAt = scheduler.now();
      if (immediate || instant || !append || !value) {
        flush();
        return;
      }
      if (!shown)
        show(value.slice(0, ends[Math.min(3, ends.length - 1)]), receivedAt);
      if (shown !== target && frame === undefined)
        frame = scheduler.request(tick);
    },
    immediate(value: boolean) {
      instant = value;
      if (value) flush();
    },
    flush,
    dispose() {
      disposed = true;
      cancel();
    },
  };
}
