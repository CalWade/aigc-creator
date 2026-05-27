"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { JSONContent } from "@tiptap/react";

import { apiFetch, clearToken, getToken } from "@/lib/auth";
import { useAutosave } from "@/lib/use-autosave";

import { SaveStatus } from "./save-status";
import { TiptapBody } from "./tiptap-body";

interface DraftDetail {
  id: string;
  authorId: string;
  title: string;
  body: JSONContent;
  mode: "FAST" | "FINE";
  version: number;
  updatedAt: string;
}

type State =
  | { kind: "loading" }
  | { kind: "ready"; draft: DraftDetail }
  | { kind: "not-found" }
  | { kind: "forbidden" }
  | { kind: "error"; message: string };

export function DraftEditor({ id }: { id: string }) {
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [title, setTitle] = useState("");
  const [body, setBody] = useState<JSONContent>({ type: "doc", content: [] });

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    let cancelled = false;
    void apiFetch(`/drafts/${id}`)
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 401) {
          clearToken();
          router.replace("/login");
          return;
        }
        if (res.status === 403) {
          setState({ kind: "forbidden" });
          return;
        }
        if (res.status === 404) {
          setState({ kind: "not-found" });
          return;
        }
        if (!res.ok) {
          setState({ kind: "error", message: `加载失败 (HTTP ${res.status})` });
          return;
        }
        const draft = (await res.json()) as DraftDetail;
        if (cancelled) return;
        setTitle(draft.title);
        setBody(draft.body ?? { type: "doc", content: [] });
        setState({ kind: "ready", draft });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({
          kind: "error",
          message: err instanceof Error ? err.message : "网络错误",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [id, router]);

  const value = useMemo(() => ({ title, body }), [title, body]);

  const save = useCallback(
    async (v: { title: string; body: JSONContent }) => {
      const res = await apiFetch(`/drafts/${id}`, {
        method: "PATCH",
        body: JSON.stringify(v),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    },
    [id],
  );

  const enabledValue = state.kind === "ready" ? value : null;
  const { status, lastSavedAt } = useAutosave(
    enabledValue,
    async (v) => {
      if (v) await save(v);
    },
    1500,
  );

  if (state.kind === "loading") {
    return <main className="p-6 text-sm text-zinc-500">加载中…</main>;
  }
  if (state.kind === "not-found") {
    return <main className="p-6 text-sm text-zinc-500">草稿不存在</main>;
  }
  if (state.kind === "forbidden") {
    return <main className="p-6 text-sm text-red-600">无权访问该草稿</main>;
  }
  if (state.kind === "error") {
    return <main className="p-6 text-sm text-red-600">{state.message}</main>;
  }

  return (
    <main className="flex flex-1 flex-col gap-4 px-6 py-6 max-w-3xl w-full mx-auto">
      <header className="flex items-center justify-between gap-4">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="flex-1 text-2xl font-semibold tracking-tight bg-transparent outline-none border-b border-transparent focus:border-zinc-300 dark:focus:border-zinc-700"
          placeholder="未命名草稿"
        />
        <SaveStatus status={status} lastSavedAt={lastSavedAt} />
      </header>
      <TiptapBody initial={body} onChange={setBody} />
    </main>
  );
}
