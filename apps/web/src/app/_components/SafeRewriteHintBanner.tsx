"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Hint {
  draftId: string;
  category: string;
  ts: number;
}

export function SafeRewriteHintBanner() {
  const [hint, setHint] = useState<Hint | null>(null);

  useEffect(() => {
    const raw = localStorage.getItem("safeRewriteHint");
    if (!raw) return;
    try {
      const h = JSON.parse(raw) as Hint;
      // mount 时一次性读 localStorage 把 hint 同步到 state,只跑一次,无 cascading 风险
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (Date.now() - h.ts < 30 * 60 * 1000) setHint(h);
    } catch {
      /* noop */
    }
  }, []);

  if (!hint) return null;

  const dismiss = () => {
    localStorage.removeItem("safeRewriteHint");
    setHint(null);
  };

  return (
    <div className="border border-[color:var(--vermilion)]/40 bg-[color:var(--vermilion)]/5 px-5 py-3 mb-8 flex items-center justify-between">
      <span className="font-editorial italic text-[15px] text-[color:var(--ink-2)]">
        发布前审核检测到「
        <span className="text-[color:var(--vermilion)] not-italic font-mono text-[12px] uppercase tracking-wider">
          {hint.category}
        </span>
        」类风险,可在草稿内段落使用「合规替代」工具改写。
      </span>
      <span className="flex items-center gap-3 shrink-0 ml-4">
        <Link
          href={`/drafts/${hint.draftId}`}
          className="btn-ink px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em]"
          onClick={dismiss}
        >
          回到草稿 →
        </Link>
        <button
          type="button"
          onClick={dismiss}
          className="font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--ink-3)] link-rule"
        >
          关闭
        </button>
      </span>
    </div>
  );
}
