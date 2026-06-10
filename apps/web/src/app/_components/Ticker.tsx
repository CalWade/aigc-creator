const NEWS = [
  "✦ 30 个 Phase 已交付",
  "▾ 安全审核准确率 0.9333",
  "✶ 首屏 LCP 1.8s",
  "◆ 双轨创作 · FAST + FINE",
  "✷ 9 张 AI 工具卡",
  "▸ 五阶段审核闭环",
  "✦ 双榜分发 透明权重",
  "▾ 30 秒离线兜底",
  "◇ 素材合规两次校验",
  "✶ Prompt 实验室上线",
];

/**
 * 顶部滚动公告条 — Times Square 报刊摊式 ticker
 */
export function Ticker() {
  // 翻倍以实现无缝循环
  const items = [...NEWS, ...NEWS];
  return (
    <div className="bg-[color:var(--ink)] text-[color:var(--cream)] overflow-hidden border-y border-[color:var(--rule)]">
      <div className="flex items-center whitespace-nowrap py-2.5 animate-ticker">
        {items.map((s, i) => (
          <span key={i} className="font-mono text-[11px] uppercase tracking-[0.28em] px-8 shrink-0">
            {s}
          </span>
        ))}
      </div>
    </div>
  );
}
