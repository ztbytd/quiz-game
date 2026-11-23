import type { LabSpec } from "../data/labs";

export interface CodeResult {
  rows?: { label: string; pass: boolean; detail: string }[];
  error?: string;
}
export interface CodeRun {
  result: Promise<CodeResult>;
  cancel: () => void;
}

function normalizeResult(value: unknown): CodeResult {
  if (!value || typeof value !== "object")
    return { error: "运行结果无效，请检查实现。" };
  const result = value as CodeResult;
  if (typeof result.error === "string")
    return { error: result.error.slice(0, 300) };
  if (
    !Array.isArray(result.rows) ||
    result.rows.length > 100 ||
    result.rows.some(
      (row) =>
        !row ||
        typeof row.label !== "string" ||
        typeof row.pass !== "boolean" ||
        typeof row.detail !== "string",
    )
  ) {
    return { error: "运行结果无效，请检查实现。" };
  }
  return {
    rows: result.rows.map((row) => ({
      label: row.label.slice(0, 200),
      pass: row.pass,
      detail: row.detail.slice(0, 500),
    })),
  };
}

function workerMain() {
  self.onmessage = async function (event: MessageEvent) {
    const { code, name, cases, kind } = event.data;
    try {
      const solution = new Function(
        '"use strict";\n' + code + "\nreturn " + name + ";",
      )();
      if (typeof solution !== "function")
        throw TypeError("请保留题目给定的函数名");
      const rows = [];
      for (const [label, args, expected, expectedError] of cases) {
        try {
          let actual;
          if (kind === "lru") {
            const cache = solution(args[0]);
            actual = [];
            for (const [method, key, value] of args[1]) {
              if (method === "set") cache.set(key, value);
              else {
                const value = cache.get(key);
                actual.push(
                  value === undefined ? { missing: true } : { value },
                );
              }
            }
          } else if (kind === "tree")
            actual = await solution(args[0], args[1], new Map(args[2]));
          else actual = await solution(...args);
          const received = JSON.stringify(actual) ?? String(actual);
          const want = JSON.stringify(expected);
          rows.push({
            label,
            pass: !expectedError && received === want,
            detail: expectedError
              ? "期望抛出 " + expectedError + "，实际正常返回"
              : "期望 " + want + "，实际 " + received.slice(0, 160),
          });
        } catch (error) {
          const failure = error as Error;
          rows.push({
            label,
            pass: !!expectedError && failure?.name === expectedError,
            detail:
              String(failure?.name || "Error") +
              ": " +
              String(failure?.message || error).slice(0, 180),
          });
        }
      }
      self.postMessage({ rows });
    } catch (error) {
      self.postMessage({
        error: String((error as Error)?.message || error).slice(0, 200),
      });
    }
  };
}

/** An opaque-origin frame owns the worker and its restrictive CSP. No app storage is exposed. */
export function runCode(spec: LabSpec, code: string): CodeRun {
  if (code.length > 100_000)
    return {
      result: Promise.resolve({
        error: "代码过长，请将单次练习控制在 100,000 个字符以内。",
      }),
      cancel: () => {},
    };
  let finish: (value: CodeResult) => void = () => {};
  const result = new Promise<CodeResult>((resolve) => {
    const frame = document.createElement("iframe");
    const channel = crypto.randomUUID();
    frame.hidden = true;
    frame.setAttribute("sandbox", "allow-scripts");
    frame.setAttribute("aria-hidden", "true");
    frame.title = "代码运行沙箱";
    let done = false;
    const receive = (event: MessageEvent) => {
      if (
        event.source !== frame.contentWindow ||
        event.data?.channel !== channel
      )
        return;
      finish(normalizeResult(event.data.result));
    };
    const timer = window.setTimeout(
      () => finish({ error: "运行超过 3 秒，已停止。检查循环终止条件。" }),
      3000,
    );
    finish = (value) => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      window.removeEventListener("message", receive);
      frame.remove();
      resolve(value);
    };
    window.addEventListener("message", receive);
    frame.srcdoc = `<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' blob:; worker-src blob:; connect-src 'none'; child-src blob:"><script>
      let worker, url;
      window.addEventListener('message', function(event) {
        if(event.source !== parent || !event.data || event.data.channel !== ${JSON.stringify(channel)}) return;
        const finish = result => {
          if(worker) worker.terminate();
          if(url) URL.revokeObjectURL(url);
          parent.postMessage({channel:${JSON.stringify(channel)},result}, '*');
        };
        try {
          url = URL.createObjectURL(new Blob(['(' + ${JSON.stringify(workerMain.toString())} + ')();'], {type:'text/javascript'}));
          worker = new Worker(url);
          worker.onmessage = event => finish(event.data);
          worker.onerror = event => finish({error:event.message || '执行失败'});
          worker.postMessage(event.data.input);
        } catch(error) { finish({error:String(error.message || error)}); }
      }, {once:true});
    </script>`;
    frame.onload = () =>
      frame.contentWindow?.postMessage(
        {
          channel,
          input: { code, name: spec.name, kind: spec.kind, cases: spec.cases },
        },
        "*",
      );
    document.body.append(frame);
  });
  return { result, cancel: () => finish({ error: "已停止运行。" }) };
}
