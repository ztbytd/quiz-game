import type { ServerResponse } from "node:http";

type Run = Record<string, any>;
export interface Publication {
  event: "snapshot" | "delta";
  data: any;
  snapshot: Run;
  terminal: boolean;
}
interface Entry {
  run: Run;
  text: string;
  sent: string;
  seq: number;
  lastSent: number;
  accepting: boolean;
  timer?: ReturnType<typeof setTimeout>;
}
const active = (run: Run) => ["queued", "running"].includes(run.status);

/** Live delivery is independent of database checkpoints; entries only live while a task runs. */
export class RunStreamHub {
  private entries = new Map<string, Entry>();
  private listeners = new Map<string, Set<(value: Publication) => void>>();
  private interval: number;
  constructor(interval = 35) {
    this.interval = interval;
  }
  begin(run: Run) {
    const previous = this.entries.get(run.id);
    if (previous?.timer) clearTimeout(previous.timer);
    const text = run.output?.text || "";
    const entry: Entry = {
      run: { ...run, status: "running" },
      text,
      sent: text,
      seq: 0,
      lastSent: 0,
      accepting: true,
    };
    this.entries.set(run.id, entry);
    const snapshot = this.pack(entry);
    this.publish(run.id, {
      event: "snapshot",
      data: snapshot,
      snapshot,
      terminal: false,
    });
  }
  private pack(entry: Entry): Run {
    return {
      ...entry.run,
      output: { ...entry.run.output, text: entry.sent },
      stream: {
        id: `${entry.run.id}:${entry.run.fence}`,
        seq: entry.seq,
        offset: entry.sent.length,
      },
    };
  }
  private publish(id: string, value: Publication) {
    const listeners = this.listeners.get(id);
    for (const listener of listeners || []) {
      try {
        listener(value);
      } catch {
        listeners?.delete(listener);
      }
    }
  }
  private flush(id: string, entry: Entry) {
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = undefined;
    if (entry.text === entry.sent) return;
    const offset = entry.sent.length;
    const append = entry.text.startsWith(entry.sent);
    const text = append ? entry.text.slice(offset) : entry.text;
    entry.sent = entry.text;
    entry.seq++;
    entry.lastSent = Date.now();
    const snapshot = this.pack(entry);
    this.publish(id, {
      event: append ? "delta" : "snapshot",
      data: append
        ? {
            runId: id,
            streamId: snapshot.stream.id,
            fence: entry.run.fence,
            seq: entry.seq,
            offset,
            text,
          }
        : snapshot,
      snapshot,
      terminal: false,
    });
  }
  text(id: string, fence: number, text: string) {
    const entry = this.entries.get(id);
    if (!entry?.accepting || entry.run.fence !== fence) return;
    entry.text = text;
    if (!entry.lastSent || Date.now() - entry.lastSent >= this.interval)
      this.flush(id, entry);
    else if (!entry.timer)
      entry.timer = setTimeout(
        () => this.flush(id, entry),
        this.interval - (Date.now() - entry.lastSent),
      );
  }
  currentText(id: string, fence: number) {
    const entry = this.entries.get(id);
    return entry?.run.fence === fence ? entry.text : undefined;
  }
  pause(id: string, fence: number) {
    const entry = this.entries.get(id);
    if (entry?.run.fence === fence) {
      entry.accepting = false;
      if (entry.timer) clearTimeout(entry.timer);
      entry.timer = undefined;
    }
  }
  has(id: string) {
    return this.entries.has(id);
  }
  forget(id: string, fence: number) {
    const entry = this.entries.get(id);
    if (entry?.run.fence !== fence) return;
    if (entry.timer) clearTimeout(entry.timer);
    this.entries.delete(id);
  }
  snapshot(run: Run) {
    const entry = this.entries.get(run.id);
    if (!entry || entry.run.fence !== run.fence || !active(run)) return run;
    // Establish one cursor for the latest text before a reconnect snapshot is written.
    this.flush(run.id, entry);
    return this.pack(entry);
  }
  finish(run: Run) {
    const entry = this.entries.get(run.id);
    if (entry && run.fence < entry.run.fence) return;
    if (entry?.timer) clearTimeout(entry.timer);
    const text = run.output?.text || "";
    const snapshot = {
      ...run,
      ...(entry
        ? {
            stream: {
              id: `${run.id}:${run.fence}`,
              seq: entry.seq + 1,
              offset: text.length,
            },
          }
        : {}),
    };
    this.entries.delete(run.id);
    this.publish(run.id, {
      event: "snapshot",
      data: snapshot,
      snapshot,
      terminal: !active(run),
    });
  }
  subscribe(id: string, listener: (value: Publication) => void) {
    let set = this.listeners.get(id);
    if (!set) this.listeners.set(id, (set = new Set()));
    set.add(listener);
    return () => {
      set.delete(listener);
      if (!set.size) this.listeners.delete(id);
    };
  }
  close() {
    for (const entry of this.entries.values())
      if (entry.timer) clearTimeout(entry.timer);
    this.entries.clear();
    this.listeners.clear();
  }
}

/** A slow socket retains only its latest full snapshot, never an unbounded delta queue. */
export class LiveSseWriter {
  private blocked = false;
  private pending?: Publication;
  private timeout?: ReturnType<typeof setTimeout>;
  private closed = false;
  private response: ServerResponse;
  constructor(response: ServerResponse) {
    this.response = response;
    response.on("drain", this.drain);
    response.on("close", this.close);
  }
  send = (value: Publication) => {
    if (this.closed || this.response.destroyed || this.response.writableEnded)
      return;
    if (this.blocked) {
      this.pending = { ...value, event: "snapshot", data: value.snapshot };
      return;
    }
    const cursor = value.snapshot.stream;
    const eventId = cursor ? `id: ${cursor.id}:${cursor.seq}\n` : "";
    let writable: boolean;
    try {
      writable = this.response.write(
        `${eventId}event: ${value.event}\ndata: ${JSON.stringify(value.data)}\n\n`,
      );
    } catch {
      this.response.destroy();
      return;
    }
    if (!writable) this.block();
    if (value.terminal) {
      this.response.end();
      return;
    }
  };
  private block() {
    this.blocked = true;
    this.timeout = setTimeout(() => this.response.destroy(), 15_000);
  }
  heartbeat() {
    if (
      !this.closed &&
      !this.blocked &&
      !this.response.destroyed &&
      !this.response.writableEnded
    ) {
      try {
        if (!this.response.write(": heartbeat\n\n")) this.block();
      } catch {
        this.response.destroy();
      }
    }
  }
  private drain = () => {
    this.blocked = false;
    if (this.timeout) clearTimeout(this.timeout);
    this.timeout = undefined;
    const value = this.pending;
    this.pending = undefined;
    if (value) this.send(value);
  };
  private close = () => {
    this.closed = true;
    if (this.timeout) clearTimeout(this.timeout);
    this.pending = undefined;
    this.response.off("drain", this.drain);
    this.response.off("close", this.close);
  };
}

/** Coalesced recovery writes do not hold up provider reads or live socket delivery. */
export class TextCheckpoint {
  private latest = "";
  private saved = "";
  private started = 0;
  private writing?: Promise<void>;
  private timer?: ReturnType<typeof setTimeout>;
  private error?: unknown;
  private stopped = false;
  private flushing = false;
  private save: (text: string) => Promise<void>;
  private failed: (error: unknown) => void;
  private interval: number;
  constructor(
    save: (text: string) => Promise<void>,
    failed: (error: unknown) => void,
    interval = 200,
  ) {
    this.save = save;
    this.failed = failed;
    this.interval = interval;
  }
  set(text: string) {
    if (this.stopped || this.error) return;
    this.latest = text;
    this.schedule();
  }
  private schedule() {
    if (
      this.writing ||
      this.timer ||
      this.latest === this.saved ||
      this.stopped ||
      this.error ||
      this.flushing
    )
      return;
    const remaining = this.interval - (Date.now() - this.started);
    if (remaining <= 0) this.write();
    else
      this.timer = setTimeout(() => {
        this.timer = undefined;
        this.write();
      }, remaining);
  }
  private write() {
    const text = this.latest;
    this.started = Date.now();
    this.writing = this.save(text)
      .then(() => {
        this.saved = text;
      })
      .catch((error) => {
        this.error = error;
        this.failed(error);
      })
      .finally(() => {
        this.writing = undefined;
        this.schedule();
      });
  }
  async flush() {
    this.flushing = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    try {
      while (true) {
        if (this.writing) await this.writing;
        if (this.error) throw this.error;
        if (this.latest === this.saved) return;
        this.write();
      }
    } finally {
      this.flushing = false;
      this.schedule();
    }
  }
  async stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    if (this.writing) await this.writing;
  }
}
