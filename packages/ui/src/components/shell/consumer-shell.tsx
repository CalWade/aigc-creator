"use client";

import * as React from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";
import { ConsumerTopNav, ConsumerStudioCta } from "./consumer-top-nav";
import { Kbd } from "../ui/kbd";
import { NotificationBell } from "../notification-bell";

interface ConsumerShellProps {
  children: React.ReactNode;
}

// C 段 shell — 无 sidebar,沉浸阅读。
// 顶部 = LOGO + 水平 tab(推荐/热点/爆文/抖音) + 工作台 CTA + 命令搜索 + 通知 + 主题 + UserMenu
// 与 B 段 sidebar 视觉差异最大,但所有 token / 配色 / 组件原语都共用 shadcn,设计语言一致。
export function ConsumerShell({ children }: ConsumerShellProps) {
  return (
    <div className="min-h-svh flex flex-col">
      <header className="sticky top-0 z-30 h-14 border-b border-border bg-background/85 backdrop-blur-xl">
        <div className="h-full max-w-[1200px] mx-auto px-5 flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2 group shrink-0">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground text-[12px] font-bold leading-none transition-transform group-hover:scale-105">
              AI
            </span>
            <span className="hidden sm:inline text-[14px] font-semibold tracking-tight">
              创作者平台
            </span>
          </Link>

          <ConsumerTopNav />

          <div className="flex-1" />

          <button
            type="button"
            className="hidden md:inline-flex h-8 min-w-[200px] items-center gap-2 px-2.5 rounded-md border border-border bg-muted/40 text-[13px] text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors"
            aria-label="打开命令面板"
            data-cmd-trigger
          >
            <Search className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="flex-1 text-left">搜索 / 命令</span>
            <Kbd>⌘K</Kbd>
          </button>

          <ConsumerStudioCta />
          <NotificationBell />
          <ThemeToggle />
          <div className="h-5 w-px bg-border" aria-hidden />
          <UserMenu />
        </div>
      </header>

      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}
