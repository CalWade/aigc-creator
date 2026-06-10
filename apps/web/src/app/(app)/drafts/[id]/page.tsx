import { DraftEditor } from "@/components/draft-editor";

export default async function DraftDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tool?: string; topic?: string; openFast?: string }>;
}) {
  const { id } = await params;
  const { tool, topic, openFast } = await searchParams;
  return (
    <DraftEditor
      id={id}
      initialTool={tool}
      initialTopic={topic}
      initialOpenFast={openFast === "1"}
    />
  );
}
