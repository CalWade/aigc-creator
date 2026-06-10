"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { getUser, getToken, clearToken, type AuthUser } from "@/lib/auth";

const NAV = [
  { href: "/", label: "信息流", en: "Feed" },
  { href: "/rank/hot", label: "热点榜", en: "Hot" },
  { href: "/rank/best", label: "爆文榜", en: "Best" },
  { href: "/drafts/mine", label: "我的草稿", en: "Drafts" },
  { href: "/me/works", label: "创作中心", en: "Studio" },
];

function todayInChinese() {
  const d = new Date();
  const w = ["日", "一", "二", "三", "四", "五", "六"][d.getDay()];
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日 · 星期${w}`;
}

function issueNo() {
  // 用今天距 2026-01-01 的天数当"刊号",显得像有连续印刷的杂志
  const start = new Date(2026, 0, 1).getTime();
  const days = Math.floor((Date.now() - start) / (1000 * 60 * 60 * 24)) + 1;
  return String(days).padStart(4, "0");
}

/** 订阅 storage 事件,跨标签同步登录态;SSR 时返回 null。 */
function subscribeAuth(cb: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
}

function readAuth(): { user: AuthUser | null; hasToken: boolean } {
  if (typeof window === "undefined") return { user: null, hasToken: false };
  return { user: getUser(), hasToken: !!getToken() };
}

const EMPTY = { user: null as AuthUser | null, hasToken: false };
function getServerSnapshot() {
  return EMPTY;
}

export function SiteMasthead() {
  const pathname = usePathname();
  const auth = useSyncExternalStore(subscribeAuth, readAuth, getServerSnapshot);
  const isLoggedIn = auth.hasToken && !!auth.user;

  return (
    <header className="bg-[color:var(--paper)] border-b border-[color:var(--rule)]">
      {/* 顶部超细资讯条:刊号 / 日期 / 当日精选数 */}
      <div className="border-b border-[color:var(--rule)]/40">
        <div className="max-w-[1400px] mx-auto px-6 py-1.5 flex items-center justify-between text-[10px] font-mono uppercase tracking-[0.18em] text-[color:var(--ink-3)]">
          <span>NO. {issueNo()} · 创刊于 二〇二六</span>
          <span className="hidden md:inline">{todayInChinese()}</span>
          <span>三模块 · 双闭环 · 五阶审核</span>
        </div>
      </div>

      {/* 报头主区:左边小标 — 中间 LOGO — 右边操作 */}
      <div className="masthead-rule">
        <div className="max-w-[1400px] mx-auto px-6 py-5 grid grid-cols-12 items-end gap-4">
          {/* 左侧:刊物副标 */}
          <div className="col-span-3 hidden md:block">
            <p className="font-editorial italic text-[15px] leading-tight text-[color:var(--ink-2)]">
              An Editorial Atelier
              <br />
              for Human–AI Co-Writers
            </p>
          </div>

          {/* 中间:LOGO 报头 */}
          <Link href="/" className="col-span-12 md:col-span-6 flex flex-col items-center group">
            <span className="font-mono text-[10px] uppercase tracking-[0.4em] text-[color:var(--ink-3)] mb-1">
              The Creator&apos;s Atelier
            </span>
            <h1 className="font-display text-[64px] md:text-[88px] leading-[0.85] font-medium text-[color:var(--ink)] tracking-tight">
              <span className="italic">炽</span>
              <span className="mx-3 text-[color:var(--vermilion)]">·</span>
              <span className="not-italic">CHÌ</span>
            </h1>
            <span className="font-editorial italic text-[14px] text-[color:var(--ink-3)] mt-1.5 group-hover:text-[color:var(--vermilion)] transition-colors">
              ⸻ AI 创作者辅助生产与分发平台 ⸻
            </span>
          </Link>

          {/* 右侧:登录态操作 */}
          <div className="col-span-3 hidden md:flex flex-col items-end gap-2 text-sm">
            {isLoggedIn ? (
              <>
                <span className="font-mono text-[11px] uppercase tracking-widest text-[color:var(--ink-3)]">
                  ✶ 在册作者
                </span>
                <span className="font-editorial italic text-[18px]">@{auth.user!.handle}</span>
                <button
                  type="button"
                  onClick={() => {
                    clearToken();
                    window.location.href = "/";
                  }}
                  className="font-mono text-[10px] uppercase tracking-[0.2em] text-[color:var(--ink-3)] link-rule"
                >
                  退出登录 ↗
                </button>
              </>
            ) : (
              <>
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--ink-3)]">
                  Sign in to publish
                </span>
                <Link
                  href="/login"
                  className="btn-ink px-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em]"
                >
                  作者登录 →
                </Link>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 主导航条 */}
      <nav className="border-b border-[color:var(--rule)] bg-[color:var(--cream)]">
        <div className="max-w-[1400px] mx-auto px-6 flex items-center justify-between">
          <ul className="flex items-stretch divide-x divide-[color:var(--rule)]/40">
            {NAV.map((item) => {
              const active =
                pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`block px-5 py-3 group relative ${
                      active ? "text-[color:var(--vermilion)]" : "text-[color:var(--ink-2)]"
                    }`}
                  >
                    {active && (
                      <span className="absolute top-0 left-0 right-0 h-[3px] bg-[color:var(--vermilion)]" />
                    )}
                    <span className="block font-editorial italic text-[15px] leading-tight">
                      {item.label}
                    </span>
                    <span className="block font-mono text-[9px] uppercase tracking-[0.2em] text-[color:var(--ink-mute)] mt-0.5">
                      {item.en}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>

          <div className="hidden md:flex items-center gap-3 pr-2">
            {isLoggedIn ? (
              <Link
                href="/drafts/mine"
                className="btn-ink px-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em]"
              >
                ✎ 开始写作
              </Link>
            ) : (
              <Link
                href="/login"
                className="btn-ghost px-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em]"
              >
                ✎ 开始写作
              </Link>
            )}
          </div>
        </div>
      </nav>
    </header>
  );
}
