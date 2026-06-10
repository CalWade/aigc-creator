/**
 * 首屏骨架屏 — 与首页 LeadStory + EditorialCard 网格视觉对齐
 */
export function FeedSkeleton() {
  return (
    <div>
      {/* 头条 + 副条骨架 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-12">
        <div className="lg:col-span-8 animate-pulse">
          <div className="aspect-[16/10] bg-[color:var(--paper-2)] mb-5 border border-[color:var(--rule)]/30" />
          <div className="h-3 w-32 bg-[color:var(--paper-2)] mb-3" />
          <div className="h-12 w-3/4 bg-[color:var(--paper-2)] mb-3" />
          <div className="h-4 w-2/3 bg-[color:var(--paper-2)]" />
        </div>
        <aside className="lg:col-span-4 space-y-6 animate-pulse">
          {[0, 1, 2].map((i) => (
            <div key={i} className="border-b border-[color:var(--rule)]/20 pb-4">
              <div className="h-3 w-24 bg-[color:var(--paper-2)] mb-2" />
              <div className="h-5 w-full bg-[color:var(--paper-2)] mb-2" />
              <div className="h-3 w-2/3 bg-[color:var(--paper-2)]" />
            </div>
          ))}
        </aside>
      </div>

      {/* 余下卡片网格 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-12">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="animate-pulse">
            <div className="aspect-[4/3] bg-[color:var(--paper-2)] mb-4 border border-[color:var(--rule)]/30" />
            <div className="h-3 w-24 bg-[color:var(--paper-2)] mb-2" />
            <div className="h-6 w-3/4 bg-[color:var(--paper-2)] mb-2" />
            <div className="h-3 w-1/2 bg-[color:var(--paper-2)]" />
          </div>
        ))}
      </div>
    </div>
  );
}
