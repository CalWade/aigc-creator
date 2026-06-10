"use client";

import * as React from "react";
import { Heart, Bookmark, Share2 } from "lucide-react";
import { toast } from "sonner";
import type { PostReactionsDto } from "@bytedance-aigc/shared";

import { apiFetch, getUser } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { ReportButton } from "@/components/post/ReportButton";

interface ReactionBarProps {
  postId: string;
  authorId: string;
  initial: PostReactionsDto;
  postTitle: string;
}

/**
 * 详情页底部四件套:点赞 / 收藏 / 分享 / 举报。
 * 点赞/收藏走 /post/:id/reactions/:kind,乐观切换 + 失败回滚 + 计数本地 ±1 同步;
 * 分享优先 navigator.share,否则 fallback 复制链接;举报复用 ReportButton。
 *
 * 未登录点击点赞/收藏会跳 /login(沿用 ReportButton 同款体验)。
 */
export function ReactionBar({ postId, authorId, initial, postTitle }: ReactionBarProps) {
  const [state, setState] = React.useState<PostReactionsDto>(initial);
  const [pendingLike, setPendingLike] = React.useState(false);
  const [pendingCollect, setPendingCollect] = React.useState(false);

  async function toggle(kind: "LIKE" | "COLLECT") {
    const me = getUser();
    if (!me) {
      window.location.assign("/login");
      return;
    }

    const isLike = kind === "LIKE";
    const setPending = isLike ? setPendingLike : setPendingCollect;
    const wasOn = isLike ? state.liked : state.collected;
    setPending(true);

    // 乐观更新
    const optimistic: PostReactionsDto = {
      ...state,
      liked: isLike ? !wasOn : state.liked,
      collected: !isLike ? !wasOn : state.collected,
      likeCount: isLike ? state.likeCount + (wasOn ? -1 : 1) : state.likeCount,
      collectCount: !isLike ? state.collectCount + (wasOn ? -1 : 1) : state.collectCount,
    };
    setState(optimistic);

    try {
      const res = await apiFetch(
        `/post/${encodeURIComponent(postId)}/reactions/${kind.toLowerCase()}`,
        {
          method: wasOn ? "DELETE" : "POST",
        },
      );
      if (!res.ok) {
        if (res.status === 401) {
          window.location.assign("/login");
          return;
        }
        throw new Error(`HTTP ${res.status}`);
      }
      const data = (await res.json()) as PostReactionsDto;
      setState(data);
    } catch (err) {
      // 回滚
      setState((s) => ({
        ...s,
        liked: isLike ? wasOn : s.liked,
        collected: !isLike ? wasOn : s.collected,
        likeCount: isLike ? s.likeCount + (wasOn ? 1 : -1) : s.likeCount,
        collectCount: !isLike ? s.collectCount + (wasOn ? 1 : -1) : s.collectCount,
      }));
      toast.error(
        `${isLike ? "点赞" : "收藏"}失败:${err instanceof Error ? err.message : "网络错误"}`,
      );
    } finally {
      setPending(false);
    }
  }

  async function share() {
    const url =
      typeof window !== "undefined"
        ? `${window.location.origin}/post/${postId}`
        : `/post/${postId}`;
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ title: postTitle, url });
        return;
      } catch {
        // 用户取消或浏览器拦截 → 走 fallback
      }
    }
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(url);
        toast.success("链接已复制到剪贴板");
        return;
      } catch {
        /* fall-through */
      }
    }
    toast.message(`复制此链接分享:${url}`);
  }

  return (
    <div className="mt-10 pt-6 border-t border-border flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant={state.liked ? "default" : "outline"}
        size="sm"
        onClick={() => toggle("LIKE")}
        disabled={pendingLike}
        aria-pressed={state.liked}
        aria-label="点赞"
      >
        <Heart className="h-4 w-4" fill={state.liked ? "currentColor" : "none"} aria-hidden />
        <span className="tabular-nums">{state.likeCount}</span>
      </Button>

      <Button
        type="button"
        variant={state.collected ? "default" : "outline"}
        size="sm"
        onClick={() => toggle("COLLECT")}
        disabled={pendingCollect}
        aria-pressed={state.collected}
        aria-label="收藏"
      >
        <Bookmark
          className="h-4 w-4"
          fill={state.collected ? "currentColor" : "none"}
          aria-hidden
        />
        <span className="tabular-nums">{state.collectCount}</span>
      </Button>

      <Button type="button" variant="outline" size="sm" onClick={share} aria-label="分享">
        <Share2 className="h-4 w-4" aria-hidden />
        分享
      </Button>

      <div className="ml-auto">
        <ReportButton postId={postId} authorId={authorId} />
      </div>
    </div>
  );
}
