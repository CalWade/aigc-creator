import { Suspense } from "react";
import type { FeedResponse } from "@bytedance-aigc/shared";
import { DEFAULT_FEED_WEIGHTS } from "@bytedance-aigc/shared";
import { serverFetchJson } from "@/lib/server-fetch";
import { FeedList } from "./_components/FeedList";
import { FeedSkeleton } from "./_components/FeedSkeleton";
import { LoadMore } from "./_components/LoadMore";
import { RankTabs } from "./_components/RankTabs";
import { SafeRewriteHintBanner } from "./_components/SafeRewriteHintBanner";
import { WeightDrawer } from "./_components/WeightDrawer";

/** ISR 30s — 页面可被 CDN 缓存 30 秒,TTFB 大幅降低 */
export const revalidate = 30;

interface PageProps {
  searchParams: Promise<{
    alpha?: string;
    beta?: string;
    gamma?: string;
  }>;
}

/** 数据获取在独立 async 组件内完成,被 Suspense 包裹后骨架先流出 */
async function FeedListWithData({ searchParams }: PageProps) {
  const sp = await searchParams;
  const alpha = sp.alpha ? Number(sp.alpha) : DEFAULT_FEED_WEIGHTS.alpha;
  const beta = sp.beta ? Number(sp.beta) : DEFAULT_FEED_WEIGHTS.beta;
  const gamma = sp.gamma ? Number(sp.gamma) : DEFAULT_FEED_WEIGHTS.gamma;
  const qs = new URLSearchParams({
    alpha: String(alpha),
    beta: String(beta),
    gamma: String(gamma),
    limit: "20",
  });
  let data: FeedResponse;
  try {
    data = await serverFetchJson<FeedResponse>(`/feed?${qs.toString()}`);
  } catch {
    return <p className="text-sm text-red-600">加载失败,请刷新重试</p>;
  }
  return (
    <>
      <FeedList data={data} />
      <LoadMore initialCursor={data.nextCursor} endpoint={`/feed?${qs.toString()}`} />
    </>
  );
}

export default async function HomePage({ searchParams }: PageProps) {
  return (
    <main className="max-w-6xl mx-auto px-4 py-6">
      <SafeRewriteHintBanner />
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold">推荐</h1>
        <WeightDrawer />
      </div>
      <RankTabs />
      <Suspense fallback={<FeedSkeleton />}>
        <FeedListWithData searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
