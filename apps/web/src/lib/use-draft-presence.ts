"use client";

import { useEffect, useRef, useState } from "react";

interface PresenceMessage {
  draftId: string;
  tabId: string;
  action: "open" | "ack" | "close";
}

const CHANNEL_NAME = "draft-presence";

export function useDraftPresence(draftId: string): { otherTabExists: boolean } {
  const [otherTabExists, setOtherTabExists] = useState(false);
  const tabIdRef = useRef<string>("");

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") {
      // SSR / 老浏览器 兜底
      return;
    }
    if (!tabIdRef.current) {
      tabIdRef.current = crypto.randomUUID();
    }
    const myTabId = tabIdRef.current;
    const ch = new BroadcastChannel(CHANNEL_NAME);

    const onMsg = (e: MessageEvent) => {
      const d = e.data as PresenceMessage;
      if (d.draftId !== draftId || d.tabId === myTabId) return;
      if (d.action === "open" || d.action === "ack") {
        setOtherTabExists(true);
        if (d.action === "open") {
          ch.postMessage({ draftId, tabId: myTabId, action: "ack" } satisfies PresenceMessage);
        }
      } else if (d.action === "close") {
        setOtherTabExists(false);
      }
    };

    ch.addEventListener("message", onMsg);
    ch.postMessage({ draftId, tabId: myTabId, action: "open" } satisfies PresenceMessage);

    return () => {
      ch.postMessage({ draftId, tabId: myTabId, action: "close" } satisfies PresenceMessage);
      ch.removeEventListener("message", onMsg);
      ch.close();
    };
  }, [draftId]);

  return { otherTabExists };
}
