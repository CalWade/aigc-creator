"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PreflightResponse } from "@bytedance-aigc/shared";

import { ScorePanel } from "./ScorePanel";
import { RecommendationBadge } from "./RecommendationBadge";
import { usePreflight, usePublish } from "@/lib/use-preflight";
import { safetyKeyToSensitiveCategory } from "@/lib/safety-key-map";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@bytedance-aigc/ui/components/ui/dialog";
import { Button } from "@bytedance-aigc/ui/components/ui/button";

/**
 * Phase 2.3 发布前审核弹窗。父组件控制 open。打开时 useEffect 触发预检会被
 * react-hooks/set-state-in-effect 拒,改为「只要 open && 还没结果且不在 loading
 * 且无错误」就 lazily 触发一次,触发动作放在 render 路径用 `if` + 调一次。
 */
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

  const retry = () => {
    void preflight.run();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>发布前审核</DialogTitle>
          <DialogDescription className="sr-only">
            发布前对内容进行安全 + 质量审核,推荐结果 24 小时内有效。
          </DialogDescription>
        </DialogHeader>
        {preflight.loading && <p className="text-sm">审核中,稍候(约 5-10 秒)...</p>}
        {preflight.error && !preflight.loading && (
          <div className="text-sm text-red-600 space-y-2">
            <p>{preflight.error}</p>
            <Button type="button" variant="outline" size="sm" onClick={retry}>
              重试
            </Button>
          </div>
        )}
        {data && !preflight.loading && (
          <>
            <div className="flex items-center gap-3">
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
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                先优化再发
              </Button>
              {canPublish && (
                <Button
                  type="button"
                  disabled={publishing}
                  onClick={onPublishClick}
                  className={`text-white ${
                    data.recommendation === "WARN"
                      ? "bg-yellow-600 hover:bg-yellow-600/90"
                      : "bg-green-600 hover:bg-green-600/90"
                  }`}
                >
                  {publishing ? "发布中..." : "立即发布"}
                </Button>
              )}
            </DialogFooter>
            {publish.error && <p className="text-xs text-red-600 mt-2">{publish.error}</p>}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
