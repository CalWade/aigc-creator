import { TestCasesClient } from "../_components/TestCasesClient";

export const dynamic = "force-dynamic";

export default function PromptLabTestCasesPage() {
  return (
    <main className="max-w-5xl mx-auto px-6 py-8">
      <div className="flex items-end justify-between mb-6 gap-4">
        <div>
          <h1 className="text-lg font-semibold">测试集</h1>
          <p className="text-sm text-muted-foreground">
            评估 Prompt 准确率用的(input → expected severity)样本库。
          </p>
        </div>
        <nav className="flex items-center gap-3 text-sm">
          <a className="text-muted-foreground hover:text-foreground" href="/admin/prompt-lab">
            ← Prompt 列表
          </a>
        </nav>
      </div>
      <TestCasesClient />
    </main>
  );
}
