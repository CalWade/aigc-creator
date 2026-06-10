"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface NavTab {
  href: string;
  label: string;
  exact?: boolean;
}

// C 段顶部导航 — 沉浸阅读取向,只列消费场景的入口。
// 工作台 / 草稿 / 管理后台都不在这里出现,需要通过右上角「进入工作台」CTA 跳过去。
const TABS: NavTab[] = [
  { href: "/", label: "推荐", exact: true },
  { href: "/rank/hot", label: "热点榜" },
  { href: "/rank/best", label: "爆文榜" },
  { href: "/rank/external/douyin", label: "抖音热榜" },
];

function isActive(pathname: string, href: string, exact?: boolean) {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function ConsumerTopNav() {
  const pathname = usePathname();
  return (
    <nav className="hidden md:flex items-center gap-1 h-10 px-1 -mb-px">
      {TABS.map((tab) => {
        const active = isActive(pathname, tab.href, tab.exact);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "h-9 px-3 inline-flex items-center text-[13px] rounded-md transition-colors",
              active
                ? "text-foreground font-medium bg-accent"
                : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function ConsumerStudioCta() {
  // 「进入工作台」CTA — 把 C 段引向 B 段的最关键动线。
  // 链接落在 /drafts/mine,因为草稿列表是创作者的事实首页(看草稿 / 新建草稿)。
  return (
    <Button asChild variant="outline" size="sm" className="h-8 gap-1.5">
      <Link href="/drafts/mine" aria-label="进入工作台">
        <LayoutDashboard className="h-3.5 w-3.5" aria-hidden />
        <span className="hidden sm:inline">进入工作台</span>
      </Link>
    </Button>
  );
}
