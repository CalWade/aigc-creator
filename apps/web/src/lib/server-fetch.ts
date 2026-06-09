/**
 * SSR 用的 server-side fetch:无 token,跑在 Next.js Server Component。
 * 命中公开端点(/feed /rank /post/:id /authors/:id/posts)。
 * 默认 ISR 30s;可传 revalidate 覆盖或 false 禁用(等价 no-store)。
 */
const BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export async function serverFetchJson<T>(
  path: string,
  init?: RequestInit & { revalidate?: number | false },
): Promise<T> {
  const { revalidate = 30, ...rest } = init ?? {};
  const next = revalidate === false ? undefined : { revalidate };
  const cache = revalidate === false ? "no-store" : undefined;
  const res = await fetch(`${BASE}${path}`, { ...rest, cache, next });
  if (!res.ok) {
    throw new Error(`server-fetch ${path} ${res.status}`);
  }
  return (await res.json()) as T;
}
