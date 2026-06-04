/**
 * SSR 用的 server-side fetch:无 token,跑在 Next.js Server Component。
 * 命中公开端点(/feed /rank /post/:id /authors/:id/posts)。
 */
const BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000";

export async function serverFetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { ...init, cache: "no-store" });
  if (!res.ok) {
    throw new Error(`server-fetch ${path} ${res.status}`);
  }
  return (await res.json()) as T;
}
