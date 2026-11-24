import type { AiUser } from "../../packages/contracts/ai";
import type { RunDelta, RunSnapshot } from "./run-stream";
const base = import.meta.env.BASE_URL + "api/v1";
let csrf = "";
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function api<T = any>(
  path: string,
  options: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  const response = await fetch(base + path, {
    method: options.method || "GET",
    credentials: "same-origin",
    headers: {
      ...(options.body !== undefined
        ? { "Content-Type": "application/json" }
        : {}),
      ...(csrf ? { "X-CSRF-Token": csrf } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal || AbortSignal.timeout(8000),
  }).catch((error: Error) => {
    throw new ApiError(
      0,
      error.name === "TimeoutError" || error.name === "AbortError"
        ? "请求超时，请检查网络后重试"
        : "暂时无法连接服务，请检查网络后重试",
    );
  });
  const content = response.headers.get("content-type");
  if (!content?.includes("application/json"))
    throw new ApiError(503, "AI 服务尚未启动，题库和本机练习仍可使用");
  const data = await response.json();
  if (!response.ok)
    throw new ApiError(response.status, data.error || "请求失败");
  if (data.csrf) csrf = data.csrf;
  return data;
}
export interface Identity {
  user: AiUser;
  enabled: boolean;
  csrf: string;
}
export const clearIdentity = () => {
  csrf = "";
};
export function subscribeRun(
  runId: string,
  update: (value: RunSnapshot) => void,
  fail: () => void,
  live: { delta: (value: RunDelta) => void; connected: () => void },
) {
  const source = new EventSource(
    `${base}/runs/${encodeURIComponent(runId)}/events?live=1`,
    { withCredentials: true },
  );
  const receive = (event: Event, apply: (value: any) => void) => {
    try {
      apply(JSON.parse((event as MessageEvent).data));
    } catch {
      fail();
    }
  };
  source.addEventListener("snapshot", (event) => receive(event, update));
  source.addEventListener("delta", (event) => receive(event, live.delta));
  source.onopen = live.connected;
  source.onerror = fail;
  return () => source.close();
}
