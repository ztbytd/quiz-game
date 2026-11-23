export interface ProviderConfig {
  baseUrl: string;
  model: string;
  apiKey: string;
}
export interface Completion {
  text: string;
  tokens: number;
}
export type Complete = (
  messages: Array<{ role: string; content: string }>,
  options: {
    structured?: boolean;
    maxTokens: number;
    signal: AbortSignal;
    delta?: (text: string) => Promise<void>;
  },
) => Promise<Completion>;
export function provider(config: ProviderConfig): Complete {
  const url = new URL(config.baseUrl.replace(/\/$/, "") + "/chat/completions");
  if (url.protocol !== "https:" && url.hostname !== "127.0.0.1")
    throw new Error("模型接口必须使用 HTTPS");
  return async (messages, options) => {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      signal: options.signal,
      body: JSON.stringify({
        model: config.model,
        messages,
        stream: true,
        max_completion_tokens: options.maxTokens,
        stream_options: { include_usage: true },
        ...(options.structured
          ? { response_format: { type: "json_object" } }
          : {}),
      }),
    }).catch((error: any) => {
      throw new Error(
        "无法连接模型服务" +
          (error.cause?.code ? "（" + error.cause.code + "）" : ""),
        { cause: error },
      );
    });
    if (!response.ok)
      throw Object.assign(
        new Error(`模型服务返回 ${response.status}，请检查模型配置或稍后重试`),
        { upstreamRejected: true },
      );
    if (response.headers.get("content-type")?.includes("application/json")) {
      const data: any = await response.json();
      const text = data.choices?.[0]?.message?.content;
      if (typeof text !== "string" || !text.trim())
        throw new Error("模型未返回可用内容");
      return { text, tokens: data.usage?.total_tokens || 0 };
    }
    if (!response.body) throw new Error("模型未返回响应流");
    let text = "",
      tokens = 0,
      buffer = "",
      finished = false;
    const reader = response.body
      .pipeThrough(new TextDecoderStream())
      .getReader();
    try {
      while (true) {
        const item = await reader.read();
        if (item.done) break;
        buffer += item.value;
        let split: number;
        while ((split = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, split).trim();
          buffer = buffer.slice(split + 1);
          if (!line.startsWith("data:")) continue;
          const raw = line.slice(5).trim();
          if (raw === "[DONE]") {
            finished = true;
            continue;
          }
          if (!raw) continue;
          const part = JSON.parse(raw);
          if (part.error) throw new Error("模型响应中断");
          tokens = part.usage?.total_tokens || tokens;
          const value = part.choices?.[0]?.delta?.content;
          if (typeof value === "string") {
            text += value;
            await options.delta?.(text);
          }
          if (part.choices?.[0]?.finish_reason === "length")
            throw new Error("模型输出达到长度上限，请缩小本次任务范围");
          if (part.choices?.[0]?.finish_reason) finished = true;
        }
      }
    } catch (error) {
      await reader.cancel().catch(() => {});
      throw error;
    } finally {
      reader.releaseLock();
    }
    if (!finished || !text.trim())
      throw new Error("模型输出未完成，请查看已接收的内容");
    return { text, tokens };
  };
}
