"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { apiFetch, clearToken, getToken } from "@bytedance-aigc/ui/lib/auth";
import { Button } from "@bytedance-aigc/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@bytedance-aigc/ui/components/ui/card";
import { Input } from "@bytedance-aigc/ui/components/ui/input";

interface ApiError {
  code?: string;
  message?: string;
}

type SubmitState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "ok"; draftId: string }
  | { kind: "error"; message: string };

export default function AdminOfflinePage() {
  const router = useRouter();
  const [draftId, setDraftId] = useState("");
  const [reason, setReason] = useState("");
  const [state, setState] = useState<SubmitState>({ kind: "idle" });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draftId.trim()) return;
    if (!getToken()) {
      window.location.replace("/login");
      return;
    }
    setState({ kind: "submitting" });
    try {
      const res = await apiFetch(`/admin/drafts/${encodeURIComponent(draftId.trim())}/offline`, {
        method: "POST",
        body: JSON.stringify({ reason: reason.trim() || undefined }),
      });
      if (res.status === 401) {
        clearToken();
        window.location.replace("/login");
        return;
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as ApiError;
        setState({
          kind: "error",
          message: body.message ?? `下线失败 (HTTP ${res.status})`,
        });
        return;
      }
      setState({ kind: "ok", draftId: draftId.trim() });
      setReason("");
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "网络错误",
      });
    }
  };

  return (
    <main className="max-w-2xl mx-auto px-6 py-8">
      <h1 className="text-lg font-semibold mb-1">直接下线作品</h1>
      <p className="text-sm text-muted-foreground mb-6">
        填入 draft ID 强制下线,不经过举报流程。仅作用于 PUBLISHED 状态作品。
      </p>
      <Card>
        <form onSubmit={submit}>
          <CardContent className="flex flex-col gap-4 pt-6">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Draft ID</span>
              <Input
                type="text"
                value={draftId}
                onChange={(e) => setDraftId(e.target.value)}
                placeholder="例:pub000draft0000000000000000"
                className="font-mono"
                required
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">下线原因(可选,最多 200 字)</span>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={200}
                rows={3}
                placeholder="留空则使用默认「平台审核下线」"
                className="rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
            </label>
          </CardContent>
          <CardFooter className="flex flex-col items-start gap-3">
            <Button
              type="submit"
              variant="destructive"
              size="sm"
              disabled={state.kind === "submitting" || !draftId.trim()}
            >
              {state.kind === "submitting" ? "下线中…" : "确认下线"}
            </Button>
            {state.kind === "ok" && (
              <p className="text-sm text-emerald-600 dark:text-emerald-400">
                已下线 <span className="font-mono">{state.draftId}</span>
              </p>
            )}
            {state.kind === "error" && <p className="text-sm text-destructive">{state.message}</p>}
          </CardFooter>
        </form>
      </Card>
    </main>
  );
}
