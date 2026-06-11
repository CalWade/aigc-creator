import { PromptListClient } from "./_components/PromptListClient";

export const dynamic = "force-dynamic";

export default function PromptLabPage() {
  return (
    <main className="max-w-5xl mx-auto px-6 py-8">
      <div className="flex items-end justify-between mb-6 gap-4">
        <div>
          <h1 className="text-lg font-semibold">Prompt 管理</h1>
          <p className="text-sm text-muted-foreground">
            平台 Prompt 列表,按 tool 过滤、复制 ID 用于评估、按 tool 一键回滚。
          </p>
        </div>
        <nav className="flex items-center gap-3 text-sm">
          <a
            className="text-muted-foreground hover:text-foreground"
            href="/admin/prompt-lab/test-cases"
          >
            测试集
          </a>
          <a
            className="text-muted-foreground hover:text-foreground"
            href="/admin/prompt-lab/eval-runs"
          >
            评估
          </a>
        </nav>
      </div>
      <PromptListClient />
    </main>
  );
}
