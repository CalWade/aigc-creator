"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import Link from "next/link";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@bytedance-aigc/ui/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@bytedance-aigc/ui/components/ui/tabs";

interface SampleAuditItem {
  id: string;
  draftId: string;
  status: "PENDING" | "PASSED" | "FAILED";
  reviewedAt: string | null;
  reviewedBy: string | null;
  note: string | null;
  createdAt: string;
  draft: {
    id: string;
    title: string;
    status: string;
  } | null;
}

type FilterStatus = "PENDING" | "PASSED" | "FAILED" | "ALL";

const STATUS_CONFIG = {
  PENDING: { label: "待审", color: "bg-amber-500/15 text-amber-600" },
  PASSED: { label: "通过", color: "bg-emerald-500/15 text-emerald-600" },
  FAILED: { label: "违规", color: "bg-destructive/15 text-destructive" },
} as const;

export default function SampleAuditsPage() {
  const [items, setItems] = useState<SampleAuditItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterStatus>("PENDING");

  const [enqueueOpen, setEnqueueOpen] = useState(false);
  const [enqueueRatio, setEnqueueRatio] = useState("5");
  const [enqueuing, setEnqueuing] = useState(false);

  const [decideItem, setDecideItem] = useState<SampleAuditItem | null>(null);
  const [decideAction, setDecideAction] = useState<"PASS" | "FAIL">("PASS");
  const [decideNote, setDecideNote] = useState("");
  const [deciding, setDeciding] = useState(false);

  const load = async (status: FilterStatus) => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (status !== "ALL") qs.set("status", status);
      const res = await apiFetch(`/admin/sample-audits?${qs.toString()}`);
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        setError(body.message ?? `加载失败 (${res.status})`);
        setItems([]);
        return;
      }
      setItems((await res.json()) as SampleAuditItem[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "网络错误");
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(filter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const handleEnqueue = async () => {
    setEnqueuing(true);
    try {
      const ratio = parseInt(enqueueRatio, 10);
      if (isNaN(ratio) || ratio < 1 || ratio > 100) {
        toast.error("比例需在 1-100 之间");
        return;
      }
      const res = await apiFetch(`/admin/sample-audits/enqueue?ratio=${ratio / 100}`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        toast.error(body.message ?? "抽样失败");
        return;
      }
      const data = (await res.json()) as { enqueued: number };
      toast.success(`已抽入 ${data.enqueued} 条待审记录`);
      setEnqueueOpen(false);
      void load(filter);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "网络错误");
    } finally {
      setEnqueuing(false);
    }
  };

  const handleDecide = async () => {
    if (!decideItem) return;
    setDeciding(true);
    try {
      const res = await apiFetch(`/admin/sample-audits/${decideItem.id}/decide`, {
        method: "POST",
        body: JSON.stringify({ decision: decideAction, note: decideNote.trim() || undefined }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        toast.error(body.message ?? "判定失败");
        return;
      }
      toast.success(decideAction === "PASS" ? "已标记通过" : "已标记违规并下线");
      setDecideItem(null);
      setDecideNote("");
      void load(filter);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "网络错误");
    } finally {
      setDeciding(false);
    }
  };

  return (
    <main className="max-w-5xl mx-auto px-6 py-8">
      <div className="flex items-end justify-between mb-6 gap-4">
        <div>
          <h1 className="text-lg font-semibold">抽样巡检</h1>
          <p className="text-sm text-muted-foreground">
            按 5% 随机抽取已发布作品进行人工复审,违规者自动下线
          </p>
        </div>
        <Button size="sm" onClick={() => setEnqueueOpen(true)}>
          触发抽样
        </Button>
      </div>

      <Tabs value={filter} onValueChange={(v) => setFilter(v as FilterStatus)}>
        <TabsList variant="line">
          <TabsTrigger value="PENDING">待审</TabsTrigger>
          <TabsTrigger value="PASSED">通过</TabsTrigger>
          <TabsTrigger value="FAILED">违规</TabsTrigger>
          <TabsTrigger value="ALL">全部</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="mt-4">
        {error && <p className="text-sm text-destructive mb-3">{error}</p>}
        {loading && <p className="text-sm text-muted-foreground">加载中…</p>}
        {!loading && items.length === 0 && !error && (
          <p className="text-sm text-muted-foreground">
            暂无{filter !== "ALL" ? STATUS_CONFIG[filter as keyof typeof STATUS_CONFIG]?.label : ""}
            记录。
          </p>
        )}
        <ul className="flex flex-col gap-3 mt-3">
          {items.map((item) => {
            const cfg = STATUS_CONFIG[item.status];
            return (
              <li key={item.id}>
                <div className="rounded-lg border border-border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-col gap-1 min-w-0">
                      {item.draft ? (
                        <Link
                          href={`/post/${item.draftId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-medium hover:underline truncate"
                        >
                          {item.draft.title}
                        </Link>
                      ) : (
                        <span className="text-sm text-muted-foreground">(文稿已删除)</span>
                      )}
                      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                        <span className="font-mono">{item.draftId.slice(0, 12)}…</span>
                        <span>· 抽入时间 {new Date(item.createdAt).toLocaleString()}</span>
                        {item.reviewedAt && (
                          <span>· 审判时间 {new Date(item.reviewedAt).toLocaleString()}</span>
                        )}
                      </div>
                      {item.note && (
                        <p className="text-xs text-muted-foreground mt-1">备注: {item.note}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={`text-[10px] ${cfg.color}`}>{cfg.label}</Badge>
                      {item.status === "PENDING" && (
                        <Button
                          variant="outline"
                          size="xs"
                          onClick={() => {
                            setDecideItem(item);
                            setDecideAction("PASS");
                            setDecideNote("");
                          }}
                        >
                          判定
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {/* 触发抽样对话框 */}
      <Dialog open={enqueueOpen} onOpenChange={setEnqueueOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>触发随机抽样</DialogTitle>
            <DialogDescription>
              从已发布作品中随机抽取一部分进行人工复审。已有 PENDING 记录的文稿不会重复抽入。
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div>
              <Label className="text-sm">抽样比例 (%)</Label>
              <Input
                type="number"
                min={1}
                max={100}
                value={enqueueRatio}
                onChange={(e) => setEnqueueRatio(e.target.value)}
                className="mt-1"
              />
              <p className="text-[11px] text-muted-foreground mt-1">默认 5%,范围 1-100</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEnqueueOpen(false)} disabled={enqueuing}>
              取消
            </Button>
            <Button onClick={() => void handleEnqueue()} disabled={enqueuing}>
              {enqueuing ? "抽入中…" : "确认抽样"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 判定对话框 */}
      <Dialog
        open={!!decideItem}
        onOpenChange={(v) => {
          if (!v) setDecideItem(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>判定抽样审计</DialogTitle>
            <DialogDescription>{decideItem?.draft?.title ?? decideItem?.draftId}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div>
              <Label className="text-sm">判定结果</Label>
              <div className="flex gap-2 mt-2">
                {(["PASS", "FAIL"] as const).map((action) => (
                  <label
                    key={action}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 rounded border px-4 py-2.5 cursor-pointer text-sm transition-colors",
                      decideAction === action
                        ? action === "PASS"
                          ? "border-emerald-500 bg-emerald-500/10 text-emerald-600"
                          : "border-destructive bg-destructive/10 text-destructive"
                        : "border-border hover:border-foreground/20",
                    )}
                  >
                    <input
                      type="radio"
                      name="decide-action"
                      value={action}
                      checked={decideAction === action}
                      onChange={() => setDecideAction(action)}
                      className="sr-only"
                    />
                    {action === "PASS" ? "通过" : "违规下线"}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <Label className="text-sm">备注(可选,500 字内)</Label>
              <textarea
                value={decideNote}
                onChange={(e) => setDecideNote(e.target.value)}
                maxLength={500}
                rows={3}
                className="mt-1 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                placeholder="如:确认内容合规 / 发现低俗描写"
              />
            </div>
            {decideAction === "FAIL" && (
              <p className="text-sm text-destructive">
                选择「违规下线」会自动将文稿转为 OFFLINE 状态
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDecideItem(null)} disabled={deciding}>
              取消
            </Button>
            <Button
              variant={decideAction === "FAIL" ? "destructive" : "default"}
              onClick={() => void handleDecide()}
              disabled={deciding}
            >
              {deciding ? "提交中…" : decideAction === "PASS" ? "确认通过" : "确认下线"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
