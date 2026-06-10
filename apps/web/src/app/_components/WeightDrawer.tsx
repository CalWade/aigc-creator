"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_FEED_WEIGHTS, type FeedWeights } from "@bytedance-aigc/shared";

const KEY = "phase24:feed-weights";

const META: Record<keyof FeedWeights, { label: string; en: string; hint: string }> = {
  alpha: { label: "质量", en: "Quality", hint: "α · 四维质量分占比" },
  beta: { label: "热度", en: "Hotness", hint: "β · 实时阅读热度占比" },
  gamma: { label: "新鲜度", en: "Recency", hint: "γ · 时间衰减占比" },
};

function readInitialWeights(): FeedWeights {
  if (typeof window === "undefined") return DEFAULT_FEED_WEIGHTS;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as FeedWeights;
  } catch {
    /* noop */
  }
  return DEFAULT_FEED_WEIGHTS;
}

export function WeightDrawer() {
  const [open, setOpen] = useState(false);
  const [w, setW] = useState<FeedWeights>(readInitialWeights);
  const router = useRouter();

  function commit(next: FeedWeights) {
    localStorage.setItem(KEY, JSON.stringify(next));
    setW(next);
    const sp = new URLSearchParams();
    sp.set("alpha", String(next.alpha));
    sp.set("beta", String(next.beta));
    sp.set("gamma", String(next.gamma));
    router.replace(`?${sp.toString()}`);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="font-mono text-[11px] uppercase tracking-[0.22em] link-rule"
      >
        ⚙ 排序权重
      </button>
      {open && (
        <div
          className="fixed inset-0 bg-[color:var(--ink)]/40 backdrop-blur-sm z-50 animate-rise"
          onClick={() => setOpen(false)}
        >
          <div
            className="absolute right-0 top-0 bottom-0 w-[380px] bg-[color:var(--paper)] shadow-2xl border-l border-[color:var(--rule)] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-7 pt-7 pb-5 border-b border-[color:var(--rule)]">
              <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-[color:var(--vermilion)] mb-2">
                § Editorial Console
              </p>
              <h3 className="font-display text-[34px] leading-tight font-medium">
                排序<span className="italic">权重</span>
              </h3>
              <p className="font-editorial italic text-[14px] text-[color:var(--ink-3)] mt-2">
                公式: score = α · quality + β · hotness + γ · recency
              </p>
            </div>

            <div className="flex-1 overflow-auto px-7 py-6 space-y-6">
              {(Object.keys(META) as Array<keyof FeedWeights>).map((k) => (
                <div key={k}>
                  <div className="flex items-baseline justify-between mb-2">
                    <div>
                      <span className="font-display text-[22px] font-medium">{META[k].label}</span>
                      <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[color:var(--ink-3)]">
                        {META[k].en}
                      </span>
                    </div>
                    <span className="font-display text-[22px] italic text-[color:var(--vermilion)]">
                      {w[k].toFixed(2)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={w[k]}
                    onChange={(e) => setW({ ...w, [k]: parseFloat(e.target.value) })}
                    className="w-full accent-[color:var(--vermilion)]"
                  />
                  <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--ink-mute)] mt-1.5">
                    {META[k].hint}
                  </p>
                </div>
              ))}
            </div>

            <div className="px-7 py-5 border-t border-[color:var(--rule)] flex items-center gap-3">
              <button
                onClick={() => commit(w)}
                className="btn-ink flex-1 px-5 py-3 font-mono text-[11px] uppercase tracking-[0.22em]"
              >
                付印 · Apply
              </button>
              <button
                onClick={() => commit(DEFAULT_FEED_WEIGHTS)}
                className="font-mono text-[10px] uppercase tracking-[0.2em] text-[color:var(--ink-3)] link-rule"
              >
                恢复默认
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
