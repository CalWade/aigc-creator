import type { FeedResponse } from "@bytedance-aigc/shared";
import { PostCard } from "./PostCard";

export function FeedList({ data }: { data: FeedResponse }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {data.items.map((p) => (
        <PostCard key={p.id} post={p} />
      ))}
    </div>
  );
}
