import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

import { ReportDialog } from "./ReportDialog";

const fetchMock = vi.fn();

vi.mock("@/lib/auth", () => ({
  apiFetch: (path: string, init?: RequestInit) => fetchMock(path, init),
}));

beforeEach(() => {
  fetchMock.mockReset();
});

describe("ReportDialog", () => {
  it("渲染 8 个 category radio + 提交时调 POST /posts/:id/reports", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ reportId: "rpt-1" }),
    });
    const onClose = vi.fn();

    render(<ReportDialog postId="post-abc" open={true} onClose={onClose} />);

    expect(screen.getByText("涉政")).toBeInTheDocument();
    expect(screen.getByText("涉黄")).toBeInTheDocument();
    expect(screen.getByText("涉赌")).toBeInTheDocument();
    expect(screen.getByText("涉毒")).toBeInTheDocument();
    expect(screen.getByText("低俗")).toBeInTheDocument();
    expect(screen.getByText("欺诈")).toBeInTheDocument();
    expect(screen.getByText("医疗误导")).toBeInTheDocument();
    expect(screen.getByText("其他")).toBeInTheDocument();

    const textarea = screen.getByPlaceholderText(/低俗描写/);
    fireEvent.change(textarea, { target: { value: "用词低俗" } });

    await act(async () => {
      fireEvent.click(screen.getByText("提交"));
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(path).toBe("/posts/post-abc/reports");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string) as { category: string; reason: string };
    expect(body.category).toBe("VULGARITY");
    expect(body.reason).toBe("用词低俗");
  });

  it("409 REPORT_DUPLICATE → 显示「您已举报过该稿件」", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({ code: "REPORT_DUPLICATE", message: "已举报" }),
    });

    render(<ReportDialog postId="post-abc" open={true} onClose={() => {}} />);

    await act(async () => {
      fireEvent.click(screen.getByText("提交"));
    });

    expect(screen.getByText("您已举报过该稿件")).toBeInTheDocument();
  });
});
