"use client";

import Link from "next/link";
import { useState } from "react";
import { REPORT_CATEGORY_LABELS, type ReportDto } from "@bytedance-aigc/shared";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

import { ResolveDialog } from "./ResolveDialog";

interface ReportRowProps {
  report: ReportDto;
  onResolved: () => void;
}

const RESOLUTION_LABELS: Record<NonNullable<ReportDto["resolution"]>, string> = {
  OFFLINE: "已下线",
  WARN: "已警告",
  DISMISS: "已驳回",
};

const LLM_LABELS: Record<NonNullable<ReportDto["llmRecommendation"]>, string> = {
  ALLOW: "放行",
  WARN: "警告",
  BLOCK: "下线",
};

function truncate(s: string | null, n: number): string {
  if (!s) return "(无补充说明)";
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

export function ReportRow({ report, onResolved }: ReportRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <Card className="py-0">
      <CardContent className="p-4 flex flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1 min-w-0">
            <Link
              href={`/post/${report.postId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium underline truncate"
            >
              {report.postTitle}
            </Link>
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span>举报人: {report.reporterHandle}</span>
              <span>· 分类: {REPORT_CATEGORY_LABELS[report.category]}</span>
              <span>· {new Date(report.createdAt).toLocaleString()}</span>
            </div>
            <p className="text-sm text-muted-foreground">理由: {truncate(report.reason, 80)}</p>
          </div>
          <Button variant="outline" size="xs" onClick={() => setExpanded((v) => !v)}>
            {expanded ? "收起" : "详情"}
          </Button>
        </div>

        {expanded && (
          <div className="rounded border bg-muted/50 p-3 text-sm flex flex-col gap-2">
            <div>
              <span className="font-medium">LLM 推荐: </span>
              {report.llmRecommendation ? (
                LLM_LABELS[report.llmRecommendation]
              ) : (
                <span className="text-muted-foreground">复审中</span>
              )}
            </div>
            <div>
              <span className="font-medium">LLM 理由: </span>
              {report.llmReason ?? <span className="text-muted-foreground">复审中</span>}
            </div>
            <div>
              <span className="font-medium">举报理由全文: </span>
              {report.reason ?? <span className="text-muted-foreground">(无)</span>}
            </div>
          </div>
        )}

        <div className="flex justify-end items-center gap-3">
          {report.status === "RESOLVED" && report.resolution && (
            <div className="text-xs text-muted-foreground flex gap-2">
              <Badge variant="secondary">{RESOLUTION_LABELS[report.resolution]}</Badge>
              {report.resolvedAt && <span>· {new Date(report.resolvedAt).toLocaleString()}</span>}
            </div>
          )}
          {report.status === "PENDING" && (
            <Button size="sm" onClick={() => setDialogOpen(true)}>
              处置…
            </Button>
          )}
        </div>

        <ResolveDialog
          reportId={report.id}
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          onResolved={onResolved}
        />
      </CardContent>
    </Card>
  );
}
