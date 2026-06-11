"use client";

import { useEffect, useState, useCallback } from "react";
import { Bell, X } from "lucide-react";
import { apiFetch } from "../lib/auth";
import { Button } from "./ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { ScrollArea } from "./ui/scroll-area";
import { Separator } from "./ui/separator";
import { cn } from "../lib/utils";

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  draftId: string | null;
  createdAt: string;
}

const TYPE_LABELS: Record<string, string> = {
  PUBLISH_APPROVED: "发布通过",
  PUBLISH_REJECTED: "发布驳回",
  POST_TAKEN_DOWN: "下线通知",
  HOT_RANK: "热点榜",
  MILESTONE_VIEWS: "里程碑",
};

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await apiFetch("/notifications/unread-count");
      if (res.ok) {
        const data = (await res.json()) as { count: number };
        setUnreadCount(data.count);
      }
    } catch {
      // silent
    }
  }, []);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/notifications?limit=20");
      if (res.ok) {
        const data = (await res.json()) as { items: NotificationItem[] };
        setItems(data.items);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchUnreadCount();
  }, [fetchUnreadCount]);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchList();
  }, [open, fetchList]);

  const handleMarkRead = async (id: string) => {
    try {
      const res = await apiFetch(`/notifications/${id}/read`, { method: "PATCH" });
      if (res.ok) {
        setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
        setUnreadCount((c) => Math.max(0, c - 1));
      }
    } catch {
      // silent
    }
  };

  const handleMarkAllRead = async () => {
    try {
      const res = await apiFetch("/notifications/read-all", { method: "PATCH" });
      if (res.ok) {
        setItems((prev) => prev.map((n) => ({ ...n, read: true })));
        setUnreadCount(0);
      }
    } catch {
      // silent
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-8 w-8" aria-label="通知">
          <Bell className="h-4 w-4" aria-hidden />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[16px] h-[16px] px-1 text-[10px] font-semibold leading-none text-white bg-destructive rounded-full ring-2 ring-background">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-[360px] p-0 overflow-hidden">
        <div className="flex items-center justify-between px-4 h-11">
          <h2 className="text-sm font-medium">通知</h2>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => void handleMarkAllRead()}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 h-7 rounded-md hover:bg-accent"
              >
                全部已读
              </button>
            )}
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              aria-label="关闭"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        </div>
        <Separator />
        <ScrollArea className="max-h-[420px]">
          {loading && (
            <p className="px-4 py-6 text-sm text-muted-foreground text-center">加载中…</p>
          )}
          {!loading && items.length === 0 && (
            <p className="px-4 py-8 text-sm text-muted-foreground text-center">暂无通知</p>
          )}
          {!loading &&
            items.map((n, i) => (
              <button
                key={n.id}
                type="button"
                onClick={() => {
                  if (!n.read) void handleMarkRead(n.id);
                }}
                className={cn(
                  "w-full text-left px-4 py-3 transition-colors hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:outline-none",
                  i !== items.length - 1 && "border-b border-border",
                  !n.read && "bg-accent/20",
                )}
              >
                <div className="flex items-start gap-2">
                  <span
                    className={cn(
                      "mt-1.5 w-1.5 h-1.5 rounded-full shrink-0",
                      n.read ? "bg-transparent" : "bg-primary",
                    )}
                    aria-hidden
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {TYPE_LABELS[n.type] ?? n.type}
                      </span>
                      <span className="text-[10px] text-muted-foreground/70 tabular-nums">
                        {new Date(n.createdAt).toLocaleString("zh-CN", {
                          month: "numeric",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <p className="text-sm font-medium mt-1 truncate">{n.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>
                  </div>
                </div>
              </button>
            ))}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
