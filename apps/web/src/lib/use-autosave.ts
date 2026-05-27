import { useEffect, useRef, useState } from "react";

export type AutosaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

export interface AutosaveResult {
  status: AutosaveStatus;
  lastSavedAt: number | null;
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

  const mountedRef = useRef(false);

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    setStatus("dirty");
    const timer = setTimeout(() => {
      setStatus("saving");
      saveRef
        .current(value)
        .then(() => {
          setStatus("saved");
          setLastSavedAt(Date.now());
        })
        .catch(() => {
          setStatus("error");
        });
    }, delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return { status, lastSavedAt };
}
