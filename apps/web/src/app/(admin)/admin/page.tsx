"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Users,
  FileText,
  Eye,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Sparkles,
  TrendingUp,
  BarChart3,
} from "lucide-react";
import { cn } from "@bytedance-aigc/ui/lib/utils";
import { apiFetch } from "@bytedance-aigc/ui/lib/auth";
import { StatCard } from "@bytedance-aigc/ui/components/dashboard/stat-card";

interface AdminStats {
  totalUsers: number;
  totalAuthors: number;
  totalAdmins: number;
  totalDrafts: number;
  totalPublished: number;
  totalOffline: number;
  totalReviewing: number;
  pendingReports: number;
  resolvedReports: number;
  totalReviews: number;
  blockRate: number;
  warnRate: number;
  avgQualityOverall: number;
  pendingSampleAudits: number;
  totalReactions: number;
  totalAssets: number;
}

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; data: AdminStats }
  | { kind: "error"; message: string };

const QUICK_LINKS = [
  { href: "/admin/reports", label: "举报工作台", icon: ShieldAlert, desc: "待处理举报" },
  { href: "/admin/sample-audits", label: "抽样巡检", icon: Eye, desc: "5% 随机抽审" },
  { href: "/admin/rule-rechecks", label: "规则复审", icon: ShieldCheck, desc: "规则更新后重审" },
  { href: "/admin/prompt-lab", label: "Prompt 实验室", icon: Sparkles, desc: "评估与上线" },
] as const;

export default function AdminHomePage() {
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    void apiFetch("/admin/stats")
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { message?: string };
          setState({ kind: "error", message: body.message ?? `加载失败 (${res.status})` });
          return;
        }
        const data = (await res.json()) as AdminStats;
        if (!cancelled) setState({ kind: "ready", data });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({ kind: "error", message: err instanceof Error ? err.message : "网络错误" });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="max-w-6xl mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold">平台管理总览</h1>
        <p className="text-sm text-muted-foreground mt-1">实时数据概览 · 审核状态 · 快捷入口</p>
      </div>

      {state.kind === "loading" && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="animate-pulse">加载统计数据...</span>
        </div>
      )}

      {state.kind === "error" && <p className="text-sm text-destructive">{state.message}</p>}

      {state.kind === "ready" && <DashboardContent data={state.data} />}
    </main>
  );
}

function DashboardContent({ data }: { data: AdminStats }) {
  return (
    <div className="flex flex-col gap-8">
      {/* 用户与内容 */}
      <section>
        <h2 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
          <Users className="h-4 w-4" />
          用户与内容
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          <StatCard label="总用户" value={data.totalUsers} />
          <StatCard label="创作者" value={data.totalAuthors} />
          <StatCard label="文稿总数" value={data.totalDrafts} />
          <StatCard label="已发布" value={data.totalPublished} />
          <StatCard label="审核中" value={data.totalReviewing} tone="warn" />
          <StatCard label="已下线" value={data.totalOffline} tone="warn" />
          <StatCard label="素材数" value={data.totalAssets} />
        </div>
      </section>

      {/* 审核与安全 */}
      <section>
        <h2 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
          <ShieldAlert className="h-4 w-4" />
          审核与安全
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          <StatCard label="待处置举报" value={data.pendingReports} tone="warn" />
          <StatCard label="已处置举报" value={data.resolvedReports} />
          <StatCard label="审核总数" value={data.totalReviews} />
          <StatCard
            label="拦截率"
            value={(data.blockRate * 100).toFixed(1)}
            suffix="%"
            hint="BLOCK / 总审核"
          />
          <StatCard
            label="警告率"
            value={(data.warnRate * 100).toFixed(1)}
            suffix="%"
            hint="WARN / 总审核"
          />
          <StatCard label="平均质量分" value={data.avgQualityOverall.toFixed(1)} suffix=" / 100" />
          <StatCard
            label="待抽审"
            value={data.pendingSampleAudits}
            tone={data.pendingSampleAudits > 0 ? "warn" : "default"}
          />
        </div>
      </section>

      {/* 互动数据 */}
      <section>
        <h2 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
          <TrendingUp className="h-4 w-4" />
          互动数据
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="总互动" value={data.totalReactions} hint="赞 + 藏" />
          <StatCard
            label="举报处理率"
            value={
              data.pendingReports + data.resolvedReports > 0
                ? (
                    (data.resolvedReports / (data.pendingReports + data.resolvedReports)) *
                    100
                  ).toFixed(1)
                : "—"
            }
            suffix={data.pendingReports + data.resolvedReports > 0 ? "%" : ""}
            hint="已处置 / 总举报"
          />
        </div>
      </section>

      {/* 审核健康度指标条 */}
      <section>
        <h2 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
          <BarChart3 className="h-4 w-4" />
          健康度指标
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <HealthBar
            label="内容安全"
            value={1 - data.blockRate}
            format={(v) => `${(v * 100).toFixed(0)}% 安全`}
            goodThreshold={0.95}
          />
          <HealthBar
            label="举报处理"
            value={
              data.pendingReports + data.resolvedReports > 0
                ? data.resolvedReports / (data.pendingReports + data.resolvedReports)
                : 1
            }
            format={(v) => `${(v * 100).toFixed(0)}% 已处理`}
            goodThreshold={0.8}
          />
          <HealthBar
            label="内容质量"
            value={data.avgQualityOverall / 100}
            format={(v) => `${(v * 100).toFixed(0)} 分`}
            goodThreshold={0.6}
          />
        </div>
      </section>

      {/* 快捷入口 */}
      <section>
        <h2 className="text-sm font-medium text-muted-foreground mb-3">快捷入口</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {QUICK_LINKS.map((link) => {
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                className="group rounded-lg border border-border p-4 hover:border-foreground/20 hover:bg-accent/30 transition-all"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <Icon className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                  <span className="text-sm font-medium group-hover:text-foreground transition-colors">
                    {link.label}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">{link.desc}</span>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function HealthBar({
  label,
  value,
  format,
  goodThreshold,
}: {
  label: string;
  value: number;
  format: (v: number) => string;
  goodThreshold: number;
}) {
  const pct = Math.max(0, Math.min(1, value));
  const color =
    pct >= goodThreshold ? "bg-emerald-500" : pct >= 0.5 ? "bg-amber-500" : "bg-destructive";

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-sm tabular-nums">{format(pct)}</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-500", color)}
          style={{ width: `${pct * 100}%` }}
        />
      </div>
    </div>
  );
}
