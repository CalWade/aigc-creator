import * as React from "react";
import { SidebarNav } from "./sidebar-nav";
import { TopBar } from "./top-bar";

interface AppShellProps {
  children: React.ReactNode;
}

// B 段 shell — 创作者 / 工作台 / 管理后台共用。
// 与 ConsumerShell(C 段)共享 shadcn token 和 UI 原语,但布局上靠 sidebar + 信息密度暗示
// "干活的地方",视觉与读者侧的横向导航形成区分。
export function AppShell({ children }: AppShellProps) {
  return (
    <div className="min-h-svh grid grid-cols-1 md:grid-cols-[240px_1fr]">
      <aside className="hidden md:flex md:flex-col h-svh sticky top-0 border-r border-border bg-card/30">
        <div className="h-14 flex items-center px-4 border-b border-border">
          {/* 跨 Multi-Zones 回 consumer 首页,必须用 <a> */}
          <a href="/" className="flex items-center gap-2 group">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground text-[12px] font-bold leading-none transition-transform group-hover:scale-105">
              AI
            </span>
            <div className="flex flex-col leading-tight">
              <span className="text-[14px] font-semibold tracking-tight">创作者平台</span>
              <span className="text-[10px] text-muted-foreground/80">工作台</span>
            </div>
          </a>
        </div>
        <div className="flex-1 overflow-y-auto">
          <SidebarNav />
        </div>
        <div className="px-4 py-3 border-t border-border text-[11px] text-muted-foreground/70">
          v1.0 · {new Date().getFullYear()}
        </div>
      </aside>

      <div className="min-w-0 flex flex-col">
        <TopBar />
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
