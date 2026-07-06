/// <reference lib="webworker" />

import type { SensitiveWordList } from "@aigc-creator/shared";
import { flattenWords } from "@aigc-creator/shared";
import { buildAC, search } from "./aho-corasick";
import type { AC, ACHit } from "./aho-corasick";

export interface ScanRequest {
  id: string;
  text: string;
}

export interface ScanResponse {
  id: string;
  hits: ACHit[];
}

type WorkerInbound =
  | { type: "init"; words: SensitiveWordList }
  | { type: "scan"; req: ScanRequest };

type WorkerOutbound = { type: "ready" } | { type: "scan"; res: ScanResponse };

let ac: AC | null = null;

/**
 * 纯函数包装,便于单测;Worker handler 直接复用。
 */
export function handleScanRequest(words: SensitiveWordList, req: ScanRequest): ScanResponse {
  const localAc = buildAC(flattenWords(words));
  const hits = search(localAc, req.text);
  return { id: req.id, hits };
}

// Worker entry — 仅在 worker 上下文执行
declare const self: DedicatedWorkerGlobalScope;
if (
  typeof self !== "undefined" &&
  typeof (self as DedicatedWorkerGlobalScope).postMessage === "function"
) {
  self.addEventListener("message", (ev: MessageEvent<WorkerInbound>) => {
    const data = ev.data;
    if (data.type === "init") {
      ac = buildAC(flattenWords(data.words));
      const out: WorkerOutbound = { type: "ready" };
      self.postMessage(out);
      return;
    }
    if (data.type === "scan") {
      if (!ac) {
        // 未初始化:返空
        const out: WorkerOutbound = { type: "scan", res: { id: data.req.id, hits: [] } };
        self.postMessage(out);
        return;
      }
      const hits = search(ac, data.req.text);
      const out: WorkerOutbound = { type: "scan", res: { id: data.req.id, hits } };
      self.postMessage(out);
    }
  });
}

export type { WorkerInbound, WorkerOutbound };
