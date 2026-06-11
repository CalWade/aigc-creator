"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { DraftToolType } from "@bytedance-aigc/shared";

const PREFIX = "bytedance-aigc:active-prompt:";

const subscribe = (cb: () => void): (() => void) => {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
};

const getSnapshot = (tool: DraftToolType): string | null => {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(PREFIX + tool);
};

/**
 * 记住每个 tool "当前生效"的 promptId。
 *   - localStorage 持久化(SSR 安全:typeof window 守卫)
 *   - 不存在则为 null,使用方传 promptId 时若为 null 由后端自动选 isStarter 默认款
 *   - 使用 useSyncExternalStore 避免在 effect 中 setState(react-hooks/set-state-in-effect)
 *   - 跨 tab 同步靠 storage 事件;同 tab 内由调用方 setPromptId 显式触发刷新
 */
export function useActivePromptId(tool: DraftToolType): {
  promptId: string | null;
  setPromptId: (id: string | null) => void;
} {
  const promptId = useSyncExternalStore(
    subscribe,
    () => getSnapshot(tool),
    () => null,
  );

  const setPromptId = useCallback(
    (id: string | null) => {
      if (typeof window === "undefined") return;
      if (id === null) window.localStorage.removeItem(PREFIX + tool);
      else window.localStorage.setItem(PREFIX + tool, id);
      // 同 tab 内手动派发 storage 事件,触发其他 useSyncExternalStore 订阅者重读
      window.dispatchEvent(new StorageEvent("storage", { key: PREFIX + tool }));
    },
    [tool],
  );

  return { promptId, setPromptId };
}
