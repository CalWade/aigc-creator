"use client";

import { useState } from "react";
import {
  REPORT_CATEGORIES,
  REPORT_CATEGORY_LABELS,
  type ReportCategory,
} from "@bytedance-aigc/shared";

import { useCreateReport } from "@/hooks/use-report";

interface ReportDialogProps {
  postId: string;
  open: boolean;
  onClose: () => void;
}

export function ReportDialog({ postId, open, onClose }: ReportDialogProps) {
  const [category, setCategory] = useState<ReportCategory>("VULGARITY");
  const [reason, setReason] = useState("");
  const { loading, error, done, submit, reset } = useCreateReport(postId);

  if (!open) return null;

  const handleSubmit = async (): Promise<void> => {
    const ok = await submit({ category, reason: reason.trim() || undefined });
    if (ok) {
      setReason("");
      setTimeout(() => {
        reset();
        onClose();
      }, 1200);
    }
  };

  const handleClose = (): void => {
    reset();
    setReason("");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={handleClose} />
      <div className="relative w-full max-w-lg rounded-lg bg-white dark:bg-zinc-950 shadow-xl border border-zinc-200 dark:border-zinc-800 p-5 flex flex-col gap-4">
        <h2 className="text-lg font-semibold">举报该稿件</h2>
        <fieldset className="grid grid-cols-2 gap-2 text-sm">
          <legend className="sr-only">举报分类</legend>
          {REPORT_CATEGORIES.map((c) => (
            <label
              key={c}
              className={`flex items-center gap-2 rounded border px-2 py-1.5 cursor-pointer ${
                category === c
                  ? "border-zinc-900 dark:border-zinc-100"
                  : "border-zinc-300 dark:border-zinc-700"
              }`}
            >
              <input
                type="radio"
                name="report-category"
                value={c}
                checked={category === c}
                onChange={() => setCategory(c)}
              />
              <span>{REPORT_CATEGORY_LABELS[c]}</span>
            </label>
          ))}
        </fieldset>
        <label className="flex flex-col gap-1 text-sm">
          <span>补充说明(可选,最多 500 字)</span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            rows={4}
            className="rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 py-1.5 outline-none focus:border-zinc-500"
            placeholder="例:文中第三段含明显诱导未成年人的低俗描写"
          />
          <span className="text-xs text-zinc-500 self-end">{reason.length}/500</span>
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {done && <p className="text-sm text-green-600">已提交,审核中…</p>}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={handleClose}
            className="rounded border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={loading || done}
            className="rounded bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 px-3 py-1.5 text-sm disabled:opacity-50"
          >
            {loading ? "提交中…" : "提交"}
          </button>
        </div>
      </div>
    </div>
  );
}
