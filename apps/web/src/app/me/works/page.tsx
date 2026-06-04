"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch, clearToken, getToken } from "@/lib/auth";

interface WorkItem {
  id: string;
  title: string;
  status: "DRAFT" | "PUBLISHED";
  publishedAt: string | null;
  qualityOverall: number;
  updatedAt: string;
}

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; works: WorkItem[] }
  | { kind: "error"; message: string };

const FILTERS = [
  { key: "ALL", label: "全部" },
  { key: "PUBLISHED", label: "已发布" },
  { key: "DRAFT", label: "草稿" },
] as const;

type Filter = (typeof FILTERS)[number]["key"];

export default function MyWorksPage() {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("ALL");
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    let cancelled = false;
    setState({ kind: "loading" });
    void apiFetch(`/me/works?status=${filter}&limit=50`)
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 401) {
          clearToken();
          router.replace("/login");
          return;
        }
        if (!res.ok) {
          setState({ kind: "error", message: `加载失败 (HTTP ${res.status})` });
          return;
        }
        const json = (await res.json()) as { items: WorkItem[] };
        if (cancelled) return;
        setState({ kind: "ready", works: json.items });
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
  }, [filter, router]);

  return (
    <main className="max-w-3xl mx-auto px-6 py-8">
      <h1 className="text-2xl font-semibold mb-4">我的作品</h1>
      <div className="flex gap-2 mb-4">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1 rounded text-sm ${
              filter === f.key ? "bg-black text-white" : "bg-gray-100 text-gray-700"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>
      {state.kind === "loading" && <p className="text-sm text-gray-500">加载中…</p>}
      {state.kind === "error" && <p className="text-sm text-red-600">{state.message}</p>}
      {state.kind === "ready" && state.works.length === 0 && (
        <p className="text-sm text-gray-500">还没有作品。</p>
      )}
      {state.kind === "ready" && state.works.length > 0 && (
        <ul className="flex flex-col gap-3">
          {state.works.map((w) => (
            <li key={w.id}>
              <Link
                href={w.status === "PUBLISHED" ? `/post/${w.id}` : `/drafts/${w.id}`}
                className="flex items-center justify-between rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4 shadow-sm hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors"
              >
                <div className="flex flex-col gap-1 min-w-0">
                  <h2 className="text-base font-medium truncate">{w.title}</h2>
                  <p className="text-xs text-zinc-500 font-mono truncate">{w.id}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={
                      w.status === "PUBLISHED"
                        ? "inline-flex items-center rounded-full bg-emerald-100 text-emerald-700 px-2 py-0.5 text-xs font-medium"
                        : "inline-flex items-center rounded-full bg-zinc-100 text-zinc-700 px-2 py-0.5 text-xs font-medium"
                    }
                  >
                    {w.status}
                  </span>
                  <span className="text-xs text-zinc-500">Q {w.qualityOverall.toFixed(0)}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
