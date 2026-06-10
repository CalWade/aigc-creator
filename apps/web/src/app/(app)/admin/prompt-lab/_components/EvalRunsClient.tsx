"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DRAFT_TOOL_TYPES, type DraftToolType, useEvalRuns } from "@/hooks/use-admin-prompt-lab";

const ALL_TOOLS = "__all__";

const STATUS_COLOR = {
  RUNNING: "bg-amber-500/15 text-amber-600",
  DONE: "bg-emerald-500/15 text-emerald-600",
  FAILED: "bg-destructive/15 text-destructive",
} as const;

export function EvalRunsClient() {
  const router = useRouter();
  const { items, loading, running, error, load, runEval } = useEvalRuns();
  const [tool, setTool] = useState<DraftToolType | "">("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    tool: "SAFETY_REVIEW" as DraftToolType,
    candidatePromptId: "",
  });

  useEffect(() => {
    void load(tool || undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool]);

  if (error === "无管理员权限") {
    return <p className="text-destructive text-sm">无管理员权限,请联系运维。</p>;
  }

  async function onRun() {
    if (!form.candidatePromptId.trim()) {
      toast.error("请填写候选 Prompt ID(从 /admin/prompt-lab 复制)");
      return;
    }
    const result = await runEval(form.tool, form.candidatePromptId.trim());
    if (result) {
      toast.success(
        `评估完成 — accuracy ${(result.accuracy * 100).toFixed(1)}% (${result.totalCases} 条)`,
      );
      setOpen(false);
      setForm({ tool: form.tool, candidatePromptId: "" });
      router.push(`/admin/prompt-lab/eval-runs/${result.id}`);
    } else {
      toast.error(error ?? "评估失败");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Label className="text-sm">按 tool 过滤</Label>
        <Select
          value={tool || ALL_TOOLS}
          onValueChange={(v) => setTool(v === ALL_TOOLS ? "" : (v as DraftToolType))}
        >
          <SelectTrigger className="h-8 w-[220px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_TOOLS}>全部 tool</SelectItem>
            {DRAFT_TOOL_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button size="sm" className="ml-auto" onClick={() => setOpen(true)}>
          触发新评估
        </Button>
      </div>

      {error && error !== "无管理员权限" && <p className="text-sm text-destructive">{error}</p>}
      {loading && <p className="text-sm text-muted-foreground">加载中…</p>}
      {!loading && items.length === 0 && !error && (
        <p className="text-sm text-muted-foreground">暂无评估记录。点「触发新评估」开始。</p>
      )}

      <ul className="flex flex-col gap-3">
        {items.map((r) => (
          <li key={r.id}>
            <Link href={`/admin/prompt-lab/eval-runs/${r.id}`}>
              <Card className="hover:bg-accent/30 transition-colors cursor-pointer">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <CardTitle className="text-sm font-mono">{r.id}</CardTitle>
                    <Badge variant="outline" className="text-[10px]">
                      {r.tool}
                    </Badge>
                    <Badge className={`text-[10px] ${STATUS_COLOR[r.status]}`}>{r.status}</Badge>
                    <span className="ml-auto tabular-nums text-sm font-medium">
                      {r.status === "DONE" ? `${(r.accuracy * 100).toFixed(1)}%` : "—"}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground space-y-1">
                  <div className="flex gap-4 flex-wrap">
                    <span>测试用例 {r.totalCases} 条</span>
                    <span>开始 {new Date(r.startedAt).toLocaleString()}</span>
                    {r.finishedAt && <span>完成 {new Date(r.finishedAt).toLocaleString()}</span>}
                  </div>
                  <div className="text-[11px] font-mono">候选 prompt: {r.promptId}</div>
                </CardContent>
              </Card>
            </Link>
          </li>
        ))}
      </ul>

      <Dialog open={open} onOpenChange={(o) => !running && setOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>触发新评估</DialogTitle>
            <DialogDescription>
              对选定 tool 的全部测试用例,用候选 Prompt 跑一次 LLM 推理,统计准确率。
              <strong className="text-foreground"> 同步执行,可能需要 30 秒以上。</strong>{" "}
              期间请勿关闭页面。
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div>
              <Label className="text-sm">Tool</Label>
              <Select
                value={form.tool}
                onValueChange={(v) => setForm({ ...form, tool: v as DraftToolType })}
              >
                <SelectTrigger className="h-8 w-full mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DRAFT_TOOL_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm">候选 Prompt ID</Label>
              <Input
                value={form.candidatePromptId}
                onChange={(e) => setForm({ ...form, candidatePromptId: e.target.value })}
                className="mt-1 font-mono text-xs"
                placeholder="从 /admin/prompt-lab 复制目标 prompt 的 ID"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={running}>
              取消
            </Button>
            <Button onClick={() => void onRun()} disabled={running}>
              {running ? "评估中…(可能 30 秒+)" : "开始评估"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
