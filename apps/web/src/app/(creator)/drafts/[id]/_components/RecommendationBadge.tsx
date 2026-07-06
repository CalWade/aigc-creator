"use client";
import type { Recommendation } from "@aigc-creator/shared";
import { ShieldCheck, ShieldAlert, ShieldX } from "lucide-react";

const STYLES: Record<Recommendation, string> = {
  ALLOW:
    "bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300 border-emerald-500/30",
  WARN: "bg-amber-500/10 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300 border-amber-500/30",
  BLOCK: "bg-red-500/10 text-red-700 dark:bg-red-500/15 dark:text-red-300 border-red-500/30",
};

const TEXT: Record<Recommendation, string> = {
  ALLOW: "建议发布",
  WARN: "可发布,有提示",
  BLOCK: "需修改",
};

const Icon: Record<Recommendation, typeof ShieldCheck> = {
  ALLOW: ShieldCheck,
  WARN: ShieldAlert,
  BLOCK: ShieldX,
};

export function RecommendationBadge({ value }: { value: Recommendation }) {
  const I = Icon[value];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[12px] font-medium ${STYLES[value]}`}
    >
      <I className="h-3.5 w-3.5" />
      {TEXT[value]}
    </span>
  );
}
