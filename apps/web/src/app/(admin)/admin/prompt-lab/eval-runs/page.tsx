import { EvalRunsClient } from "../_components/EvalRunsClient";

export const dynamic = "force-dynamic";

export default function PromptLabEvalRunsPage() {
  return (
    <main className="max-w-5xl mx-auto px-6 py-8">
      <div className="flex items-end justify-between mb-6 gap-4">
        <div>
          <h1 className="text-lg font-semibold">评估运行</h1>
          <p className="text-sm text-muted-foreground">
            候选 Prompt 在测试集上的准确率历史,点击行查看对比与一键上线
          </p>
        </div>
        <nav className="flex items-center gap-3 text-sm">
          <a
            className="text-muted-foreground hover:text-foreground transition-colors"
            href="/admin/prompt-lab"
          >
            ← Prompt 列表
          </a>
        </nav>
      </div>
      <EvalRunsClient />
    </main>
  );
}
