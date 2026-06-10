"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Compass,
  Flame,
  TrendingUp,
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
  Sun,
  Moon,
  Monitor,
  LogIn,
  LogOut,
  type LucideIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { useAuthSnapshot } from "@/lib/use-auth-snapshot";
import { clearToken } from "@/lib/auth";

interface CmdItem {
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
  shortcut?: string;
  keywords?: string[];
}

interface CmdGroup {
  heading: string;
  items: CmdItem[];
}

export function CommandMenu() {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();
  const { setTheme } = useTheme();
  const { isLoggedIn } = useAuthSnapshot();

  const go = React.useCallback(
    (href: string) => {
      router.push(href);
      setOpen(false);
    },
    [router],
  );

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  React.useEffect(() => {
    function onClick(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const trigger = target.closest("[data-cmd-trigger]");
      if (trigger) {
        e.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener("click", onClick);
    return () => window.removeEventListener("click", onClick);
  }, []);

  const groups: CmdGroup[] = [
    {
      heading: "导航",
      items: [
        { label: "推荐", icon: Compass, onSelect: () => go("/"), keywords: ["home", "feed"] },
        {
          label: "热点榜",
          icon: Flame,
          onSelect: () => go("/rank/hot"),
          keywords: ["hot", "rank"],
        },
        {
          label: "爆文榜",
          icon: TrendingUp,
          onSelect: () => go("/rank/best"),
          keywords: ["best", "rank"],
        },
        {
          label: "我的草稿",
          icon: PenLine,
          onSelect: () => go("/drafts/mine"),
          keywords: ["draft"],
        },
      ],
    },
    {
      heading: "工作台",
      items: [
        {
          label: "数据面板",
          icon: LayoutDashboard,
          onSelect: () => go("/me/dashboard"),
          keywords: ["dashboard", "stats"],
        },
        {
          label: "我的作品",
          icon: FileText,
          onSelect: () => go("/me/works"),
          keywords: ["works", "posts"],
        },
        {
          label: "素材库",
          icon: ImageIcon,
          onSelect: () => go("/me/assets"),
          keywords: ["assets"],
        },
        { label: "举报记录", icon: Flag, onSelect: () => go("/me/reports"), keywords: ["report"] },
      ],
    },
    {
      heading: "管理",
      items: [
        { label: "管理总览", icon: Shield, onSelect: () => go("/admin"), keywords: ["admin"] },
        { label: "举报处理", icon: ShieldAlert, onSelect: () => go("/admin/reports") },
        { label: "下线管理", icon: ShieldOff, onSelect: () => go("/admin/offline") },
        { label: "抽样审核", icon: ListChecks, onSelect: () => go("/admin/sample-audits") },
        { label: "规则重检", icon: RotateCcw, onSelect: () => go("/admin/rule-rechecks") },
        { label: "Prompt 实验", icon: Sparkles, onSelect: () => go("/admin/prompt-lab") },
      ],
    },
    {
      heading: "主题",
      items: [
        {
          label: "切换到浅色",
          icon: Sun,
          onSelect: () => {
            setTheme("light");
            setOpen(false);
          },
          keywords: ["light"],
        },
        {
          label: "切换到暗色",
          icon: Moon,
          onSelect: () => {
            setTheme("dark");
            setOpen(false);
          },
          keywords: ["dark"],
        },
        {
          label: "跟随系统",
          icon: Monitor,
          onSelect: () => {
            setTheme("system");
            setOpen(false);
          },
          keywords: ["system"],
        },
      ],
    },
    {
      heading: "账户",
      items: isLoggedIn
        ? [
            {
              label: "退出登录",
              icon: LogOut,
              onSelect: () => {
                clearToken();
                window.location.href = "/";
              },
              keywords: ["logout", "signout"],
            },
          ]
        : [
            {
              label: "登录",
              icon: LogIn,
              onSelect: () => go("/login"),
              keywords: ["login", "signin"],
            },
          ],
    },
  ];

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="命令面板"
      description="搜索页面、切换主题、管理账户"
    >
      <CommandInput placeholder="输入命令或搜索..." />
      <CommandList>
        <CommandEmpty>没有结果</CommandEmpty>
        {groups.map((group, gi) => (
          <React.Fragment key={group.heading}>
            {gi > 0 ? <CommandSeparator /> : null}
            <CommandGroup heading={group.heading}>
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <CommandItem
                    key={item.label}
                    value={`${group.heading} ${item.label} ${item.keywords?.join(" ") ?? ""}`}
                    onSelect={item.onSelect}
                  >
                    <Icon className="mr-2 h-4 w-4" aria-hidden />
                    <span>{item.label}</span>
                    {item.shortcut ? <CommandShortcut>{item.shortcut}</CommandShortcut> : null}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </React.Fragment>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
