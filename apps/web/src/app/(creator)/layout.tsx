import * as React from "react";
import dynamic from "next/dynamic";
import { AppShell } from "@/components/shell/app-shell";

// CommandMenu 和 Toaster 不是首屏关键元素，动态导入减少首屏 JS 体积。
// 注意: next/dynamic 在 Server Component 中不支持 ssr: false，
// 但这些组件本身已经是 "use client"，dynamic import 仍会进行代码分割。
const CommandMenu = dynamic(() =>
  import("@/components/command-menu").then((m) => ({ default: m.CommandMenu })),
);

const Toaster = dynamic(() =>
  import("@aigc-creator/ui/components/ui/sonner").then((m) => ({ default: m.Toaster })),
);

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
