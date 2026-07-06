"use client";

import { useCallback, useRef, useState } from "react";
import type { SafeRewriteFrame, SafeRewriteRequest } from "@aigc-creator/shared";
import { streamFetch } from "@aigc-creator/ui/lib/sse";

type RouteStatus = "pending" | "streaming" | "done" | "error";

export interface SafeRewriteState {
  candidates: [string, string];
  status: [RouteStatus, RouteStatus];
  error: string | null;
  start: (req: SafeRewriteRequest) => Promise<void>;
  abort: () => void;
}

export function useSafeRewrite(): SafeRewriteState {
  const [candidates, setCandidates] = useState<[string, string]>(["", ""]);
  const [status, setStatus] = useState<[RouteStatus, RouteStatus]>(["pending", "pending"]);
  const [error, setError] = useState<string | null>(null);
  const ctrl = useRef<AbortController | null>(null);

  const start = useCallback(async (req: SafeRewriteRequest) => {
    setCandidates(["", ""]);
    setStatus(["streaming", "streaming"]);
    setError(null);
    ctrl.current = new AbortController();
    try {
      for await (const frame of streamFetch({
        path: "/reviews/safe-rewrite",
        body: req,
        signal: ctrl.current.signal,
      })) {
        const f = frame.data as SafeRewriteFrame;
        if (f.event === "token") {
          setCandidates((prev) => {
            const next: [string, string] = [prev[0], prev[1]];
            next[f.idx] = next[f.idx] + f.delta;
            return next;
          });
        } else if (f.event === "end") {
          setStatus((prev) => {
            const next: [RouteStatus, RouteStatus] = [prev[0], prev[1]];
            next[f.idx] = "done";
            return next;
          });
        } else if (f.event === "error") {
          if (f.idx !== undefined) {
            const errIdx = f.idx;
            setStatus((prev) => {
              const next: [RouteStatus, RouteStatus] = [prev[0], prev[1]];
              next[errIdx] = "error";
              return next;
            });
          } else {
            setError(f.message);
            setStatus(["error", "error"]);
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "stream failed");
      setStatus(["error", "error"]);
    }
  }, []);

  const abort = useCallback(() => {
    ctrl.current?.abort();
  }, []);

  return { candidates, status, error, start, abort };
}
