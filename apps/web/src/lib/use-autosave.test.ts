import { renderHook, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAutosave } from "./use-autosave";

describe("useAutosave", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("初始为 idle，不调 save", () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(({ v }) => useAutosave(v, save, 1500), {
      initialProps: { v: { title: "a", body: {} } },
    });

    expect(result.current.status).toBe("idle");
    expect(save).not.toHaveBeenCalled();
  });

  it("value 变化后 status -> dirty，1.5s 后调一次 save -> saved", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook(({ v }) => useAutosave(v, save, 1500), {
      initialProps: { v: { title: "a" } },
    });

    rerender({ v: { title: "b" } });
    expect(result.current.status).toBe("dirty");
    expect(save).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ title: "b" });
    expect(result.current.status).toBe("saved");
    expect(result.current.lastSavedAt).not.toBeNull();
  });

  it("1.5s 内连改两次只触发一次 save，且使用最后一次值", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { rerender } = renderHook(({ v }) => useAutosave(v, save, 1500), {
      initialProps: { v: { title: "a" } },
    });

    rerender({ v: { title: "b" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });
    rerender({ v: { title: "c" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ title: "c" });
  });

  it("save reject -> status = error", async () => {
    const save = vi.fn().mockRejectedValue(new Error("network"));
    const { result, rerender } = renderHook(({ v }) => useAutosave(v, save, 1500), {
      initialProps: { v: { title: "a" } },
    });

    rerender({ v: { title: "b" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });

    expect(save).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("error");
  });
});
