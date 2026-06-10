import { Suspense } from "react";
import type { FeedResponse } from "@bytedance-aigc/shared";
import { serverFetchJson } from "@/lib/server-fetch";
import { FeedList } from "../../_components/FeedList";
import { FeedSkeleton } from "../../_components/FeedSkeleton";
import { LoadMore } from "../../_components/LoadMore";

export const revalidate = 30;

async function HotFeedWithData() {
  let data: FeedResponse;
  try {
    data = await serverFetchJson<FeedResponse>(`/rank/hot?limit=20`);
  } catch {
    return (
      <div className="border border-[color:var(--rule)] bg-[color:var(--cream)] p-8 text-center">
        <p className="font-editorial italic text-2xl text-[color:var(--ink-2)]">
          榜单尚未送达印刷机。请刷新重试。
        </p>
      </div>
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
    <main className="max-w-[1400px] mx-auto px-6 py-12">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 mb-12 items-end">
        <div className="lg:col-span-8">
          <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-[color:var(--vermilion)] mb-3">
            § Hot Ranking · Last 24h
          </p>
          <h1 className="font-display text-[64px] md:text-[88px] leading-[0.9] font-medium tracking-tight">
            热点<span className="italic text-[color:var(--vermilion)]">榜</span>
          </h1>
        </div>
        <p className="lg:col-span-4 lg:pl-6 lg:border-l border-[color:var(--rule)] font-editorial italic text-[18px] leading-[1.55] text-[color:var(--ink-2)]">
          按时效压榜 ⸻ 哪些稿件正在被读完、被点赞、 被分享。 时间衰减 γ 极强,慢工出细活的请去
          <a href="/rank/best" className="link-rule text-[color:var(--vermilion)]">
            {" "}
            爆文榜{" "}
          </a>
          。
        </p>
      </div>
      <div className="rule-vermilion mb-10 animate-rule" />
      <Suspense fallback={<FeedSkeleton />}>
        <HotFeedWithData />
      </Suspense>
    </main>
  );
}
