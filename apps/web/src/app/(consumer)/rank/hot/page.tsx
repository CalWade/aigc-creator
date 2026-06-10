import { Suspense } from "react";
import Link from "next/link";
import type { FeedResponse } from "@bytedance-aigc/shared";
import { serverFetchJson } from "@/lib/server-fetch";
import { Card } from "@/components/ui/card";
import { FeedList } from "@/components/feed/FeedList";
import { FeedSkeleton } from "@/components/feed/FeedSkeleton";
import { LoadMore } from "@/components/feed/LoadMore";
import { RankTabs } from "@/components/feed/RankTabs";

export const revalidate = 30;

async function HotFeedWithData() {
  let data: FeedResponse;
  try {
    data = await serverFetchJson<FeedResponse>(`/rank/hot?limit=20`);
  } catch {
    return (
      <Card className="p-8 text-center">
        <p className="text-[15px] text-muted-foreground">榜单加载失败,请刷新重试</p>
      </Card>
    );
  }
  return (
    <>
      <FeedList data={data} />
      <LoadMore initialCursor={data.nextCursor} endpoint="/rank/hot?limit=20" />
    </>
  );
}

export default async function RankHotPage() {
  return (
    <main className="max-w-[1200px] mx-auto px-5 py-5">
      <RankTabs />
      <div className="mb-4">
        <h1 className="text-[20px] font-medium text-foreground">热点榜</h1>
        <p className="text-[13px] text-muted-foreground mt-0.5">
          按近 24 小时阅读热度排序,慢热长稿请看{" "}
          <Link href="/rank/best" className="text-brand hover:underline">
            爆文榜
          </Link>
        </p>
      </div>
      <Suspense fallback={<FeedSkeleton />}>
        <HotFeedWithData />
      </Suspense>
    </main>
  );
}
