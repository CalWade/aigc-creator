import Link from "next/link";
import Image from "next/image";
import type { PostDto } from "@aigc-creator/shared";
import { Card, CardContent } from "../ui/card";

interface PostCardProps {
  post: PostDto;
  priority?: boolean;
  index?: number;
}

export function PostCard({ post, priority = false }: PostCardProps) {
  return (
    <Card className="group/card overflow-hidden py-0 gap-0 hover:border-foreground/20 hover:shadow-md transition-all">
      <Link href={`/post/${post.id}`} className="block group">
        <div className="relative aspect-[16/10] bg-muted overflow-hidden">
          <Image
            src={`/covers/cover-${post.coverIndex}.webp`}
            alt=""
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            priority={priority}
            className="object-cover group-hover:scale-[1.02] transition-transform duration-300"
          />
        </div>
        <CardContent className="p-4">
          <h3 className="text-[16px] font-medium leading-snug text-foreground line-clamp-2 group-hover:text-brand transition-colors">
            {post.title}
          </h3>
          <p className="mt-2 text-[13px] text-muted-foreground line-clamp-2 leading-[1.55]">
            {post.excerpt}
          </p>
          <div className="mt-3 flex items-center gap-3 text-[12px] text-muted-foreground">
            <span className="truncate max-w-[120px]">@{post.authorHandle}</span>
            <span className="text-muted-foreground/60">·</span>
            <span>Q · {post.qualityOverall.toFixed(0)}</span>
            <span className="text-muted-foreground/60">·</span>
            <span>H · {post.hotnessMock.toFixed(0)}</span>
            {post.trendingMatch && (
              <>
                <span className="text-muted-foreground/60">·</span>
                <span className="text-brand">热榜相关</span>
              </>
            )}
          </div>
        </CardContent>
      </Link>
    </Card>
  );
}
