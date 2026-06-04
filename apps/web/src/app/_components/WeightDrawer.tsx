"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_FEED_WEIGHTS, type FeedWeights } from "@bytedance-aigc/shared";

const KEY = "phase24:feed-weights";

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
      <button onClick={() => setOpen(true)} className="text-sm underline">
        权重设置
      </button>
      {open && (
        <div className="fixed inset-0 bg-black/30 z-50" onClick={() => setOpen(false)}>
          <div
            className="absolute right-0 top-0 bottom-0 w-80 bg-white p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-medium mb-3">排序权重</h3>
            {(["alpha", "beta", "gamma"] as const).map((k) => (
              <label key={k} className="block mb-3 text-sm">
                {k} ({w[k].toFixed(2)})
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={w[k]}
                  onChange={(e) => setW({ ...w, [k]: parseFloat(e.target.value) })}
                  className="w-full"
                />
              </label>
            ))}
            <button
              onClick={() => commit(w)}
              className="bg-black text-white px-4 py-2 rounded text-sm"
            >
              应用
            </button>
            <button onClick={() => commit(DEFAULT_FEED_WEIGHTS)} className="ml-2 text-sm underline">
              恢复默认
            </button>
          </div>
        </div>
      )}
    </>
  );
}
