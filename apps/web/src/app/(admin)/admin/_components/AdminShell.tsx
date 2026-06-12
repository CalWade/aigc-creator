"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  ShieldAlert,
  ShieldOff,
  ListChecks,
  RotateCcw,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@bytedance-aigc/ui/lib/utils";
import { useAuthSnapshot } from "@bytedance-aigc/ui/lib/use-auth-snapshot";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { UserMenu } from "@/components/shell/user-menu";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/admin", label: "总览", icon: LayoutDashboard, exact: true },
  { href: "/admin/reports", label: "举报工作台", icon: ShieldAlert },
  { href: "/admin/offline", label: "直接下线", icon: ShieldOff },
  { href: "/admin/sample-audits", label: "抽样巡检", icon: ListChecks },
  { href: "/admin/rule-rechecks", label: "规则复审", icon: RotateCcw },
  { href: "/admin/prompt-lab", label: "Prompt 实验室", icon: Sparkles },
];

function isActive(pathname: string, href: string, exact?: boolean) {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, hasToken } = useAuthSnapshot();
  const role = user?.role;
  const isAdmin = role === "ADMIN";
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    if (hasToken && !user) return;
    if (!isAdmin) {
      window.location.replace("/me/dashboard");
    }
  }, [mounted, hasToken, user, isAdmin]);

  if (!mounted || !isAdmin) {
    return (
      <div className="flex min-h-svh items-center justify-center text-sm text-muted-foreground">
        正在校验权限...
      </div>
    );
  }

  return (
    <div className="min-h-svh grid grid-cols-1 md:grid-cols-[240px_1fr]">
      <aside className="hidden md:flex md:flex-col h-svh sticky top-0 border-r border-border bg-card/30">
        <div className="h-14 flex items-center px-4 border-b border-border">
          <Link href="/admin" className="flex items-center gap-2 group">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-destructive text-destructive-foreground text-[12px] font-bold leading-none transition-transform group-hover:scale-105">
              AD
            </span>
            <div className="flex flex-col leading-tight">
              <span className="text-[14px] font-semibold tracking-tight">管理后台</span>
              <span className="text-[10px] text-muted-foreground/80">Admin Panel</span>
            </div>
          </Link>
        </div>
        <nav className="flex-1 overflow-y-auto py-2">
          <div className="px-3 mb-1">
            <span className="text-[11px] font-medium text-muted-foreground/60 uppercase tracking-wider">
              运营管理
            </span>
          </div>
          <div className="flex flex-col gap-0.5 px-2">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = isActive(pathname, item.href, item.exact);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group flex items-center gap-2.5 h-8 px-2.5 rounded-lg text-[13px] transition-all",
                    "active:scale-[0.98]",
                    active
                      ? "bg-accent text-accent-foreground font-medium"
                      : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                  )}
                >
                  <Icon
                    className={cn(
                      "h-4 w-4 shrink-0 transition-colors",
                      active
                        ? "text-foreground"
                        : "text-muted-foreground group-hover:text-foreground",
                    )}
                    aria-hidden
                  />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
        <div className="px-4 py-2 border-t border-border">
          <Link
            href="/"
            className="flex items-center gap-2 text-[12px] text-muted-foreground hover:text-foreground transition-colors"
          >
            <span>← 返回创作者平台</span>
          </Link>
        </div>
        <div className="px-4 py-3 border-t border-border text-[11px] text-muted-foreground/70">
          v1.0 · Admin
        </div>
      </aside>

      <div className="min-w-0 flex flex-col">
        <header className="sticky top-0 z-30 h-14 border-b border-border bg-background/80 backdrop-blur-xl">
          <div className="h-full px-4 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <AdminBreadcrumb pathname={pathname} />
            </div>
            <ThemeToggle />
            <div className="h-5 w-px bg-border" aria-hidden />
            <UserMenu />
          </div>
        </header>
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}

function AdminBreadcrumb({ pathname }: { pathname: string }) {
  const current = NAV_ITEMS.find((item) => isActive(pathname, item.href, item.exact));
  if (!current) return null;

  const parts = [{ label: "管理后台", href: "/admin" }];
  if (!current.exact) {
    parts.push({ label: current.label, href: current.href });
  }

  return (
    <nav className="flex items-center gap-1.5 text-sm">
      {parts.map((part, i) => (
        <span key={part.href} className="flex items-center gap-1.5">
          {i > 0 && <span className="text-muted-foreground/40">/</span>}
          <Link
            href={part.href}
            className={cn(
              "transition-colors",
              i === parts.length - 1
                ? "text-foreground font-medium"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {part.label}
          </Link>
        </span>
      ))}
    </nav>
  );
}
