import { AdminReportsClient } from "./_components/AdminReportsClient";

export const dynamic = "force-dynamic";

export default async function AdminReportsPage() {
  return (
    <main className="max-w-5xl mx-auto px-6 py-8">
      <h1 className="text-lg font-semibold mb-6">举报工作台</h1>
      <AdminReportsClient />
    </main>
  );
}
