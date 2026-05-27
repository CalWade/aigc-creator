import Link from "next/link";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        AI 创作者辅助生产与分发平台
      </h1>
      <p className="max-w-md text-base text-zinc-600 dark:text-zinc-400">
        字节头条 AI 前端训练营项目 · 开发中
      </p>
      <div className="flex gap-3">
        <Link
          href="/login"
          className="rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 transition-colors"
        >
          登录
        </Link>
        <Link
          href="/drafts/mine"
          className="rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-900 text-sm font-medium px-4 py-2 transition-colors"
        >
          我的草稿
        </Link>
      </div>
    </main>
  );
}
