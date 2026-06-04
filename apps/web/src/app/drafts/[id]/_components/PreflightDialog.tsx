"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { PreflightResponse } from "@bytedance-aigc/shared";

import { ScorePanel } from "./ScorePanel";
import { RecommendationBadge } from "./RecommendationBadge";
import { usePreflight, usePublish } from "@/lib/use-preflight";

export function PreflightDialog({
  draftId,
  open,
  onClose,
}: {
  draftId: string;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const preflight = usePreflight(draftId);
  const publish = usePublish(draftId);
  const [phase, setPhase] = useState<"idle" | "running" | "result" | "publishing">("idle");

  useEffect(() => {
    if (open && phase === "idle") {
      setPhase("running");
      void preflight.run().then((r) => setPhase(r ? "result" : "idle"));
    }
    if (!open) setPhase("idle");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const data: PreflightResponse | null = preflight.data;
  const canPublish = data && data.recommendation !== "BLOCK";

  const onPublishClick = async () => {
    setPhase("publishing");
    const r = await publish.run();
    if (r) router.push(`/post/${r.id}`);
    else setPhase("result");
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-white dark:bg-zinc-900 rounded-lg shadow-xl p-6">
        <header className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">发布前审核</h2>
          <button type="button" onClick={onClose} className="text-zinc-500 hover:text-zinc-900">
            ✕
          </button>
        </header>
        {phase === "running" && <p className="text-sm">审核中,稍候(约 5-10 秒)...</p>}
        {preflight.error && (
          <div className="text-sm text-red-600 space-y-2">
            <p>{preflight.error}</p>
            <button
              type="button"
              onClick={() => {
                setPhase("running");
                void preflight.run().then((r) => setPhase(r ? "result" : "idle"));
              }}
              className="rounded border px-3 py-1.5 text-xs"
            >
              重试
            </button>
          </div>
        )}
        {data && phase !== "running" && (
          <>
            <div className="flex items-center gap-3 mb-3">
              <RecommendationBadge value={data.recommendation} />
              <span className="text-xs text-zinc-500">预检结果 24 小时内有效</span>
            </div>
            <ScorePanel
              safety={data.review.safety}
              quality={data.review.quality}
              onQualityDimensionClick={(key) => {
                router.push(`/drafts/${draftId}?qualityDimension=${key}`);
                onClose();
              }}
            />
            <footer className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="text-sm rounded border px-3 py-1.5"
              >
                先优化再发
              </button>
              {canPublish && (
                <button
                  type="button"
                  disabled={phase === "publishing"}
                  onClick={onPublishClick}
                  className={`text-sm rounded px-3 py-1.5 text-white ${
                    data.recommendation === "WARN" ? "bg-yellow-600" : "bg-green-600"
                  } disabled:opacity-50`}
                >
                  {phase === "publishing" ? "发布中..." : "立即发布"}
                </button>
              )}
            </footer>
            {publish.error && <p className="text-xs text-red-600 mt-2">{publish.error}</p>}
          </>
        )}
      </div>
    </div>
  );
}
