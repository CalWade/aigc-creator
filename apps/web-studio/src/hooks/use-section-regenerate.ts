"use client";

import { useCallback, useState } from "react";
import type { OutlineItem } from "@bytedance-aigc/shared";

import { streamFetch } from "@bytedance-aigc/ui/lib/sse";

interface FrameEnvelope {
  type: "section.start" | "token" | "section.end" | "done" | "error";
  data: unknown;
}

export interface UseRegenerateSection {
  loading: boolean;
  error: string | null;
  regenerate: (heading: string, sections: OutlineItem[]) => Promise<string>;
}

/**
 * 复用 POST /drafts/:id/sections/stream 加 headings:[heading] 字段做单段重生。
 * 内部用 streamFetch(SSE),累计 token 拼成完整新段文本后 return。
 */
export function useRegenerateSection(draftId: string): UseRegenerateSection {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const regenerate = useCallback(
    async (heading: string, sections: OutlineItem[]): Promise<string> => {
      setLoading(true);
      setError(null);
      let text = "";
      try {
        for await (const frame of streamFetch({
          path: `/drafts/${draftId}/sections/stream`,
          body: { sections, headings: [heading] },
        })) {
          const env = frame.data as FrameEnvelope;
          if (!env || typeof env !== "object") continue;
          if (env.type === "token") {
            const data = env.data as { index: number; delta: string };
            text += data.delta ?? "";
          } else if (env.type === "error") {
            const e = env.data as { message?: string };
            throw new Error(e?.message ?? "regenerate error");
          }
        }
        return text;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [draftId],
  );

  return { loading, error, regenerate };
}
