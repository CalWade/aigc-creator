"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@bytedance-aigc/ui/components/ui/badge";
import { Button } from "@bytedance-aigc/ui/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@bytedance-aigc/ui/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@bytedance-aigc/ui/components/ui/dialog";
import { Label } from "@bytedance-aigc/ui/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@bytedance-aigc/ui/components/ui/select";
import {
  DRAFT_TOOL_TYPES,
  type DraftToolType,
  usePromptList,
  useRollback,
} from "@/hooks/use-admin-prompt-lab";

const ALL_TOOLS = "__all__";

export function PromptListClient() {
  const { items, loading, error, load } = usePromptList();
  const rollback = useRollback();
  const [tool, setTool] = useState<DraftToolType | "">("");
  const [rollbackOpen, setRollbackOpen] = useState(false);
  const [rollbackTool, setRollbackTool] = useState<DraftToolType | "">("");
  const [rollbackNote, setRollbackNote] = useState("");

  useEffect(() => {
    void load({ owner: "PLATFORM" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void load({ owner: "PLATFORM", tool: tool || undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool]);

  if (error === "无管理员权限") {
    return <p className="text-destructive text-sm">无管理员权限,请联系运维。</p>;
  }

  async function onRollback() {
    if (!rollbackTool) return;
    const ok = await rollback.run(rollbackTool, rollbackNote.trim() || undefined);
    if (ok) {
      toast.success(`已回滚 ${rollbackTool} 到上一版`);
      setRollbackOpen(false);
      setRollbackNote("");
      void load({ owner: "PLATFORM", tool: tool || undefined });
    } else {
      toast.error(rollback.error ?? "回滚失败");
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

        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          onClick={() => {
            setRollbackTool(tool || "SAFETY_REVIEW");
            setRollbackOpen(true);
          }}
        >
          回滚到上一版
        </Button>
      </div>

      {error && error !== "无管理员权限" && <p className="text-sm text-destructive">{error}</p>}
      {loading && <p className="text-sm text-muted-foreground">加载中…</p>}
      {!loading && items.length === 0 && !error && (
        <p className="text-sm text-muted-foreground">暂无 prompt。</p>
      )}

      <ul className="flex flex-col gap-3">
        {items.map((p) => (
          <li key={p.id}>
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <CardTitle className="text-sm font-mono">{p.name}</CardTitle>
                  <Badge variant="outline" className="text-[10px]">
                    {p.tool}
                  </Badge>
                  <Badge variant="secondary" className="text-[10px]">
                    v{p.version}
                  </Badge>
                  {p.isStarter && (
                    <Badge className="text-[10px] bg-primary/10 text-primary">live</Badge>
                  )}
                  <span className="ml-auto text-[11px] text-muted-foreground font-mono">
                    {p.id}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground space-y-1">
                <div className="line-clamp-2 whitespace-pre-wrap">{p.systemPrompt}</div>
                <div className="text-[11px]">更新于 {new Date(p.updatedAt).toLocaleString()}</div>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>

      <Dialog open={rollbackOpen} onOpenChange={setRollbackOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>回滚 Prompt 到上一版</DialogTitle>
            <DialogDescription>
              选择 tool,系统会把当前 live prompt 替换为上一次成功 promote 的快照。不可撤销。
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div>
              <Label className="text-sm">Tool</Label>
              <Select
                value={rollbackTool || undefined}
                onValueChange={(v) => setRollbackTool(v as DraftToolType)}
              >
                <SelectTrigger className="h-8 w-full mt-1">
                  <SelectValue placeholder="选择 tool" />
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
              <Label className="text-sm">备注(可选,500 字内)</Label>
              <textarea
                value={rollbackNote}
                onChange={(e) => setRollbackNote(e.target.value)}
                maxLength={500}
                rows={3}
                className="mt-1 w-full rounded border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="为什么回滚?"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRollbackOpen(false)}>
              取消
            </Button>
            <Button
              variant="destructive"
              disabled={!rollbackTool || rollback.loading}
              onClick={() => void onRollback()}
            >
              {rollback.loading ? "回滚中…" : "确认回滚"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
