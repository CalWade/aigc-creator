import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { PostDetailDto } from "@bytedance-aigc/shared";
import { serverFetchJson } from "@/lib/server-fetch";
import { ReportButton } from "@/components/post/ReportButton";
import { PostBody } from "@/components/post/PostBody";
import { QualityBadge } from "@/app/(app)/_components/QualityBadge";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function PostPage({ params }: PageProps) {
  const { id } = await params;
  let post: PostDetailDto;
  try {
    post = await serverFetchJson<PostDetailDto>(`/post/${encodeURIComponent(id)}`);
  } catch {
    notFound();
  }
  return (
    <main className="max-w-3xl mx-auto px-6 py-8">
      <Link href="/" className="text-sm text-muted-foreground hover:text-foreground transition">
        ← 返回信息流
      </Link>
      <article className="mt-4">
        <h1 className="text-3xl font-bold tracking-tight mb-3">{post.title}</h1>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground mb-4">
          <Link href={`/authors/${post.authorId}`} className="hover:text-foreground underline">
            {post.authorHandle}
          </Link>
          <span className="inline-flex items-center gap-1.5">
            · Q {post.qualityOverall.toFixed(0)}
            <QualityBadge score={post.qualityOverall} size="md" />
          </span>
          <span>· H {post.hotnessMock.toFixed(0)}</span>
          <span>· {new Date(post.publishedAt).toLocaleString()}</span>
        </div>
        <div className="relative aspect-video mb-6">
          <Image
            src={`/covers/cover-${post.coverIndex}.webp`}
            alt=""
            fill
            sizes="(max-width: 768px) 100vw, 768px"
            priority
            className="object-cover rounded-lg"
          />
        </div>
        <PostBody body={post.body} />
        <div className="mt-10 pt-6 border-t border-border flex items-center justify-end gap-2">
          <ReportButton postId={post.id} authorId={post.authorId} />
        </div>
      </article>
    </main>
  );
}
