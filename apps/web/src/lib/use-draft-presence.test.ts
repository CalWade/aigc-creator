import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useDraftPresence } from "./use-draft-presence";

class FakeBroadcastChannel extends EventTarget {
  static channels = new Map<string, FakeBroadcastChannel[]>();
  constructor(public name: string) {
    super();
    const list = FakeBroadcastChannel.channels.get(name) ?? [];
    list.push(this);
    FakeBroadcastChannel.channels.set(name, list);
  }
  postMessage(data: unknown): void {
    const list = FakeBroadcastChannel.channels.get(this.name) ?? [];
    for (const ch of list) {
      if (ch === this) continue;
      ch.dispatchEvent(new MessageEvent("message", { data }));
    }
  }
  close(): void {
    const list = FakeBroadcastChannel.channels.get(this.name) ?? [];
    FakeBroadcastChannel.channels.set(
      this.name,
      list.filter((c) => c !== this),
    );
  }
}

beforeEach(() => {
  FakeBroadcastChannel.channels.clear();
  (globalThis as unknown as { BroadcastChannel: typeof BroadcastChannel }).BroadcastChannel =
    FakeBroadcastChannel as unknown as typeof BroadcastChannel;
});

afterEach(() => {
  FakeBroadcastChannel.channels.clear();
});

describe("useDraftPresence", () => {
  it("单 tab → otherTabExists=false", () => {
    const { result } = renderHook(() => useDraftPresence("d1"));
    expect(result.current.otherTabExists).toBe(false);
  });

  it("两个 hook 实例同 draftId → 双方都 otherTabExists=true", () => {
    const a = renderHook(() => useDraftPresence("d1"));
    const b = renderHook(() => useDraftPresence("d1"));
    expect(a.result.current.otherTabExists).toBe(true);
    expect(b.result.current.otherTabExists).toBe(true);
  });

  it("不同 draftId 不互相影响", () => {
    const a = renderHook(() => useDraftPresence("d1"));
    const b = renderHook(() => useDraftPresence("d2"));
    expect(a.result.current.otherTabExists).toBe(false);
    expect(b.result.current.otherTabExists).toBe(false);
  });
});
