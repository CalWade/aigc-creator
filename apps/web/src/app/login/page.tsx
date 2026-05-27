"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { apiFetch, setToken, setUser, type AuthUser } from "@/lib/auth";

interface LoginResponse {
  accessToken: string;
  user: AuthUser;
}

export default function LoginPage() {
  const router = useRouter();
  const [handle, setHandle] = useState("demo");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch("/auth/login", {
        method: "POST",
        body: JSON.stringify({ handle }),
        auth: false,
      });
      if (!res.ok) {
        const msg = res.status === 401 ? "用户不存在" : `登录失败 (HTTP ${res.status})`;
        setError(msg);
        return;
      }
      const data = (await res.json()) as LoginResponse;
      setToken(data.accessToken);
      setUser(data.user);
      router.push("/drafts/mine");
    } catch (err) {
      setError(err instanceof Error ? err.message : "网络错误");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm flex flex-col gap-4 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-6 shadow-sm"
      >
        <h1 className="text-xl font-semibold tracking-tight">登录</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          训练营 demo：输入 handle 即可登录（默认 <code>demo</code>）。
        </p>
        <label className="flex flex-col gap-1 text-sm">
          <span>Handle</span>
          <input
            type="text"
            name="handle"
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            required
            autoComplete="username"
            className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-medium px-4 py-2 transition-colors"
        >
          {submitting ? "登录中…" : "登录"}
        </button>
      </form>
    </main>
  );
}
