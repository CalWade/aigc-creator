import * as React from "react";
import { AppShell } from "@/components/shell/app-shell";
import { CommandMenu } from "@/components/command-menu";
import { Toaster } from "@/components/ui/sonner";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppShell>{children}</AppShell>
      <CommandMenu />
      <Toaster richColors closeButton position="bottom-right" />
    </>
  );
}
