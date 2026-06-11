import { AdminReportsClient } from "./_components/AdminReportsClient";

export const dynamic = "force-dynamic";

export default function AdminReportsPage() {
  return (
    <main className="max-w-5xl mx-auto px-6 py-8">
      <div className="mb-6">
        <h1 className="text-lg font-semibold">举报工作台</h1>
        <p className="text-sm text-muted-foreground">
          处理用户举报 — LLM 推荐处置 · 人工裁决 · 一键下线
        </p>
      </div>
      <AdminReportsClient />
    </main>
  );
}
