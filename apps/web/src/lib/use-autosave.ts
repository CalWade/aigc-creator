import { useCallback, useEffect, useRef, useState } from "react";

export type AutosaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

export interface AutosaveResult {
  status: AutosaveStatus;
  lastSavedAt: number | null;
  /**
   * 切流式态(true)。期间 value 变化只更新 valueRef,不进入 dirty/防抖路径。
   * 切回 false 不会自动 flush;调用方需要落库时显式 flush()。
   */
  setStreaming: (on: boolean) => void;
  /**
   * 立刻 save(latestValue):清旧防抖,无视 status 直发,promise 在 settle 时 settle。
   */
  flush: () => Promise<void>;
}

export function useAutosave<T>(
  value: T,
  save: (v: T) => Promise<void>,
  delayMs = 1500,
): AutosaveResult {
  const [status, setStatus] = useState<AutosaveStatus>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);

  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const streamingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(false);

  const runSave = useCallback(async (): Promise<void> => {
    setStatus("saving");
    try {
      await saveRef.current(valueRef.current);
      setStatus("saved");
      setLastSavedAt(Date.now());
    } catch {
      setStatus("error");
      throw undefined;
    }
  }, []);

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    if (streamingRef.current) {
      // 流式期间只同步 valueRef(已在 render 阶段同步),跳过防抖触发
      return;
    }
    setStatus("dirty");
    const timer = setTimeout(() => {
      void runSave().catch(() => {
        // status 已置 error;吞掉以免 unhandled rejection
      });
    }, delayMs);
    timerRef.current = timer;
    return () => {
      clearTimeout(timer);
      if (timerRef.current === timer) timerRef.current = null;
    };
  }, [value, delayMs, runSave]);

  const setStreaming = useCallback((on: boolean) => {
    streamingRef.current = on;
    if (on && timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const flush = useCallback(async (): Promise<void> => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    await runSave().catch(() => {
      // 调用方决定是否再 throw;hook 不二次 throw
    });
  }, [runSave]);

  return { status, lastSavedAt, setStreaming, flush };
}
