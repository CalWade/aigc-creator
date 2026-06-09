import type { FeedResponse } from "@bytedance-aigc/shared";
import { PostCard } from "./PostCard";

/** First row in 3-col layout = 3 cards get priority preload */
const PRIORITY_COUNT = 3;

export function FeedList({ data }: { data: FeedResponse }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {data.items.map((p, i) => (
        <PostCard key={p.id} post={p} priority={i < PRIORITY_COUNT} />
      ))}
    </div>
  );
}
