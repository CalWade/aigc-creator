"use client";

import * as React from "react";
import Link from "next/link";
import { LogOut, User as UserIcon, FileText, LayoutDashboard, LogIn } from "lucide-react";
import { apiFetch, clearToken } from "@bytedance-aigc/ui/lib/auth";
import { useAuthSnapshot } from "@bytedance-aigc/ui/lib/use-auth-snapshot";
import { Button } from "@bytedance-aigc/ui/components/ui/button";
import { Avatar, AvatarFallback } from "@bytedance-aigc/ui/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@bytedance-aigc/ui/components/ui/dropdown-menu";

export function UserMenu() {
  const { user, isLoggedIn } = useAuthSnapshot();

  if (!isLoggedIn || !user) {
    return (
      <Button asChild variant="default" size="sm" className="h-8">
        <Link href="/login" aria-label="登录">
          <LogIn className="h-3.5 w-3.5" aria-hidden />
          登录
        </Link>
      </Button>
    );
  }

  const initial = user.handle.slice(0, 1).toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 h-8 pl-1 pr-2 rounded-md hover:bg-accent transition-colors"
          aria-label="用户菜单"
        >
          <Avatar className="h-6 w-6">
            <AvatarFallback className="text-[10px] font-medium bg-primary/10 text-primary">
              {initial}
            </AvatarFallback>
          </Avatar>
          <span className="hidden md:inline text-[13px] text-foreground max-w-[100px] truncate">
            @{user.handle}
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[200px]">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="text-[13px] font-medium">@{user.handle}</span>
          <span className="text-[11px] text-muted-foreground font-normal">已登录</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/me/dashboard">
            <LayoutDashboard className="mr-2 h-4 w-4" aria-hidden />
            数据面板
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/me/works">
            <FileText className="mr-2 h-4 w-4" aria-hidden />
            我的作品
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/drafts/mine">
            <UserIcon className="mr-2 h-4 w-4" aria-hidden />
            我的草稿
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            // 后端 logout 仅写 audit log,失败也不阻塞前端清 token
            void apiFetch("/auth/logout", { method: "POST" }).catch(() => undefined);
            clearToken();
            window.location.href = "/";
          }}
          className="text-destructive focus:text-destructive"
        >
          <LogOut className="mr-2 h-4 w-4" aria-hidden />
          退出登录
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
