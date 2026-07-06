"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PreflightResponse, SafetyKey } from "@aigc-creator/shared";
import { RefreshCw, ShieldCheck, Zap } from "lucide-react";

import { usePreflight, usePublish } from "@/lib/use-preflight";
import { safetyKeyToSensitiveCategory } from "@/lib/safety-key-map";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@aigc-creator/ui/components/ui/dialog";
import { Button } from "@aigc-creator/ui/components/ui/button";
import { RecommendationBadge } from "./RecommendationBadge";
import {
  SAFETY_LABEL,
  QUALITY_LABEL,
  SafetyDimRow,
  QualityDimRow,
  ScoreRing,
} from "./ReviewResultPanel";

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
  const [publishing, setPublishing] = useState(false);
  const [triggered, setTriggered] = useState(false);

  if (open && !triggered) {
    setTriggered(true);
    void preflight.run();
  }
  if (!open && triggered) {
    setTriggered(false);
  }

  const data: PreflightResponse | null = preflight.data;
  const canPublish = data != null;

  const onPublishClick = async () => {
    setPublishing(true);
    const r = await publish.run();
    if (r) router.push(`/post/${r.id}`);
    else setPublishing(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="sm:max-w-2xl p-0 gap-0 flex flex-col max-h-[85vh]">
        {/* ── Header ── */}
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle className="flex items-center gap-2.5 text-base">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand/10">
              <ShieldCheck className="h-4 w-4 text-brand" />
            </div>
            发布前审核
          </DialogTitle>
          <DialogDescription className="sr-only">
            发布前对内容进行安全 + 质量审核，推荐结果 24 小时内有效。
          </DialogDescription>
        </DialogHeader>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto">
          {/* 加载中 */}
          {preflight.loading && (
            <div className="flex flex-col items-center justify-center gap-4 py-20 px-6">
              <div className="relative h-12 w-12">
                <div className="absolute inset-0 rounded-full border-2 border-muted" />
                <div className="absolute inset-0 rounded-full border-2 border-brand border-t-transparent animate-spin" />
              </div>
              <p className="text-sm text-muted-foreground">审核中，请稍候（约 5-10 秒）…</p>
            </div>
          )}

          {/* 错误 */}
          {triggered && !preflight.loading && preflight.error && (
            <div className="flex flex-col items-center gap-4 py-16 px-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
                <span className="text-lg">!</span>
              </div>
              <p className="text-sm text-destructive">{preflight.error}</p>
              <Button variant="outline" size="sm" onClick={() => void preflight.run()}>
                <RefreshCw className="mr-2 h-3.5 w-3.5" />
                重试
              </Button>
            </div>
          )}

          {/* 结果 */}
          {data && !preflight.loading && (
            <div className="flex flex-col">
              {/* 推荐结果横幅 */}
              <div className="px-5 py-3 border-b border-border flex items-center gap-3">
                <RecommendationBadge value={data.recommendation} />
                <span className="text-[11px] text-muted-foreground">预检结果 24h 内有效</span>
              </div>

              {/* 总分环形图 */}
              <div className="px-5 py-5 border-b border-border">
                <div className="flex items-center justify-center gap-12">
                  <ScoreRing value={data.review.safety.overall} label="安全分" size={72} />
                  <ScoreRing value={data.review.quality.overall} label="质量分" size={72} />
                </div>
              </div>

              {/* 安全维度 */}
              <div className="px-5 py-4 border-b border-border">
                <h4 className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  安全扫描
                </h4>
                <div className="flex flex-col gap-2">
                  {data.review.safety.dimensions.map((d) => (
                    <SafetyDimRow
                      key={d.key}
                      label={SAFETY_LABEL[d.key] ?? d.key}
                      score={d.score}
                      severity={d.severity}
                      onSafeRewrite={
                        d.severity === "medium"
                          ? () => {
                              const cat = safetyKeyToSensitiveCategory(d.key as SafetyKey);
                              localStorage.setItem(
                                "safeRewriteHint",
                                JSON.stringify({ draftId, category: cat, ts: Date.now() }),
                              );
                              onClose();
                              router.push("/");
                            }
                          : undefined
                      }
                    />
                  ))}
                </div>
                {data.review.safety.note && (
                  <p className="text-xs text-destructive mt-2">{data.review.safety.note}</p>
                )}
              </div>

              {/* 质量维度 */}
              <div className="px-5 py-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider">
                    质量评分
                  </h4>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {data.review.quality.dimensions.map((d) => (
                    <QualityDimRow
                      key={d.key}
                      label={QUALITY_LABEL[d.key] ?? d.key}
                      score={d.score}
                      onClick={() => {
                        router.push(`/drafts/${draftId}?qualityDimension=${d.key}`);
                        onClose();
                      }}
                    />
                  ))}
                </div>
                {data.review.quality.note && (
                  <p className="text-xs text-destructive mt-2">{data.review.quality.note}</p>
                )}
              </div>

              {/* 耗时信息 */}
              {data.review.modelMeta && (
                <div className="px-5 pb-4">
                  <p className="text-[10px] text-muted-foreground/50">
                    安全 {data.review.modelMeta.latencyMsSafety}ms · 质量{" "}
                    {data.review.modelMeta.latencyMsQuality}ms ·{" "}
                    {data.review.modelMeta.truncated ? "已截断" : "全文检测"}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        {data && !preflight.loading && (
          <DialogFooter className="border-t border-border px-5 py-3 flex-row gap-2 sm:justify-start">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              先优化再发
            </Button>
            {canPublish && (
              <Button
                type="button"
                disabled={publishing}
                onClick={onPublishClick}
                className={`flex-1 gap-1.5 text-white ${
                  data.recommendation === "BLOCK"
                    ? "bg-red-600 hover:bg-red-600/90"
                    : data.recommendation === "WARN"
                      ? "bg-amber-600 hover:bg-amber-600/90"
                      : "bg-emerald-600 hover:bg-emerald-600/90"
                }`}
              >
                <Zap className="h-3.5 w-3.5" />
                {publishing ? "发布中..." : "立即发布"}
              </Button>
            )}
          </DialogFooter>
        )}

        {publish.error && (
          <div className="px-5 pb-3">
            <p className="text-xs text-destructive">{publish.error}</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
