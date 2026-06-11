const TOKEN_KEY = "bytedance-aigc.accessToken";
const USER_KEY = "bytedance-aigc.user";

export interface AuthUser {
  id: string;
  handle: string;
  /**
   * RBAC mini (2026-06-11)。
   * optional 是为兼容升级前签发的老 token / localStorage 缓存:缺失时视为 AUTHOR(不显示 admin 入口)。
   * 后端 AdminGuard 也对 undefined 做 fail-closed,前后端一致。
   */
  role?: "AUTHOR" | "ADMIN";
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
}

export function getUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function setUser(user: AuthUser): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function apiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
}

export interface ApiFetchOptions extends RequestInit {
  auth?: boolean;
}

export async function apiFetch(path: string, options: ApiFetchOptions = {}): Promise<Response> {
  const { auth = true, headers, ...rest } = options;
  const finalHeaders = new Headers(headers);
  if (!finalHeaders.has("Content-Type") && rest.body) {
    finalHeaders.set("Content-Type", "application/json");
  }
  if (auth) {
    const token = getToken();
    if (token) finalHeaders.set("Authorization", `Bearer ${token}`);
  }
  return fetch(`${apiBaseUrl()}${path}`, { ...rest, headers: finalHeaders });
}
