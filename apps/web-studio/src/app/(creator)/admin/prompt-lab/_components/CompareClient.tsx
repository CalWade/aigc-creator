"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@bytedance-aigc/ui/components/ui/badge";
import { Button } from "@bytedance-aigc/ui/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@bytedance-aigc/ui/components/ui/card";
import { useCompare } from "@/hooks/use-admin-prompt-lab";

export function CompareClient({ evalRunId }: { evalRunId: string }) {
  const router = useRouter();
  const { data, loading, promoting, error, load, promote } = useCompare();
  const [promoteNote, setPromoteNote] = useState("");

  useEffect(() => {
    void load(evalRunId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evalRunId]);

  if (error === "无管理员权限") {
    return <p className="text-destructive text-sm">无管理员权限,请联系运维。</p>;
  }
  if (loading) return <p className="text-sm text-muted-foreground">加载中…</p>;
  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!data) return null;

  const deltaPct = (data.accuracyDelta * 100).toFixed(1);
  const deltaSign = data.accuracyDelta >= 0 ? "+" : "";
  const deltaTone =
    data.accuracyDelta > 0
      ? "text-emerald-600"
      : data.accuracyDelta < 0
        ? "text-destructive"
        : "text-muted-foreground";

  async function onPromote() {
    const ok = await promote(evalRunId, promoteNote.trim() || undefined);
    if (ok) {
      toast.success("已上线为 live prompt");
      router.push("/admin/prompt-lab");
    } else {
      toast.error(error ?? "上线失败");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Link
          href="/admin/prompt-lab/eval-runs"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← 评估列表
        </Link>
        <span className="ml-auto text-[11px] text-muted-foreground font-mono">{evalRunId}</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">候选(本次评估)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <div className="text-3xl font-semibold tabular-nums">
              {(data.candidate.accuracy * 100).toFixed(1)}%
            </div>
            <div className="text-xs text-muted-foreground">
              {data.candidate.totalCases} 条测试用例
            </div>
            <div className="text-[11px] text-muted-foreground font-mono break-all">
              prompt: {data.candidate.promptId}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">上一版基线</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {data.previous ? (
              <>
                <div className="text-3xl font-semibold tabular-nums text-muted-foreground">
                  {(data.previous.accuracy * 100).toFixed(1)}%
                </div>
                <div className="text-[11px] text-muted-foreground font-mono break-all">
                  prompt: {data.previous.promptId}
                </div>
              </>
            ) : (
              <div className="text-sm text-muted-foreground">无上一版基线</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">变化</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className={`text-3xl font-semibold tabular-nums ${deltaTone}`}>
              {deltaSign}
              {deltaPct}%
            </div>
            <Badge
              className={
                data.canPromote
                  ? "bg-emerald-500/15 text-emerald-600"
                  : "bg-destructive/15 text-destructive"
              }
            >
              {data.canPromote ? "可上线" : "不允许上线"}
            </Badge>
            {!data.canPromote && (
              <p className="text-xs text-muted-foreground">
                accuracy 下降,系统拒绝上线。请先优化 prompt 再重新评估。
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">当前 live prompt</CardTitle>
        </CardHeader>
        <CardContent>
          {data.current ? (
            <div className="text-xs space-y-1">
              <div className="font-mono">{data.current.name}</div>
              <div className="text-[11px] text-muted-foreground font-mono">{data.current.id}</div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">该 tool 暂无 live prompt</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">一键上线</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            把候选 prompt 的内容写入当前 live prompt,旧 live 写入快照可回滚。
          </p>
          <textarea
            value={promoteNote}
            onChange={(e) => setPromoteNote(e.target.value)}
            maxLength={500}
            rows={2}
            placeholder="备注(可选,500 字内)"
            className="w-full rounded border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <Button onClick={() => void onPromote()} disabled={!data.canPromote || promoting}>
            {promoting ? "上线中…" : "确认上线"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
