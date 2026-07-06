import { Suspense } from "react";
import { FeedSkeleton } from "@aigc-creator/ui/components/feed/FeedSkeleton";
import { SafeRewriteHintBanner } from "./_components/SafeRewriteHintBanner";
import { CreatorLoginBanner } from "./_components/CreatorLoginBanner";
import { WeightDrawer } from "@aigc-creator/ui/components/feed/WeightDrawer";
import { FeedSection } from "./_components/FeedSection";

/** ISR 30s — CDN 边缘缓存 */
export const revalidate = 30;

export default function HomePage() {
  return (
    <main className="max-w-[1200px] mx-auto px-5 py-5">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-[20px] font-medium text-foreground">推荐</h1>
        <WeightDrawer />
      </div>

      <SafeRewriteHintBanner />

      <CreatorLoginBanner />

      <Suspense fallback={<FeedSkeleton />}>
        <FeedSection />
      </Suspense>
    </main>
  );
}
