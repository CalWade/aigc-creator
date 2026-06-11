import * as React from "react";
import { ConsumerShell } from "@bytedance-aigc/ui/components/shell/consumer-shell";
import { CommandMenu } from "@/components/command-menu";
import { Toaster } from "@bytedance-aigc/ui/components/ui/sonner";

// 读者侧 layout —— 顶部水平导航 + 沉浸阅读。覆盖首页、榜单、文章详情。
// 与 (creator) 工作台共享 shadcn token 与 CommandMenu,差异点是 shell 版式。
export default function ReaderLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ConsumerShell>{children}</ConsumerShell>
      <CommandMenu />
      <Toaster richColors closeButton position="bottom-right" />
    </>
  );
}
