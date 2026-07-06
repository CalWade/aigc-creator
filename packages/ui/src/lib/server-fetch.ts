/**
 * SSR 用的 server-side fetch:无 token,跑在 Next.js Server Component。
 * 命中公开端点(/feed /rank /post/:id /authors/:id/posts)。
 * 默认 ISR 30s;可传 revalidate 覆盖或 false 禁用(等价 no-store)。
 *
 * SSR 环境优先使用 INTERNAL_API_URL (内网直连,避免公网 TLS 开销)；
 * 客户端 fallback 到 NEXT_PUBLIC_API_BASE_URL。
 */
const BASE =
  typeof window === "undefined"
    ? (process.env.INTERNAL_API_URL ??
      process.env.NEXT_PUBLIC_API_BASE_URL ??
      "http://127.0.0.1:4000")
    : (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000");

export async function serverFetchJson<T>(
  path: string,
  init?: RequestInit & { revalidate?: number | false },
): Promise<T> {
  const { revalidate = 30, ...rest } = init ?? {};
  const next = revalidate === false ? undefined : { revalidate };
  const cache = revalidate === false ? "no-store" : undefined;
  // Next.js 扩展了 RequestInit，加入 `next: { revalidate }` 字段。
  // packages/ui 不引入 next-env.d.ts，所以这里用 `as RequestInit` 显式抹平。
  const res = await fetch(`${BASE}${path}`, { ...rest, cache, next } as RequestInit);
  if (!res.ok) {
    throw new Error(`server-fetch ${path} ${res.status}`);
  }
  return (await res.json()) as T;
}
