"use client";

import { useState } from "react";
import type { ReportResolution } from "@bytedance-aigc/shared";

import { Button } from "@bytedance-aigc/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@bytedance-aigc/ui/components/ui/dialog";
import { Input } from "@bytedance-aigc/ui/components/ui/input";
import { useResolveReport } from "@/hooks/use-admin-reports";

interface ResolveDialogProps {
  reportId: string;
  open: boolean;
  onClose: () => void;
  onResolved: () => void;
}

const OPTIONS: { value: ReportResolution; label: string }[] = [
  { value: "OFFLINE", label: "下线" },
  { value: "WARN", label: "警告" },
  { value: "DISMISS", label: "驳回" },
];

export function ResolveDialog({ reportId, open, onClose, onResolved }: ResolveDialogProps) {
  const [resolution, setResolution] = useState<ReportResolution>("WARN");
  const [note, setNote] = useState("");
  const { loading, error, run } = useResolveReport();

  const handleClose = (): void => {
    setResolution("WARN");
    setNote("");
    onClose();
  };

  const handleSubmit = async (): Promise<void> => {
    const ok = await run(reportId, { resolution, note: note.trim() || undefined });
    if (ok) {
      onResolved();
      handleClose();
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) handleClose();
      }}
    >
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>处置举报</DialogTitle>
          <DialogDescription className="sr-only">处置类型</DialogDescription>
        </DialogHeader>
        <fieldset className="flex flex-col gap-2 text-sm">
          {OPTIONS.map((o) => (
            <label
              key={o.value}
              className={`flex items-center gap-2 rounded border px-3 py-2 cursor-pointer ${
                resolution === o.value ? "border-foreground" : "border-border"
              }`}
            >
              <input
                type="radio"
                name="resolve-resolution"
                value={o.value}
                checked={resolution === o.value}
                onChange={() => setResolution(o.value)}
              />
              <span>{o.label}</span>
            </label>
          ))}
        </fieldset>
        <label className="flex flex-col gap-1 text-sm">
          <span>处置备注(可选,最多 200 字)</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={200}
            rows={3}
            className="rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            placeholder="例:确认低俗描写,予以下线"
          />
          <span className="text-xs text-muted-foreground self-end">{note.length}/200</span>
        </label>
        {resolution === "OFFLINE" && (
          <p className="text-sm text-destructive">
            此操作会下线该稿件,作者将在 /me/works 看到下线提示
          </p>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={handleClose}>
            取消
          </Button>
          <Button size="sm" onClick={() => void handleSubmit()} disabled={loading}>
            {loading ? "提交中…" : "提交"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
