"use client";

import Link from "next/link";
import { PenLine } from "lucide-react";
import { useAuthSnapshot } from "@aigc-creator/ui/lib/use-auth-snapshot";
import { Button } from "@aigc-creator/ui/components/ui/button";

// 首页未登录引导横幅 — 告知用户可以创作，点击跳登录。
// 登录后自动消失。
export function CreatorLoginBanner() {
  const { isLoggedIn } = useAuthSnapshot();

  if (isLoggedIn) return null;

  return (
    <div className="mb-4 px-4 py-3 rounded-lg border border-border bg-muted/40 flex items-center justify-between gap-4 flex-wrap">
      <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
        <PenLine className="h-4 w-4 shrink-0" aria-hidden />
        <span>登录后即可创作文章、管理草稿与数据面板</span>
      </div>
      <Button asChild size="sm" className="h-7 text-[12px] shrink-0">
        <Link href="/login">登录创作</Link>
      </Button>
    </div>
  );
}
