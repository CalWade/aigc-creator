import { Card, CardContent } from "../ui/card";
import { Skeleton } from "../ui/skeleton";

/**
 * 信息流骨架屏 — 与 PostCard shadcn Card 对齐
 */
export function FeedSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: 9 }).map((_, i) => (
        <Card key={i} className="overflow-hidden py-0 gap-0">
          <Skeleton className="aspect-[16/10] rounded-none" />
          <CardContent className="p-4 space-y-2.5">
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-3/5" />
            <Skeleton className="h-3 w-full mt-3" />
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-3 w-1/2 mt-2" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
