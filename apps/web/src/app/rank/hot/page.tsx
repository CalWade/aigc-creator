import type { FeedResponse } from "@bytedance-aigc/shared";
import { serverFetchJson } from "@/lib/server-fetch";
import { FeedList } from "../../_components/FeedList";
import { LoadMore } from "../../_components/LoadMore";
import { RankTabs } from "../../_components/RankTabs";

export const dynamic = "force-dynamic";

export default async function RankHotPage() {
  const data = await serverFetchJson<FeedResponse>(`/rank/hot?limit=20`);
  return (
    <main className="max-w-6xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-semibold mb-4">热点榜</h1>
      <RankTabs />
      <FeedList data={data} />
      <LoadMore initialCursor={data.nextCursor} endpoint="/rank/hot?limit=20" />
    </main>
  );
}
