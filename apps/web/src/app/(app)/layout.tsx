import * as React from "react";
import { AppShell } from "@/components/shell/app-shell";
import { CommandMenu } from "@/components/command-menu";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppShell>{children}</AppShell>
      <CommandMenu />
    </>
  );
}
