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

  // ---- Phase 2.2 Task 9: streaming 协调 ----

  it("setStreaming(true) 期间 value 变化不触发 save 也不进入 dirty", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook(({ v }) => useAutosave(v, save, 1500), {
      initialProps: { v: { title: "a" } },
    });

    act(() => {
      result.current.setStreaming(true);
    });

    rerender({ v: { title: "b" } });
    rerender({ v: { title: "c" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(save).not.toHaveBeenCalled();
    // streaming 中状态保持非 dirty(初始 idle 或仍 saved)
    expect(result.current.status).not.toBe("dirty");
  });

  it("setStreaming(false) 后再变 value 恢复正常防抖", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook(({ v }) => useAutosave(v, save, 1500), {
      initialProps: { v: { title: "a" } },
    });

    act(() => result.current.setStreaming(true));
    rerender({ v: { title: "b" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(save).not.toHaveBeenCalled();

    act(() => result.current.setStreaming(false));
    rerender({ v: { title: "c" } });
    expect(result.current.status).toBe("dirty");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ title: "c" });
  });

  it("flush() 立即 save 最新值,无视当前 status,promise 在 settle 时 settle", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook(({ v }) => useAutosave(v, save, 1500), {
      initialProps: { v: { title: "a" } },
    });

    act(() => result.current.setStreaming(true));
    rerender({ v: { title: "stream-tail" } });

    await act(async () => {
      await result.current.flush();
    });

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ title: "stream-tail" });
    expect(result.current.status).toBe("saved");
    expect(result.current.lastSavedAt).not.toBeNull();
  });

  it("flush() 取消正在等待的防抖,只触发一次 save", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook(({ v }) => useAutosave(v, save, 1500), {
      initialProps: { v: { title: "a" } },
    });

    rerender({ v: { title: "b" } });
    expect(result.current.status).toBe("dirty");

    await act(async () => {
      await result.current.flush();
    });
    // 再让本应触发的防抖 timer 跑完,确认不再有第二次 save
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ title: "b" });
  });
});
