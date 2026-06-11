"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  PenLine,
  LayoutDashboard,
  FileText,
  Image as ImageIcon,
  Flag,
  Shield,
  ShieldAlert,
  ShieldOff,
  ListChecks,
  RotateCcw,
  Sparkles,
  ArrowLeftCircle,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@bytedance-aigc/ui/lib/utils";
import { useAuthSnapshot } from "@bytedance-aigc/ui/lib/use-auth-snapshot";
import { SidebarSection } from "./sidebar-section";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

// 创作者工作台侧边栏。仅在 (creator) 路由组下渲染。
// "发现"在 (reader) 顶部水平导航,这里不出现。"返回阅读端"是连回 (reader) 的反向入口。
// admin 用户走 (admin) 路由组,这个 sidebar 不应该被他们看到 — 但保险起见保留 role gate:
// role==="ADMIN" 时只显示"管理"组(实际上 admin 已被路由分流到 /admin/*,几乎不会出现在这个 shell 下)。
const CREATOR_GROUPS: NavGroup[] = [
  {
    title: "创作",
    items: [{ href: "/drafts/mine", label: "我的草稿", icon: PenLine }],
  },
  {
    title: "工作台",
    items: [
      { href: "/me/dashboard", label: "数据", icon: LayoutDashboard },
      { href: "/me/works", label: "作品", icon: FileText },
      { href: "/me/assets", label: "素材", icon: ImageIcon },
      { href: "/me/reports", label: "举报", icon: Flag },
    ],
  },
];

const ADMIN_GROUP: NavGroup = {
  title: "管理",
  items: [
    { href: "/admin", label: "总览", icon: Shield, exact: true },
    { href: "/admin/reports", label: "举报", icon: ShieldAlert },
    { href: "/admin/offline", label: "下线", icon: ShieldOff },
    { href: "/admin/sample-audits", label: "抽审", icon: ListChecks },
    { href: "/admin/rule-rechecks", label: "重检", icon: RotateCcw },
    { href: "/admin/prompt-lab", label: "Prompt", icon: Sparkles },
  ],
};

// admin 是平台运营角色,不是创作者:纯 admin 视图,隐藏作者侧入口。
// 若 admin 也需要发文,后台另建 author 账号(身份单一原则)。
function getGroups(role: "AUTHOR" | "ADMIN" | undefined): NavGroup[] {
  return role === "ADMIN" ? [ADMIN_GROUP] : CREATOR_GROUPS;
}

// 顶部独立分组 — 引导回阅读端,做反向闭环。
const BACK_TO_CONSUMER: NavItem = {
  href: "/",
  label: "返回阅读端",
  icon: ArrowLeftCircle,
  exact: true,
};

function isActive(pathname: string, href: string, exact?: boolean) {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SidebarNav() {
  const pathname = usePathname();
  const { user } = useAuthSnapshot();
  const groups = getGroups(user?.role);

  return (
    <nav className="flex flex-col gap-1 py-2">
      <SidebarSection title="导航">
        {(() => {
          const Icon = BACK_TO_CONSUMER.icon;
          const active = isActive(pathname, BACK_TO_CONSUMER.href, BACK_TO_CONSUMER.exact);
          return (
            <Link
              href={BACK_TO_CONSUMER.href}
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
                  active ? "text-foreground" : "text-muted-foreground group-hover:text-foreground",
                )}
                aria-hidden
              />
              <span className="truncate">{BACK_TO_CONSUMER.label}</span>
            </Link>
          );
        })()}
      </SidebarSection>
      {groups.map((group) => (
        <SidebarSection key={group.title} title={group.title}>
          {group.items.map((item) => {
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
        </SidebarSection>
      ))}
    </nav>
  );
}
