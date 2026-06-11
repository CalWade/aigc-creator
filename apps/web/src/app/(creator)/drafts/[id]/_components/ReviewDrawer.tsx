"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PreflightResponse } from "@bytedance-aigc/shared";
import { RefreshCw, ShieldCheck } from "lucide-react";

import { ScorePanel } from "./ScorePanel";
import { RecommendationBadge } from "./RecommendationBadge";
import { usePreflight } from "@/lib/use-preflight";
import { safetyKeyToSensitiveCategory } from "@/lib/safety-key-map";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@bytedance-aigc/ui/components/ui/sheet";
import { Button } from "@bytedance-aigc/ui/components/ui/button";
import { ScrollArea } from "@bytedance-aigc/ui/components/ui/scroll-area";

/**
 * 独立「审核」侧边抽屉 — 用户主动调取，非发布拦截。
 * 复用 usePreflight / ScorePanel / RecommendationBadge；
 * 结果仅供参考，不阻止任何后续操作。
 */
export function ReviewDrawer({
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
  const [triggered, setTriggered] = useState(false);
  const [running, setRunning] = useState(false);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setTriggered(false);
      setRunning(false);
      onClose();
    }
  };

  const handleStart = async () => {
    setTriggered(true);
    setRunning(true);
    await preflight.run();
    setRunning(false);
  };

  const data: PreflightResponse | null = preflight.data;

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            内容审核
          </SheetTitle>
          <SheetDescription>
            随时为当前草稿做安全扫描与质量评分，结果仅为参考，不拦截发布。
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 -mx-6 px-6">
          {!triggered && (
            <div className="flex flex-col items-center justify-center gap-4 py-16">
              <ShieldCheck className="h-12 w-12 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                点击下方按钮，AI 将对当前全文进行安全扫描与 4 维质量评分
              </p>
              <Button onClick={() => void handleStart()} size="sm">
                <RefreshCw className="mr-2 h-4 w-4" />
                开始审核
              </Button>
            </div>
          )}

          {triggered && running && (
            <div className="flex flex-col items-center justify-center gap-4 py-16">
              <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">审核中，请稍候（约 5-10 秒）…</p>
            </div>
          )}

          {triggered && !running && preflight.error && (
            <div className="flex flex-col items-center gap-3 py-12">
              <p className="text-sm text-red-600">{preflight.error}</p>
              <Button variant="outline" size="sm" onClick={() => void handleStart()}>
                <RefreshCw className="mr-2 h-4 w-4" />
                重试
              </Button>
            </div>
          )}

          {triggered && !running && data && (
            <div className="flex flex-col gap-4 pt-2">
              <div className="flex items-center gap-2">
                <RecommendationBadge value={data.recommendation} />
                <span className="text-xs text-muted-foreground">预检结果 24 小时内有效</span>
              </div>

              <ScorePanel
                safety={data.review.safety}
                quality={data.review.quality}
                onQualityDimensionClick={(key) => {
                  router.push(`/drafts/${draftId}?qualityDimension=${key}`);
                  onClose();
                }}
                onSafeRewrite={(key) => {
                  const cat = safetyKeyToSensitiveCategory(key);
                  localStorage.setItem(
                    "safeRewriteHint",
                    JSON.stringify({ draftId, category: cat, ts: Date.now() }),
                  );
                  onClose();
                  router.push("/");
                }}
              />

              {data.review.modelMeta && (
                <p className="text-[11px] text-muted-foreground/60 border-t pt-3">
                  安全耗时 {data.review.modelMeta.latencyMsSafety}ms
                  {" · "}
                  质量耗时 {data.review.modelMeta.latencyMsQuality}ms
                  {" · "}
                  {data.review.modelMeta.truncated ? "文本已截断" : "全文检测"}
                </p>
              )}
            </div>
          )}
        </ScrollArea>

        {triggered && !running && data && (
          <div className="border-t pt-3 flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => void handleStart()}
            >
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              重新审核
            </Button>
            <Button size="sm" className="flex-1" onClick={onClose}>
              关闭
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
