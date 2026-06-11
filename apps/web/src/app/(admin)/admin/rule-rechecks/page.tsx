"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { apiFetch } from "@bytedance-aigc/ui/lib/auth";
import { cn } from "@bytedance-aigc/ui/lib/utils";
import { Badge } from "@bytedance-aigc/ui/components/ui/badge";
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
import { Label } from "@bytedance-aigc/ui/components/ui/label";

interface RuleRecheckRun {
  id: string;
  ruleVersion: string;
  status: "RUNNING" | "DONE" | "FAILED";
  totalScanned: number;
  totalOffline: number;
  startedAt: string;
  finishedAt: string | null;
}

const STATUS_CONFIG = {
  RUNNING: { label: "运行中", color: "bg-amber-500/15 text-amber-600" },
  DONE: { label: "完成", color: "bg-emerald-500/15 text-emerald-600" },
  FAILED: { label: "失败", color: "bg-destructive/15 text-destructive" },
} as const;

export default function RuleRechecksPage() {
  const [items, setItems] = useState<RuleRecheckRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [triggerOpen, setTriggerOpen] = useState(false);
  const [ruleVersion, setRuleVersion] = useState("");
  const [triggering, setTriggering] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/admin/rule-rechecks");
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        setError(body.message ?? `加载失败 (${res.status})`);
        setItems([]);
        return;
      }
      setItems((await res.json()) as RuleRecheckRun[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "网络错误");
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleTrigger = async () => {
    if (!ruleVersion.trim()) {
      toast.error("请输入规则版本号");
      return;
    }
    setTriggering(true);
    try {
      const res = await apiFetch("/admin/rule-rechecks", {
        method: "POST",
        body: JSON.stringify({ ruleVersion: ruleVersion.trim() }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        toast.error(body.message ?? "触发失败");
        return;
      }
      const data = (await res.json()) as RuleRecheckRun;
      toast.success(`规则复审已触发 (v${ruleVersion.trim()}),扫描中...`);
      setTriggerOpen(false);
      setRuleVersion("");
      // Add to list immediately with RUNNING status
      setItems((prev) => [data, ...prev]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "网络错误");
    } finally {
      setTriggering(false);
    }
  };

  return (
    <main className="max-w-5xl mx-auto px-6 py-8">
      <div className="flex items-end justify-between mb-6 gap-4">
        <div>
          <h1 className="text-lg font-semibold">规则复审</h1>
          <p className="text-sm text-muted-foreground">
            规则更新后批量重审已发布作品,命中 BLOCK 自动下线
          </p>
        </div>
        <Button size="sm" onClick={() => setTriggerOpen(true)}>
          触发复审
        </Button>
      </div>

      {error && <p className="text-sm text-destructive mb-3">{error}</p>}
      {loading && <p className="text-sm text-muted-foreground">加载中…</p>}
      {!loading && items.length === 0 && !error && (
        <p className="text-sm text-muted-foreground">暂无复审记录。点「触发复审」开始。</p>
      )}

      <ul className="flex flex-col gap-3">
        {items.map((run) => {
          const cfg = STATUS_CONFIG[run.status];
          return (
            <li key={run.id}>
              <div className="rounded-lg border border-border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex flex-col gap-1.5 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">v{run.ruleVersion}</span>
                      <Badge className={`text-[10px] ${cfg.color}`}>{cfg.label}</Badge>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span>开始 {new Date(run.startedAt).toLocaleString()}</span>
                      {run.finishedAt && (
                        <span>· 完成 {new Date(run.finishedAt).toLocaleString()}</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    {run.status === "DONE" && (
                      <div className="flex flex-col gap-1 text-xs">
                        <span>
                          扫描 <span className="font-medium tabular-nums">{run.totalScanned}</span>{" "}
                          篇
                        </span>
                        <span className={cn(run.totalOffline > 0 && "text-destructive")}>
                          下线 <span className="font-medium tabular-nums">{run.totalOffline}</span>{" "}
                          篇
                        </span>
                      </div>
                    )}
                    {run.status === "RUNNING" && (
                      <span className="text-xs text-amber-600 animate-pulse">扫描中...</span>
                    )}
                    {run.status === "FAILED" && (
                      <span className="text-xs text-destructive">执行失败</span>
                    )}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {/* 触发复审对话框 */}
      <Dialog open={triggerOpen} onOpenChange={setTriggerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>触发规则复审</DialogTitle>
            <DialogDescription>
              输入新规则版本号,系统将重新审核所有已发布作品。命中 BLOCK 的稿件自动下线。
              <strong className="text-foreground"> 同步执行,可能需要较长时间。</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div>
              <Label className="text-sm">规则版本号</Label>
              <Input
                value={ruleVersion}
                onChange={(e) => setRuleVersion(e.target.value)}
                className="mt-1"
                placeholder="如: v2.1"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                标识此次规则更新的版本,便于追溯
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTriggerOpen(false)} disabled={triggering}>
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleTrigger()}
              disabled={triggering || !ruleVersion.trim()}
            >
              {triggering ? "执行中…" : "确认触发"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
