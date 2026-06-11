"use client";

import { Search } from "lucide-react";
import { Breadcrumb } from "./breadcrumb";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";
import { Kbd } from "@bytedance-aigc/ui/components/ui/kbd";
import { NotificationBell } from "@bytedance-aigc/ui/components/notification-bell";

export function TopBar() {
  return (
    <header className="sticky top-0 z-30 h-14 border-b border-border bg-background/80 backdrop-blur-xl">
      <div className="h-full px-4 flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <Breadcrumb />
        </div>

        <button
          type="button"
          className="hidden md:inline-flex h-8 min-w-[220px] items-center gap-2 px-2.5 rounded-md border border-border bg-muted/40 text-[13px] text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors"
          aria-label="打开命令面板"
          data-cmd-trigger
        >
          <Search className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="flex-1 text-left">搜索 / 命令</span>
          <Kbd>⌘K</Kbd>
        </button>

        <NotificationBell />

        <ThemeToggle />

        <div className="h-5 w-px bg-border" aria-hidden />

        <UserMenu />
      </div>
    </header>
  );
}
