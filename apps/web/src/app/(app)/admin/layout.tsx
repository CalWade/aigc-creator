"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/admin", label: "总览" },
  { href: "/admin/reports", label: "举报" },
  { href: "/admin/offline", label: "下线" },
  { href: "/admin/sample-audits", label: "抽审" },
  { href: "/admin/rule-rechecks", label: "重检" },
  { href: "/admin/prompt-lab", label: "Prompt" },
] as const;

function isActive(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname.startsWith(href);
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col gap-0">
      <nav
        className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60"
        aria-label="管理后台导航"
      >
        <ul className="flex items-center gap-1 overflow-x-auto px-6">
          {NAV_ITEMS.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  "relative inline-flex items-center px-3 py-2.5 text-sm font-medium transition-colors hover:text-foreground",
                  isActive(pathname, item.href)
                    ? "text-foreground border-b-2 border-foreground"
                    : "text-muted-foreground",
                )}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <div>{children}</div>
    </div>
  );
}
