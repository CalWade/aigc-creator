import { apiBaseUrl, getToken } from "./auth";

export interface SseEvent {
  event?: string;
  data: unknown;
}

/**
 * 浏览器侧 SSE 客户端 — fetch + ReadableStream + TextDecoder。
 * EventSource 不支持自定义 header(JWT),因此用 POST + fetch 流式读体。
 *
 * Server 端 NestJS @Sse 输出形如 `data: <json>\n\n`,这里按 \n\n 分帧、
 * 提取 `event:` / `data:` 行,JSON.parse data 字段(失败则保留原文)。
 */
export async function* streamFetch(opts: {
  path: string;
  body: unknown;
  signal?: AbortSignal;
}): AsyncGenerator<SseEvent, void, void> {
  const token = getToken();
  const res = await fetch(`${apiBaseUrl()}${opts.path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(opts.body),
    signal: opts.signal,
  });
  if (!res.ok || !res.body) {
    throw new Error(`SSE HTTP ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let sep: number;
      while ((sep = buffer.indexOf("\n\n")) !== -1) {
        const raw = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        const frame = parseFrame(raw);
        if (frame) yield frame;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function parseFrame(raw: string): SseEvent | null {
  let event: string | undefined;
  let dataText: string | undefined;
  for (const line of raw.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) {
      const piece = line.slice(5).trim();
      dataText = dataText === undefined ? piece : dataText + "\n" + piece;
    }
  }
  if (event === undefined && dataText === undefined) return null;
  let data: unknown = dataText;
  if (dataText !== undefined) {
    try {
      data = JSON.parse(dataText);
    } catch {
      data = dataText;
    }
  }
  return { event, data };
}
