"use client";

import type { SafetyKey } from "@aigc-creator/shared";

/* ── 常量映射 ── */

export const SAFETY_LABEL: Record<string, string> = {
  pornography: "涉黄",
  gambling: "涉赌",
  drugs: "涉毒",
  abuse: "辱骂/暴恐",
  fraud: "欺诈",
  illicit_ads: "黑产广告",
};

export const QUALITY_LABEL: Record<string, string> = {
  content_value: "内容价值",
  expression: "表达质量",
  reader_experience: "读者体验",
  viral_potential: "传播潜力",
};

const SEVERITY_STYLES: Record<string, string> = {
  high: "bg-red-500/15 text-red-700 dark:bg-red-500/20 dark:text-red-300 border-red-500/30",
  medium:
    "bg-amber-500/15 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300 border-amber-500/30",
  low: "bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300 border-emerald-500/25",
};

const SEVERITY_DOT: Record<string, string> = {
  high: "bg-red-500",
  medium: "bg-amber-500",
  low: "bg-emerald-500",
};

const SEVERITY_LABEL: Record<string, string> = {
  high: "高风险",
  medium: "中风险",
  low: "安全",
};

/* ── 安全维度行 ── */

export function SafetyDimRow({
  label,
  score,
  severity,
  onSafeRewrite,
}: {
  label: string;
  score: number;
  severity: string;
  onSafeRewrite?: () => void;
}) {
  return (
    <div
      className={`rounded-lg border px-3 py-2.5 flex items-center gap-3 ${SEVERITY_STYLES[severity]}`}
    >
      <span className={`h-2 w-2 shrink-0 rounded-full ${SEVERITY_DOT[severity]}`} />
      <span className="flex-1 text-[13px] font-medium">{label}</span>
      <span className="text-xs tabular-nums">{score}</span>
      <span className="text-[11px] opacity-70">{SEVERITY_LABEL[severity]}</span>
      {severity === "medium" && onSafeRewrite && (
        <button
          type="button"
          onClick={onSafeRewrite}
          className="ml-1 text-[11px] rounded-md border border-current/30 px-1.5 py-0.5 hover:bg-white/10 dark:hover:bg-white/5"
        >
          合规替代
        </button>
      )}
    </div>
  );
}

/* ── 质量维度行 ── */

export function QualityDimRow({
  label,
  score,
  onClick,
}: {
  label: string;
  score: number;
  onClick?: () => void;
}) {
  const pct = Math.max(0, Math.min(100, score));
  const barColor =
    pct >= 80
      ? "bg-emerald-500"
      : pct >= 60
        ? "bg-brand"
        : pct >= 40
          ? "bg-amber-500"
          : "bg-red-500";

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left rounded-lg border border-border/60 hover:border-border bg-muted/30 px-3 py-2.5 flex flex-col gap-1.5 transition-colors"
    >
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium">{label}</span>
        <span className="text-sm tabular-nums font-semibold">{score}</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </button>
  );
}

/* ── 总分环形指示器 ── */

export function ScoreRing({
  value,
  label,
  size = 56,
}: {
  value: number;
  label: string;
  size?: number;
}) {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value));
  const strokeDashoffset = circ * (1 - pct / 100);

  const ringColor =
    pct >= 80
      ? "stroke-emerald-500"
      : pct >= 60
        ? "stroke-brand"
        : pct >= 40
          ? "stroke-amber-500"
          : "stroke-red-500";

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            className="stroke-muted"
            strokeWidth={4}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            className={ringColor}
            strokeWidth={4}
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={strokeDashoffset}
            style={{ transition: "stroke-dashoffset 0.6s ease" }}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-sm font-bold">
          {value}
        </span>
      </div>
      <span className="text-[11px] text-muted-foreground">{label}</span>
    </div>
  );
}
