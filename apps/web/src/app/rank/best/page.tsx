import { Suspense } from "react";
import type { FeedResponse } from "@bytedance-aigc/shared";
import { serverFetchJson } from "@/lib/server-fetch";
import { FeedList } from "../../_components/FeedList";
import { FeedSkeleton } from "../../_components/FeedSkeleton";
import { LoadMore } from "../../_components/LoadMore";
import { RankTabs } from "../../_components/RankTabs";

/** ISR 30s */
export const revalidate = 30;

async function BestFeedWithData() {
  let data: FeedResponse;
  try {
    data = await serverFetchJson<FeedResponse>(`/rank/best?limit=20`);
  } catch {
    return <p className="text-sm text-red-600">加载失败,请刷新重试</p>;
  }
  return (
    <>
      <FeedList data={data} />
      <LoadMore initialCursor={data.nextCursor} endpoint="/rank/best?limit=20" />
    </>
  );
}

export default async function RankBestPage() {
  return (
    <main className="max-w-6xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-semibold mb-4">爆文榜</h1>
      <RankTabs />
      <Suspense fallback={<FeedSkeleton />}>
        <BestFeedWithData />
      </Suspense>
    </main>
  );
}
