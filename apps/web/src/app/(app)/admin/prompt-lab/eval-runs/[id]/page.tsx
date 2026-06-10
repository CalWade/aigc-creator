import { CompareClient } from "../../_components/CompareClient";

export const dynamic = "force-dynamic";

export default async function PromptLabComparePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <main className="max-w-5xl mx-auto px-6 py-8">
      <div className="mb-6">
        <h1 className="text-lg font-semibold">候选 vs 当前对比</h1>
        <p className="text-sm text-muted-foreground">accuracy 提升才允许上线;下降则被系统拒绝。</p>
      </div>
      <CompareClient evalRunId={id} />
    </main>
  );
}
