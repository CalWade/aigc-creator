"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PreflightResponse, SafetyKey } from "@bytedance-aigc/shared";
import { RefreshCw, ShieldCheck, Zap } from "lucide-react";

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
import { RecommendationBadge } from "./RecommendationBadge";

/* ── 安全维度中文名 + severity 颜色映射 ── */

const SAFETY_LABEL: Record<string, string> = {
  pornography: "涉黄",
  gambling: "涉赌",
  drugs: "涉毒",
  abuse: "辱骂/暴恐",
  fraud: "欺诈",
  illicit_ads: "黑产广告",
};

const QUALITY_LABEL: Record<string, string> = {
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

function SafetyDimRow({
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

function QualityDimRow({
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

function ScoreRing({ value, label, size = 56 }: { value: number; label: string; size?: number }) {
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

/* ── ReviewDrawer 主组件 ── */

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
      <SheetContent
        side="right"
        className="w-[420px] sm:w-[520px] sm:max-w-[520px] flex flex-col gap-0 p-0"
      >
        {/* ── Header ── */}
        <SheetHeader className="border-b border-border px-5 py-4">
          <SheetTitle className="flex items-center gap-2.5 text-base">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand/10">
              <ShieldCheck className="h-4 w-4 text-brand" />
            </div>
            内容审核
          </SheetTitle>
          <SheetDescription className="text-[12px]">
            AI 安全扫描 + 质量评分，结果仅供参考，不拦截发布
          </SheetDescription>
        </SheetHeader>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto">
          {/* 未触发：引导态 */}
          {!triggered && (
            <div className="flex flex-col items-center justify-center gap-5 py-20 px-6">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
                <ShieldCheck className="h-8 w-8 text-muted-foreground/50" />
              </div>
              <div className="text-center">
                <p className="text-sm text-foreground font-medium">一键审核你的草稿</p>
                <p className="text-xs text-muted-foreground mt-1">
                  AI 将对全文进行 6 维安全扫描 + 4 维质量评分
                </p>
              </div>
              <Button onClick={() => void handleStart()} size="default" className="gap-2">
                <Zap className="h-4 w-4" />
                开始审核
              </Button>
            </div>
          )}

          {/* 运行中 */}
          {triggered && running && (
            <div className="flex flex-col items-center justify-center gap-4 py-20 px-6">
              <div className="relative h-12 w-12">
                <div className="absolute inset-0 rounded-full border-2 border-muted" />
                <div className="absolute inset-0 rounded-full border-2 border-brand border-t-transparent animate-spin" />
              </div>
              <p className="text-sm text-muted-foreground">审核中，请稍候（约 5-10 秒）…</p>
            </div>
          )}

          {/* 错误 */}
          {triggered && !running && preflight.error && (
            <div className="flex flex-col items-center gap-4 py-16 px-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
                <span className="text-lg">!</span>
              </div>
              <p className="text-sm text-destructive">{preflight.error}</p>
              <Button variant="outline" size="sm" onClick={() => void handleStart()}>
                <RefreshCw className="mr-2 h-3.5 w-3.5" />
                重试
              </Button>
            </div>
          )}

          {/* 结果 */}
          {triggered && !running && data && (
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
        {triggered && !running && data && (
          <div className="border-t border-border px-5 py-3 flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 gap-1.5"
              onClick={() => void handleStart()}
            >
              <RefreshCw className="h-3.5 w-3.5" />
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
