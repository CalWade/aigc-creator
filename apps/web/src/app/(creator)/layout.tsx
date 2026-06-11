import * as React from "react";
import { AppShell } from "@/components/shell/app-shell";
import { CommandMenu } from "@/components/command-menu";
import { Toaster } from "@bytedance-aigc/ui/components/ui/sonner";

// 创作者工作台 layout —— sidebar + 信息密度。覆盖 /drafts/* 和 /me/*。
// 阅读端(/, /rank/*, /post/*)走 (reader) 路由组,管理后台走 (admin) 路由组,各自独立 shell。
export default function CreatorLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppShell>{children}</AppShell>
      <CommandMenu />
      <Toaster richColors closeButton position="bottom-right" />
    </>
  );
}
