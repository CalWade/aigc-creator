import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { NotificationBell } from "./notification-bell";

// Mock apiFetch
const mockFetch = vi.fn();
vi.mock("@/lib/auth", () => ({
  apiFetch: (...args: unknown[]) => mockFetch(...args),
}));

const SAMPLE_NOTIFICATIONS = {
  items: [
    {
      id: "n1",
      type: "PUBLISH_APPROVED",
      title: "作品已发布",
      body: "《标题》已成功发布",
      read: false,
      draftId: "d1",
      createdAt: "2026-06-10T10:00:00.000Z",
    },
    {
      id: "n2",
      type: "HOT_RANK",
      title: "登上热点榜",
      body: "《标题》登上了热点榜",
      read: true,
      draftId: "d1",
      createdAt: "2026-06-09T10:00:00.000Z",
    },
  ],
};

describe("NotificationBell", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    // Default: unread count = 1
    mockFetch.mockImplementation((path: string) => {
      if (path.includes("/unread-count")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ count: 1 }) });
      }
      if (path.includes("/notifications")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(SAMPLE_NOTIFICATIONS) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
  });

  it("renders bell button", () => {
    render(<NotificationBell />);
    expect(screen.getByLabelText("通知")).toBeInTheDocument();
  });

  it("shows unread badge when unreadCount > 0", async () => {
    render(<NotificationBell />);
    await waitFor(() => {
      // Badge with count "1"
      expect(screen.getByText("1")).toBeInTheDocument();
    });
  });

  it("opens drawer on bell click and shows notifications", async () => {
    render(<NotificationBell />);

    fireEvent.click(screen.getByLabelText("通知"));

    await waitFor(() => {
      expect(screen.getByText("作品已发布")).toBeInTheDocument();
      expect(screen.getByText("登上热点榜")).toBeInTheDocument();
    });
  });

  it("shows '全部已读' button when there are unread items", async () => {
    render(<NotificationBell />);

    fireEvent.click(screen.getByLabelText("通知"));

    await waitFor(() => {
      expect(screen.getByText("全部已读")).toBeInTheDocument();
    });
  });

  it("marks all as read when '全部已读' is clicked", async () => {
    mockFetch.mockImplementation((path: string, options?: { method?: string }) => {
      if (path.includes("/read-all") && options?.method === "PATCH") {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ count: 2 }) });
      }
      if (path.includes("/unread-count")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ count: 2 }) });
      }
      if (path.includes("/notifications")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(SAMPLE_NOTIFICATIONS) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    render(<NotificationBell />);
    fireEvent.click(screen.getByLabelText("通知"));

    await waitFor(() => {
      expect(screen.getByText("全部已读")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("全部已读"));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/notifications/read-all",
        expect.objectContaining({ method: "PATCH" }),
      );
    });
  });

  it("shows '暂无通知' when list is empty", async () => {
    mockFetch.mockImplementation((path: string) => {
      if (path.includes("/unread-count")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ count: 0 }) });
      }
      if (path.includes("/notifications")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [] }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    render(<NotificationBell />);
    fireEvent.click(screen.getByLabelText("通知"));

    await waitFor(() => {
      expect(screen.getByText("暂无通知")).toBeInTheDocument();
    });
  });

  it("displays notification type label", async () => {
    render(<NotificationBell />);
    fireEvent.click(screen.getByLabelText("通知"));

    await waitFor(() => {
      // Type label "发布通过" appears in the badge
      expect(screen.getAllByText("发布通过").length).toBeGreaterThanOrEqual(1);
    });
  });
});
