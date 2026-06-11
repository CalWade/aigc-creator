import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RepublishBanner } from "./republish-banner";

describe("RepublishBanner", () => {
  it("publishedAt 存在 → 显文案 + 查看线上链接", () => {
    render(<RepublishBanner publishedAt="2026-06-08T10:00:00Z" draftId="d1" />);
    expect(screen.getByTestId("republish-banner")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /查看线上/ })).toHaveAttribute("href", "/post/d1");
  });

  it("publishedAt 为 null 不渲染", () => {
    const { container } = render(<RepublishBanner publishedAt={null} draftId="d1" />);
    expect(container.firstChild).toBeNull();
  });
});
