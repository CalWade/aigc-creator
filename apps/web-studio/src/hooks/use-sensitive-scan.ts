"use client";

import { useEffect, useRef } from "react";
import type { Editor } from "@tiptap/react";
import { loadSensitiveWords } from "@bytedance-aigc/shared";

import { dispatchSetViolations, type Violation } from "@/lib/tiptap/review-decorations";
import type { WorkerInbound, WorkerOutbound } from "../workers/sensitive-scanner.worker";

const DEBOUNCE_MS = 1500;

/**
 * 启动 Worker、注入词库;TipTap update 1.5s 防抖后投递扫描请求。
 * Worker 失败 → silent no-op。
 */
export function useSensitiveScan(editor: Editor | null): void {
  const workerRef = useRef<Worker | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reqIdRef = useRef(0);

  useEffect(() => {
    if (!editor) return;
    let worker: Worker | null = null;
    try {
      worker = new Worker(new URL("../workers/sensitive-scanner.worker.ts", import.meta.url), {
        type: "module",
      });
    } catch (err) {
      console.warn("[use-sensitive-scan] Worker 不支持,降级 no-op:", err);
      return;
    }

    workerRef.current = worker;
    const initMsg: WorkerInbound = { type: "init", words: loadSensitiveWords() };
    worker.postMessage(initMsg);

    worker.addEventListener("message", (ev: MessageEvent<WorkerOutbound>) => {
      const data = ev.data;
      if (data.type !== "scan") return;
      const violations: Violation[] = data.res.hits.map((h, idx) => ({
        id: `word-${data.res.id}-${idx}`,
        from: h.from,
        to: h.to,
        severity: h.severity,
        category: h.category,
        source: "word",
        message: `${h.category}:${h.word}`,
      }));
      dispatchSetViolations(editor, "word", violations);
    });

    const handleUpdate = (): void => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        const text = editor.getText();
        const id = `r${++reqIdRef.current}`;
        const msg: WorkerInbound = { type: "scan", req: { id, text } };
        worker?.postMessage(msg);
      }, DEBOUNCE_MS);
    };

    editor.on("update", handleUpdate);

    return () => {
      editor.off("update", handleUpdate);
      if (timerRef.current) clearTimeout(timerRef.current);
      worker?.terminate();
      workerRef.current = null;
    };
  }, [editor]);
}
