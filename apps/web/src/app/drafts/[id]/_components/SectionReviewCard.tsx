"use client";

import type { SectionReviewItem } from "@/hooks/use-section-review";

interface Props {
  item: SectionReviewItem;
  onRegenerate: (heading: string) => void;
  onApplySuggestion: (heading: string, suggestion: string) => void;
  onKeep: (heading: string) => void;
}

export function SectionReviewCard({ item, onRegenerate, onApplySuggestion, onKeep }: Props) {
  const tone =
    item.result.severity === "high"
      ? "border-red-500 bg-red-50 dark:bg-red-950/40"
      : "border-amber-500 bg-amber-50 dark:bg-amber-950/40";

  // SectionReviewResponse 不带 suggestion 字段(本期不扩 shared schema),
  // 用 result.message 作为修改建议文本兜底,Phase 2.7 接 REWRITE_FLUENT 工具卡再升级。
  const suggestion = item.result.message;

  return (
    <div className={`mt-2 rounded border-l-4 px-3 py-2 text-sm ${tone}`}>
      <div className="font-medium">段落风险:{item.result.message}</div>
      {item.result.hitCategories.length > 0 && (
        <div className="text-xs opacity-75 mt-0.5">涉及:{item.result.hitCategories.join("、")}</div>
      )}
      <div className="mt-1 flex gap-2">
        <button
          type="button"
          className="text-xs rounded border border-current px-2 py-0.5"
          onClick={() => onRegenerate(item.heading)}
        >
          重新生成
        </button>
        <button
          type="button"
          className="text-xs rounded px-2 py-0.5"
          onClick={() => onApplySuggestion(item.heading, suggestion)}
        >
          修改建议
        </button>
        <button
          type="button"
          className="text-xs rounded px-2 py-0.5 opacity-75"
          onClick={() => onKeep(item.heading)}
        >
          仍要保留
        </button>
      </div>
    </div>
  );
}
