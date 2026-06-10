"use client";

import { useEffect, useState } from "react";
import type { OutlineItem } from "@bytedance-aigc/shared";

import { apiFetch } from "@/lib/auth";
import { usePromptReview } from "@/hooks/use-prompt-review";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { PromptReviewBanner } from "./PromptReviewBanner";

interface FastModeDialogProps {
  draftId: string;
  open: boolean;
  onClose: () => void;
  onAccept: (sections: OutlineItem[]) => void;
  /** 外部带入的初始选题(如来自抖音热榜「以此选题创作」)。仅在 open 由 false→true 时初始化一次。 */
  initialTopic?: string;
}

export function FastModeDialog({
  draftId,
  open,
  onClose,
  onAccept,
  initialTopic,
}: FastModeDialogProps) {
  const [topic, setTopic] = useState(initialTopic ?? "");
  // 外部 initialTopic 变化或 dialog 重新打开时,把 topic 同步成 initialTopic。
  // 用户在 dialog 内的手动修改不会被覆盖,因为 effect 只在 open/initialTopic 变化时触发。
  useEffect(() => {
    if (open && initialTopic) {
      setTopic(initialTopic);
    }
  }, [open, initialTopic]);
  const [hint, setHint] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const promptReview = usePromptReview();
  const composedText = (): string => `${topic.trim()}\n${hint.trim()}`.trim();

  const submit = async (): Promise<void> => {
    if (!topic.trim()) {
      setError("请填写选题");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch(`/drafts/${draftId}/outline`, {
        method: "POST",
        body: JSON.stringify({ topic: topic.trim(), hint: hint.trim() || undefined }),
      });
      if (!res.ok) {
        setError(`生成失败 (HTTP ${res.status})`);
        return;
      }
      const body = (await res.json()) as { sections: OutlineItem[] };
      onAccept(body.sections);
      setTopic("");
      setHint("");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "网络错误");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>FAST 模式生成大纲</DialogTitle>
          <DialogDescription className="sr-only">
            填写选题与可选额外提示后,由模型一次性生成大纲。
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5 text-sm">
            <Label htmlFor="fast-topic">选题</Label>
            <Input
              id="fast-topic"
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              onBlur={() => promptReview.trigger(composedText())}
              placeholder="例:5G-A 商用启动"
            />
          </div>
          <div className="flex flex-col gap-1.5 text-sm">
            <Label htmlFor="fast-hint">额外提示(可选)</Label>
            <textarea
              id="fast-hint"
              value={hint}
              onChange={(e) => setHint(e.target.value)}
              onBlur={() => promptReview.trigger(composedText())}
              rows={3}
              className="rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              placeholder="例:请聚焦运营商成本下降的具体数据"
            />
          </div>
          {promptReview.result && (
            <PromptReviewBanner
              result={promptReview.result}
              onDismiss={promptReview.dismiss}
              onChangeAngle={() => {
                setTopic("");
                setHint("");
                promptReview.dismiss();
              }}
            />
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button type="button" onClick={() => void submit()} disabled={submitting}>
            {submitting ? "生成中…" : "生成大纲"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
