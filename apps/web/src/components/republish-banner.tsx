"use client";

interface Props {
  publishedAt: string | null | undefined;
  draftId: string;
}

export function RepublishBanner({ publishedAt, draftId }: Props) {
  if (!publishedAt) return null;
  return (
    <div
      data-testid="republish-banner"
      className="rounded border border-blue-300 bg-blue-50 px-3 py-2 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200 flex items-center justify-between gap-3"
    >
      <span>你正在编辑已发布版本。线上仍保留原版直到你重新发布通过审核。</span>
      <a
        href={`/post/${draftId}`}
        target="_blank"
        rel="noopener noreferrer"
        className="underline hover:text-blue-900 shrink-0"
      >
        查看线上 →
      </a>
    </div>
  );
}
