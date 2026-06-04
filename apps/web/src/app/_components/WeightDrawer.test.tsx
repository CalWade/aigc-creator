import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { WeightDrawer } from "./WeightDrawer";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}));

const KEY = "phase24:feed-weights";

describe("WeightDrawer", () => {
  beforeEach(() => {
    localStorage.clear();
    replace.mockClear();
  });

  it("打开抽屉显示三个滑块", () => {
    render(<WeightDrawer />);
    fireEvent.click(screen.getByText("权重设置"));
    expect(screen.getByText(/alpha/)).toBeInTheDocument();
    expect(screen.getByText(/beta/)).toBeInTheDocument();
    expect(screen.getByText(/gamma/)).toBeInTheDocument();
  });

  it("点击 应用 写入 localStorage 并 replace router", () => {
    render(<WeightDrawer />);
    fireEvent.click(screen.getByText("权重设置"));
    act(() => {
      fireEvent.click(screen.getByText("应用"));
    });
    const stored = localStorage.getItem(KEY);
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored!) as { alpha: number; beta: number; gamma: number };
    expect(parsed.alpha).toBeCloseTo(0.5);
    expect(parsed.beta).toBeCloseTo(0.3);
    expect(parsed.gamma).toBeCloseTo(0.2);
    expect(replace).toHaveBeenCalledWith(expect.stringMatching(/alpha=0\.5/));
  });

  it("初始化从 localStorage 读取", () => {
    localStorage.setItem(KEY, JSON.stringify({ alpha: 0.7, beta: 0.2, gamma: 0.1 }));
    render(<WeightDrawer />);
    fireEvent.click(screen.getByText("权重设置"));
    expect(screen.getByText(/alpha \(0\.70\)/)).toBeInTheDocument();
  });

  it("恢复默认 重置为 0.5/0.3/0.2", () => {
    localStorage.setItem(KEY, JSON.stringify({ alpha: 0.9, beta: 0.05, gamma: 0.05 }));
    render(<WeightDrawer />);
    fireEvent.click(screen.getByText("权重设置"));
    act(() => {
      fireEvent.click(screen.getByText("恢复默认"));
    });
    const parsed = JSON.parse(localStorage.getItem(KEY)!) as { alpha: number };
    expect(parsed.alpha).toBeCloseTo(0.5);
  });
});
