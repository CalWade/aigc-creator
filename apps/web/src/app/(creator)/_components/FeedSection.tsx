"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { FeedResponse } from "@aigc-creator/shared";
import { DEFAULT_FEED_WEIGHTS } from "@aigc-creator/shared";
import { Card } from "@aigc-creator/ui/components/ui/card";
import { FeedList } from "@aigc-creator/ui/components/feed/FeedList";
import { FeedSkeleton } from "@aigc-creator/ui/components/feed/FeedSkeleton";
import { LoadMore } from "@aigc-creator/ui/components/feed/LoadMore";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export function FeedSection() {
  const searchParams = useSearchParams();
  const [data, setData] = useState<FeedResponse | null>(null);
  const [error, setError] = useState(false);

  const alpha = Number(searchParams.get("alpha")) || DEFAULT_FEED_WEIGHTS.alpha;
  const beta = Number(searchParams.get("beta")) || DEFAULT_FEED_WEIGHTS.beta;
  const gamma = Number(searchParams.get("gamma")) || DEFAULT_FEED_WEIGHTS.gamma;

  const qs = new URLSearchParams({
    alpha: String(alpha),
    beta: String(beta),
    gamma: String(gamma),
    limit: "20",
  });

  useEffect(() => {
    let cancelled = false;
    setError(false);
    setData(null);

    fetch(`${API_BASE}/feed?${qs.toString()}`)
      .then((res) => {
        if (!res.ok) throw new Error(res.statusText);
        return res.json() as Promise<FeedResponse>;
      })
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });

    return () => {
      cancelled = true;
    };
    // qs 是 URLSearchParams 对象，每次 render 可能是新引用
    // 用 toString() 的值做依赖避免无限循环
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qs.toString()]);

  if (error) {
    return (
      <Card className="p-8 text-center">
        <p className="text-[15px] text-muted-foreground">加载失败,请刷新重试</p>
        <p className="text-[12px] text-muted-foreground/70 mt-1">
          请确认 API 服务已在 :4000 端口启动
        </p>
      </Card>
    );
  }

  if (!data) {
    return <FeedSkeleton />;
  }

  if (data.items.length === 0) {
    return <p className="text-center py-16 text-[14px] text-muted-foreground">暂无文章</p>;
  }

  return (
    <>
      <FeedList data={data} />
      <LoadMore initialCursor={data.nextCursor} endpoint={`/feed?${qs.toString()}`} />
    </>
  );
}
