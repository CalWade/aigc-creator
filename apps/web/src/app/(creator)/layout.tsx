import * as React from "react";
import { AppShell } from "@/components/shell/app-shell";
import { CommandMenu } from "@/components/command-menu";
import { Toaster } from "@/components/ui/sonner";

// B 段(创作者 / 工作台 / 管理)layout —— sidebar + 信息密度。
// AppShell 这个名字保留,内部已注释为 "B 段 shell";后续如要改名再统一搜替。
export default function CreatorLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppShell>{children}</AppShell>
      <CommandMenu />
      <Toaster richColors closeButton position="bottom-right" />
    </>
  );
}
