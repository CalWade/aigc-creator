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
import { Input } from "@bytedance-aigc/ui/components/ui/input";
import { Label } from "@bytedance-aigc/ui/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@bytedance-aigc/ui/components/ui/select";
import { DRAFT_TOOL_TYPES, type DraftToolType, useTestCases } from "@/hooks/use-admin-prompt-lab";

const ALL_TOOLS = "__all__";

export function TestCasesClient() {
  const { items, loading, error, load, add } = useTestCases();
  const [tool, setTool] = useState<DraftToolType | "">("");
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({
    tool: "SAFETY_REVIEW" as DraftToolType,
    input: "",
    expected: "",
    category: "",
  });

  useEffect(() => {
    void load(tool || undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool]);

  if (error === "无管理员权限") {
    return <p className="text-destructive text-sm">无管理员权限,请联系运维。</p>;
  }

  async function onAdd() {
    if (!form.input.trim() || !form.expected.trim()) {
      toast.error("input / expected 必填");
      return;
    }
    setAdding(true);
    const ok = await add({
      tool: form.tool,
      input: form.input.trim(),
      expected: form.expected.trim(),
      category: form.category.trim() || undefined,
    });
    setAdding(false);
    if (ok) {
      toast.success("测试用例已添加");
      setOpen(false);
      setForm({ tool: form.tool, input: "", expected: "", category: "" });
      void load(tool || undefined);
    } else {
      toast.error("添加失败");
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
          添加测试用例
        </Button>
      </div>

      {error && error !== "无管理员权限" && <p className="text-sm text-destructive">{error}</p>}
      {loading && <p className="text-sm text-muted-foreground">加载中…</p>}
      {!loading && items.length === 0 && !error && (
        <p className="text-sm text-muted-foreground">暂无测试用例。</p>
      )}

      <ul className="flex flex-col gap-3">
        {items.map((tc) => (
          <li key={tc.id}>
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <CardTitle className="text-sm">测试用例</CardTitle>
                  <Badge variant="outline" className="text-[10px]">
                    {tc.tool}
                  </Badge>
                  {tc.category && (
                    <Badge variant="secondary" className="text-[10px]">
                      {tc.category}
                    </Badge>
                  )}
                  <span className="ml-auto text-[11px] text-muted-foreground font-mono">
                    expected={tc.expected}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="text-xs space-y-2">
                <div className="text-muted-foreground line-clamp-3 whitespace-pre-wrap">
                  {tc.input}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  添加于 {new Date(tc.createdAt).toLocaleString()}
                </div>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>添加测试用例</DialogTitle>
            <DialogDescription>
              用于评估候选 Prompt 的准确率。expected 是该 input 经过 LLM 后预期的 severity 输出
              (例如 high / medium / low)。
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
              <Label className="text-sm">Input(测试输入,5000 字内)</Label>
              <textarea
                value={form.input}
                onChange={(e) => setForm({ ...form, input: e.target.value })}
                maxLength={5000}
                rows={5}
                className="mt-1 w-full rounded border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="待评估的内容片段"
              />
            </div>
            <div>
              <Label className="text-sm">Expected(预期输出,200 字内)</Label>
              <Input
                value={form.expected}
                onChange={(e) => setForm({ ...form, expected: e.target.value })}
                maxLength={200}
                className="mt-1"
                placeholder="如:high / medium / low"
              />
            </div>
            <div>
              <Label className="text-sm">Category(可选)</Label>
              <Input
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                maxLength={200}
                className="mt-1"
                placeholder="如:政治 / 色情 / 引战"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button onClick={() => void onAdd()} disabled={adding}>
              {adding ? "添加中…" : "添加"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
