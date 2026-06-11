"use client";

import { useCallback, useRef, useState } from "react";
import type { OutlineItem } from "@bytedance-aigc/shared";

import { streamFetch } from "@bytedance-aigc/ui/lib/sse";

export interface StreamingHandlers {
  onSectionStart: (e: { index: number; heading: string }) => void;
  onToken: (e: { index: number; delta: string }) => void;
  onSectionEnd: (e: { index: number }) => void;
  onDone: () => void;
  onError: (e: { message: string }) => void;
}

export type StreamingStatus = "idle" | "streaming" | "done" | "error";

export interface UseStreamingGeneration {
  status: StreamingStatus;
  start: (draftId: string, sections: OutlineItem[], handlers: StreamingHandlers) => Promise<void>;
  stop: () => void;
}

interface FrameEnvelope {
  type: "section.start" | "token" | "section.end" | "done" | "error";
  data: unknown;
}

/**
 * 流式生成正文的 hook。封装:
 *   - POST /drafts/:id/sections/stream 的 SSE 客户端连接
 *   - AbortController 暴露 stop()
 *   - 帧分发到外部 handlers
 *
 * 调用方负责:flush autosave、setStreaming(true/false)、写 editor。
 */
export function useStreamingGeneration(): UseStreamingGeneration {
  const [status, setStatus] = useState<StreamingStatus>("idle");
  const abortRef = useRef<AbortController | null>(null);

  const start = useCallback(
    async (
      draftId: string,
      sections: OutlineItem[],
      handlers: StreamingHandlers,
    ): Promise<void> => {
      const controller = new AbortController();
      abortRef.current = controller;
      setStatus("streaming");

      try {
        for await (const frame of streamFetch({
          path: `/drafts/${draftId}/sections/stream`,
          body: { sections },
          signal: controller.signal,
        })) {
          const env = frame.data as FrameEnvelope;
          if (!env || typeof env !== "object") continue;
          switch (env.type) {
            case "section.start":
              handlers.onSectionStart(env.data as { index: number; heading: string });
              break;
            case "token":
              handlers.onToken(env.data as { index: number; delta: string });
              break;
            case "section.end":
              handlers.onSectionEnd(env.data as { index: number });
              break;
            case "done":
              handlers.onDone();
              setStatus("done");
              break;
            case "error": {
              const e = env.data as { message?: string };
              handlers.onError({ message: e?.message ?? "unknown error" });
              setStatus("error");
              break;
            }
          }
        }
      } catch (err) {
        if ((err as { name?: string }).name === "AbortError") {
          setStatus("idle");
          return;
        }
        const message = err instanceof Error ? err.message : String(err);
        handlers.onError({ message });
        setStatus("error");
      } finally {
        abortRef.current = null;
      }
    },
    [],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  return { status, start, stop };
}
