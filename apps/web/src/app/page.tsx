import { Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import type { FeedResponse, PostDto } from "@bytedance-aigc/shared";
import { DEFAULT_FEED_WEIGHTS } from "@bytedance-aigc/shared";
import { serverFetchJson } from "@/lib/server-fetch";
import { FeedSkeleton } from "./_components/FeedSkeleton";
import { LoadMore } from "./_components/LoadMore";
import { SafeRewriteHintBanner } from "./_components/SafeRewriteHintBanner";
import { WeightDrawer } from "./_components/WeightDrawer";
import { Ticker } from "./_components/Ticker";

/** ISR 30s — 页面可被 CDN 缓存 30 秒,TTFB 大幅降低 */
export const revalidate = 30;

interface PageProps {
  searchParams: Promise<{
    alpha?: string;
    beta?: string;
    gamma?: string;
  }>;
}

async function FeedSection({ searchParams }: PageProps) {
  const sp = await searchParams;
  const alpha = sp.alpha ? Number(sp.alpha) : DEFAULT_FEED_WEIGHTS.alpha;
  const beta = sp.beta ? Number(sp.beta) : DEFAULT_FEED_WEIGHTS.beta;
  const gamma = sp.gamma ? Number(sp.gamma) : DEFAULT_FEED_WEIGHTS.gamma;
  const qs = new URLSearchParams({
    alpha: String(alpha),
    beta: String(beta),
    gamma: String(gamma),
    limit: "20",
  });

  let data: FeedResponse;
  try {
    data = await serverFetchJson<FeedResponse>(`/feed?${qs.toString()}`);
  } catch {
    return (
      <div className="border border-[color:var(--rule)] bg-[color:var(--cream)] p-8 text-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[color:var(--vermilion)] mb-3">
          ⚠ Press Failure
        </p>
        <p className="font-editorial italic text-2xl text-[color:var(--ink-2)] mb-4">
          编辑部今日的版面尚未送达印刷机。
        </p>
        <p className="font-mono text-xs text-[color:var(--ink-3)]">
          请确认 API 服务在 :4000 端口运行,然后刷新本页。
        </p>
      </div>
    );
  }

  const items = data.items;
  if (items.length === 0) {
    return (
      <p className="font-editorial italic text-2xl text-[color:var(--ink-3)] text-center py-16">
        本期版面暂无稿件。 ⸻
      </p>
    );
  }

  const lead = items[0];
  const sub = items.slice(1, 4);
  const grid = items.slice(4);

  return (
    <>
      {/* 头条 + 副条:不对称双栏 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-12">
        <LeadStory post={lead} />
        <aside className="lg:col-span-4 flex flex-col">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[color:var(--vermilion)] mb-3">
            § Also in this issue
          </p>
          <ul className="divide-y divide-[color:var(--rule)]/30 flex-1">
            {sub.map((p, i) => (
              <SubStory key={p.id} post={p} index={i + 2} />
            ))}
          </ul>
        </aside>
      </div>

      {/* 朱砂分隔线 */}
      <div className="rule-vermilion mb-3 animate-rule" />
      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[color:var(--ink-3)] mb-6">
        § Continued · 余下版面
      </p>

      {/* 余下卡片网格 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-12">
        {grid.map((p, i) => (
          <EditorialCard key={p.id} post={p} index={i + 5} priority={i < 2} />
        ))}
      </div>

      <LoadMore initialCursor={data.nextCursor} endpoint={`/feed?${qs.toString()}`} />
    </>
  );
}

function LeadStory({ post }: { post: PostDto }) {
  return (
    <article className="lg:col-span-8 group">
      <Link href={`/post/${post.id}`} className="block">
        <div className="relative aspect-[16/10] mb-5 overflow-hidden border border-[color:var(--rule)]">
          <Image
            src={`/covers/cover-${post.coverIndex}.webp`}
            alt=""
            fill
            sizes="(max-width: 1024px) 100vw, 66vw"
            priority
            className="object-cover grayscale-[15%] group-hover:grayscale-0 group-hover:scale-[1.02] transition-all duration-700"
          />
          <span className="absolute top-4 left-4 bg-[color:var(--vermilion)] text-[color:var(--cream)] font-mono text-[10px] uppercase tracking-[0.22em] px-3 py-1.5">
            ✦ 编辑部头条
          </span>
        </div>
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[color:var(--vermilion)] mb-2">
          № 01 · @{post.authorHandle}
        </p>
        <h2 className="font-display text-[44px] md:text-[56px] leading-[0.95] font-medium tracking-tight mb-4 group-hover:text-[color:var(--vermilion)] transition-colors">
          {post.title}
        </h2>
        <p className="font-body text-[17px] leading-[1.7] text-[color:var(--ink-2)] line-clamp-3 max-w-2xl">
          {post.excerpt}
        </p>
        <div className="mt-5 flex items-center gap-5 font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--ink-3)]">
          <span>Quality · {post.qualityOverall.toFixed(0)}</span>
          <span>Hotness · {post.hotnessMock.toFixed(0)}</span>
          <span className="link-rule text-[color:var(--ink)]">阅读全文 →</span>
        </div>
      </Link>
    </article>
  );
}

function SubStory({ post, index }: { post: PostDto; index: number }) {
  return (
    <li>
      <Link href={`/post/${post.id}`} className="block py-4 group">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[color:var(--ink-3)] mb-1.5">
          № {String(index).padStart(2, "0")} · @{post.authorHandle}
        </p>
        <h3 className="font-display text-[22px] leading-tight font-medium group-hover:text-[color:var(--vermilion)] transition-colors mb-1.5">
          {post.title}
        </h3>
        <p className="font-body text-[13px] text-[color:var(--ink-3)] line-clamp-2">
          {post.excerpt}
        </p>
      </Link>
    </li>
  );
}

function EditorialCard({
  post,
  index,
  priority,
}: {
  post: PostDto;
  index: number;
  priority: boolean;
}) {
  return (
    <article className="group">
      <Link href={`/post/${post.id}`}>
        <div className="relative aspect-[4/3] mb-4 overflow-hidden border border-[color:var(--rule)]">
          <Image
            src={`/covers/cover-${post.coverIndex}.webp`}
            alt=""
            fill
            sizes="(max-width: 768px) 100vw, 33vw"
            priority={priority}
            className="object-cover grayscale-[20%] group-hover:grayscale-0 group-hover:scale-[1.03] transition-all duration-700"
          />
        </div>
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[color:var(--ink-3)] mb-1.5">
          № {String(index).padStart(2, "0")} · @{post.authorHandle}
        </p>
        <h3 className="font-display text-[24px] leading-[1.1] font-medium mb-2 group-hover:text-[color:var(--vermilion)] transition-colors">
          {post.title}
        </h3>
        <p className="font-body text-[14px] text-[color:var(--ink-2)] line-clamp-2 leading-[1.6] mb-3">
          {post.excerpt}
        </p>
        <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--ink-3)] pt-2 border-t border-[color:var(--rule)]/30">
          <span>Q · {post.qualityOverall.toFixed(0)}</span>
          <span className="text-[color:var(--ink-mute)]">/</span>
          <span>H · {post.hotnessMock.toFixed(0)}</span>
        </div>
      </Link>
    </article>
  );
}

export default async function HomePage({ searchParams }: PageProps) {
  return (
    <>
      {/* HERO — Manifesto */}
      <section className="border-b border-[color:var(--rule)] bg-[color:var(--paper)]">
        <div className="max-w-[1400px] mx-auto px-6 py-16 md:py-24 grid grid-cols-1 lg:grid-cols-12 gap-10 items-end">
          <div className="lg:col-span-7">
            <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-[color:var(--vermilion)] mb-6 animate-rise">
              ✦ Manifesto · Issue One
            </p>
            <h2 className="font-display text-[56px] md:text-[88px] lg:text-[112px] leading-[0.92] font-medium tracking-tight text-[color:var(--ink)] animate-rise">
              不取代
              <br />
              <span className="italic text-[color:var(--vermilion)]">作者的笔。</span>
              <br />
              只削平
              <br />
              <span className="italic">最钝的那段。</span>
            </h2>
          </div>

          <div className="lg:col-span-5 lg:pl-8 lg:border-l border-[color:var(--rule)]">
            <p className="font-editorial italic text-[20px] md:text-[22px] leading-[1.55] text-[color:var(--ink-2)] mb-6">
              炽 是一份为创作者打造的 AI 编辑部 —— 我们相信好文章长在人的肌肉记忆里,而不是 prompt
              里。 所以这里有 双轨创作、五阶段审核、双榜分发,但
              <span className="text-[color:var(--vermilion)]">没有自动生成的灵魂</span>。
            </p>

            <div className="grid grid-cols-3 gap-4 pt-6 border-t border-[color:var(--rule)]">
              <Stat n="93.3%" label="安全审核准确率" hint="ChineseHarm-Bench" />
              <Stat n="≤1.8s" label="首屏 LCP" hint="Lighthouse Mobile" />
              <Stat n="30s" label="自动保存" hint="离线 IDB 兜底" />
            </div>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link
                href="/drafts/mine"
                className="btn-ink px-6 py-3 font-mono text-[11px] uppercase tracking-[0.22em]"
              >
                ✎ 进入创作中心
              </Link>
              <Link
                href="/login"
                className="btn-ghost px-6 py-3 font-mono text-[11px] uppercase tracking-[0.22em]"
              >
                作者登录 →
              </Link>
            </div>
          </div>
        </div>

        {/* Ticker — 滚动公告条 */}
        <Ticker />
      </section>

      {/* 三模块叙事 */}
      <section className="border-b border-[color:var(--rule)] bg-[color:var(--cream)]">
        <div className="max-w-[1400px] mx-auto px-6 py-16">
          <div className="flex items-end justify-between mb-10 gap-6 flex-wrap">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-[color:var(--vermilion)] mb-3">
                § Three Pillars
              </p>
              <h3 className="font-display text-[40px] md:text-[56px] font-medium leading-tight">
                三模块 · <span className="italic">双闭环</span>
              </h3>
            </div>
            <p className="font-editorial italic text-[17px] text-[color:var(--ink-2)] max-w-md">
              生产、安全、分发, 三件事彼此独立却咬合 —— 这是编辑部一个世纪以来的老规矩。
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-[color:var(--rule)] border border-[color:var(--rule)]">
            <Pillar
              no="I"
              title="双轨创作"
              en="Dual-Track Authoring"
              body="快速稿一气呵成 / 精耀稿逐段打磨。九张 AI 工具卡服侍编辑部的两种写作节奏 —— 急稿与长稿都能写得像人。"
              link="/drafts/mine"
              cta="开始写作"
            />
            <Pillar
              no="II"
              title="五阶段审核"
              en="Five-Stage Review"
              body="Prompt 审核 → 段落审核 → 发布前审核 → 抽样巡检 → 举报闭环。规则库准确率 0.9333,误判可申诉,词库可热更。"
              link="/me/reports"
              cta="审核手册"
            />
            <Pillar
              no="III"
              title="双榜分发"
              en="Twin-Ranking Feed"
              body="热点榜押时效, 爆文榜押质量。透明权重 (α/β/γ) 由作者自调, 数据回流诊断告诉你为什么没火。"
              link="/rank/hot"
              cta="进入榜单"
            />
          </div>
        </div>
      </section>

      {/* TODAY'S EDITION */}
      <section className="bg-[color:var(--paper)]">
        <div className="max-w-[1400px] mx-auto px-6 py-16">
          <div className="flex items-end justify-between mb-10 flex-wrap gap-4">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-[color:var(--vermilion)] mb-2">
                § Today&apos;s Edition
              </p>
              <h3 className="font-display text-[42px] md:text-[64px] font-medium leading-[0.95] tracking-tight">
                今日<span className="italic">版面</span>
              </h3>
            </div>
            <div className="flex items-center gap-5">
              <Link
                href="/rank/hot"
                className="font-mono text-[11px] uppercase tracking-[0.22em] link-rule"
              >
                热点榜 ↗
              </Link>
              <Link
                href="/rank/best"
                className="font-mono text-[11px] uppercase tracking-[0.22em] link-rule"
              >
                爆文榜 ↗
              </Link>
              <WeightDrawer />
            </div>
          </div>

          <SafeRewriteHintBanner />

          <Suspense fallback={<FeedSkeleton />}>
            <FeedSection searchParams={searchParams} />
          </Suspense>
        </div>
      </section>
    </>
  );
}

function Stat({ n, label, hint }: { n: string; label: string; hint: string }) {
  return (
    <div>
      <p className="font-display text-[28px] md:text-[34px] font-medium leading-none text-[color:var(--ink)]">
        {n}
      </p>
      <p className="font-editorial italic text-[13px] text-[color:var(--ink-2)] mt-2 leading-tight">
        {label}
      </p>
      <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[color:var(--ink-mute)] mt-1">
        {hint}
      </p>
    </div>
  );
}

function Pillar({
  no,
  title,
  en,
  body,
  link,
  cta,
}: {
  no: string;
  title: string;
  en: string;
  body: string;
  link: string;
  cta: string;
}) {
  return (
    <Link
      href={link}
      className="bg-[color:var(--paper)] p-8 md:p-10 group hover:bg-[color:var(--ink)] transition-colors duration-300 flex flex-col"
    >
      <div className="flex items-baseline justify-between mb-8">
        <span className="font-display italic text-[64px] leading-none text-[color:var(--vermilion)] group-hover:text-[color:var(--paper)] transition-colors">
          {no}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[color:var(--ink-3)] group-hover:text-[color:var(--paper-3)] transition-colors">
          {en}
        </span>
      </div>
      <h4 className="font-display text-[34px] font-medium leading-tight mb-4 group-hover:text-[color:var(--cream)] transition-colors">
        {title}
      </h4>
      <p className="font-body text-[15px] leading-[1.7] text-[color:var(--ink-2)] group-hover:text-[color:var(--paper-3)] transition-colors mb-8 flex-1">
        {body}
      </p>
      <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-[color:var(--ink)] group-hover:text-[color:var(--vermilion)] transition-colors">
        {cta} →
      </span>
    </Link>
  );
}
