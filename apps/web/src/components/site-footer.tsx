import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-[color:var(--rule)] bg-[color:var(--paper-2)]">
      <div className="max-w-[1400px] mx-auto px-6 py-10 grid grid-cols-1 md:grid-cols-12 gap-8">
        <div className="md:col-span-5">
          <p className="font-display italic text-3xl leading-tight">
            「让作者写他想写的,
            <br />让 AI 做它该做的。」
          </p>
          <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.22em] text-[color:var(--ink-3)]">
            — 编辑部三角色叙事 · 人机协同准则
          </p>
        </div>

        <div className="md:col-span-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[color:var(--ink-3)] mb-3">
            § Sections
          </p>
          <ul className="space-y-1.5 font-editorial text-[15px]">
            <li>
              <Link href="/" className="link-rule">
                信息流 Feed
              </Link>
            </li>
            <li>
              <Link href="/rank/hot" className="link-rule">
                热点榜 Hot
              </Link>
            </li>
            <li>
              <Link href="/rank/best" className="link-rule">
                爆文榜 Best
              </Link>
            </li>
            <li>
              <Link href="/me/works" className="link-rule">
                创作中心 Studio
              </Link>
            </li>
          </ul>
        </div>

        <div className="md:col-span-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[color:var(--ink-3)] mb-3">
            § Author
          </p>
          <ul className="space-y-1.5 font-editorial text-[15px]">
            <li>
              <Link href="/login" className="link-rule">
                作者登录
              </Link>
            </li>
            <li>
              <Link href="/drafts/mine" className="link-rule">
                我的草稿
              </Link>
            </li>
            <li>
              <Link href="/me/assets" className="link-rule">
                素材库
              </Link>
            </li>
            <li>
              <Link href="/me/reports" className="link-rule">
                举报记录
              </Link>
            </li>
          </ul>
        </div>

        <div className="md:col-span-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[color:var(--ink-3)] mb-3">
            § Colophon
          </p>
          <p className="font-editorial italic text-[14px] text-[color:var(--ink-2)] leading-relaxed">
            Set in <em>Fraunces</em> &<br />
            <em>Instrument Serif</em>.<br />
            Pressed on Next.js 16.
            <br />
            字节头条 AI 训练营.
          </p>
        </div>
      </div>

      <div className="border-t border-[color:var(--rule)]/40">
        <div className="max-w-[1400px] mx-auto px-6 py-3 flex items-center justify-between text-[10px] font-mono uppercase tracking-[0.18em] text-[color:var(--ink-3)]">
          <span>© 2026 CHÌ Editorial · All Rights Reserved</span>
          <span className="hidden md:inline">No Generative Slop · No Algorithmic Hostage</span>
          <span>v1.0 · 30 Phases · 152/162/80 Passed</span>
        </div>
      </div>
    </footer>
  );
}
