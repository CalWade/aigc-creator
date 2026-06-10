import Link from "next/link";
import Image from "next/image";
import type { PostDto } from "@bytedance-aigc/shared";

interface PostCardProps {
  post: PostDto;
  priority?: boolean;
  index?: number;
}

export function PostCard({ post, priority = false, index }: PostCardProps) {
  return (
    <article className="group">
      <Link href={`/post/${post.id}`}>
        <div className="relative aspect-[4/3] mb-4 overflow-hidden border border-[color:var(--rule)]">
          <Image
            src={`/covers/cover-${post.coverIndex}.webp`}
            alt=""
            fill
            sizes="(max-width: 768px) 100vw, 33vw"
            priority={priority}
            className="object-cover grayscale-[20%] group-hover:grayscale-0 group-hover:scale-[1.03] transition-all duration-700"
          />
        </div>
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[color:var(--ink-3)] mb-1.5">
          {index !== undefined ? `№ ${String(index).padStart(2, "0")}  ·  ` : ""}@
          {post.authorHandle}
        </p>
        <h3 className="font-display text-[24px] leading-[1.1] font-medium mb-2 group-hover:text-[color:var(--vermilion)] transition-colors">
          {post.title}
        </h3>
        <p className="font-body text-[14px] text-[color:var(--ink-2)] line-clamp-2 leading-[1.6] mb-3">
          {post.excerpt}
        </p>
        <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--ink-3)] pt-2 border-t border-[color:var(--rule)]/30">
          <span>Q · {post.qualityOverall.toFixed(0)}</span>
          <span className="text-[color:var(--ink-mute)]">/</span>
          <span>H · {post.hotnessMock.toFixed(0)}</span>
        </div>
      </Link>
    </article>
  );
}
