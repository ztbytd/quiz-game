import type { AiRun } from "../../packages/contracts/ai";

export interface RunStreamPosition {
  id: string;
  seq: number;
  offset: number;
}
export type RunSnapshot = AiRun & {
  fence?: number;
  updated_at?: string;
  stream?: RunStreamPosition;
};
export interface RunDelta {
  runId: string;
  streamId: string;
  fence: number;
  seq: number;
  offset: number;
  text: string;
}
const pending = (run: AiRun) =>
  run.status === "queued" || run.status === "running";
const textOf = (run: AiRun) =>
  typeof run.output?.text === "string" ? run.output.text : "";

/** One cursor belongs to one subscription, never to a different conversation. */
export class RunStreamCursor {
  private position?: RunStreamPosition;
  private fence?: number;
  constructor(readonly runId: string) {}

  snapshot(current: RunSnapshot | undefined, next: RunSnapshot) {
    if (next.id !== this.runId) return false;
    if (current?.id === next.id) {
      if (!pending(current) && pending(next)) return false;
      if (
        typeof current.fence === "number" &&
        typeof next.fence === "number" &&
        next.fence < current.fence
      )
        return false;
      if (
        !next.stream &&
        next.updated_at &&
        current.updated_at &&
        Date.parse(next.updated_at) < Date.parse(current.updated_at)
      )
        return false;
      // A database recovery response may predate the latest live characters.
      if (
        pending(next) &&
        textOf(current).startsWith(textOf(next)) &&
        textOf(next).length < textOf(current).length
      )
        return false;
    }
    const position = next.stream;
    if (position) {
      if (
        !Number.isSafeInteger(position.seq) ||
        position.seq < 0 ||
        !Number.isSafeInteger(position.offset) ||
        position.offset !== textOf(next).length
      )
        return false;
      if (this.position?.id === position.id && position.seq < this.position.seq)
        return false;
      this.position = { ...position };
      this.fence = next.fence;
    } else if (!pending(next)) {
      this.position = undefined;
    }
    return true;
  }

  delta(
    current: RunSnapshot | undefined,
    value: RunDelta,
  ):
    | { kind: "apply"; run: RunSnapshot }
    | { kind: "ignore" }
    | { kind: "resync" } {
    if (
      !current ||
      current.id !== this.runId ||
      value.runId !== this.runId ||
      !pending(current)
    )
      return { kind: "ignore" };
    if (typeof current.fence === "number" && value.fence < current.fence)
      return { kind: "ignore" };
    if (
      !this.position ||
      value.streamId !== this.position.id ||
      (this.fence !== undefined && value.fence !== this.fence)
    )
      return { kind: "resync" };
    if (value.seq <= this.position.seq) return { kind: "ignore" };
    if (
      !Number.isSafeInteger(value.seq) ||
      value.seq !== this.position.seq + 1 ||
      !Number.isSafeInteger(value.offset) ||
      value.offset !== this.position.offset ||
      value.offset !== textOf(current).length ||
      typeof value.text !== "string"
    )
      return { kind: "resync" };
    const position = {
      id: value.streamId,
      seq: value.seq,
      offset: value.offset + value.text.length,
    };
    this.position = position;
    return {
      kind: "apply",
      run: {
        ...current,
        status: "running",
        output: {
          ...current.output,
          text: textOf(current) + value.text,
        },
        stream: position,
      },
    };
  }
}
