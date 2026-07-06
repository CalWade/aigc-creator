import { Controller, Get, NotFoundException, Param, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import type { PostDetailDto, PostDto } from "@aigc-creator/shared";
import { hotnessMockBase, normalizeHotness } from "@aigc-creator/shared";
import { JwtService } from "@nestjs/jwt";
import { Public } from "../auth/public.decorator";
import type { JwtPayload } from "../auth/jwt-payload.interface";
import { FeedService } from "./feed.service";
import { ReactionsService } from "./reactions.service";
import { AuthorPostsQueryDto } from "./feed.dto";

@Controller()
export class PostsController {
  constructor(
    private readonly feed: FeedService,
    private readonly reactions: ReactionsService,
    private readonly jwtService: JwtService,
  ) {}

  @Public()
  @Get("post/:id")
  async getPost(@Param("id") id: string, @Req() req: Request): Promise<PostDetailDto> {
    const draft = await this.feed.getPostDetail(id);
    if (!draft) {
      throw new NotFoundException({ code: "POST_NOT_FOUND", message: "稿件不存在或已下架" });
    }

    const viewerId = await softVerifyUserId(req, this.jwtService);
    const reactions = await this.reactions.getForPost(id, viewerId);

    const hotnessRaw = hotnessMockBase(draft.id);
    const quality = readQ(draft.lastReview?.quality);
    // Phase 2.15:优先 publishedTitle/publishedBody,二发期间老线上版仍可见
    const liveTitle = draft.publishedTitle ?? draft.title;
    const liveBody = draft.publishedBody ?? draft.body;
    return {
      id: draft.id,
      title: liveTitle,
      authorId: draft.authorId,
      authorHandle: draft.author.handle,
      publishedAt: (draft.publishedAt ?? draft.updatedAt).toISOString(),
      qualityOverall: quality,
      hotnessMock: normalizeHotness(hotnessRaw, [hotnessRaw]),
      coverIndex: (Math.abs(hashId(draft.id)) % 5) + 1,
      excerpt: "",
      trendingMatch: false,
      body: liveBody,
      qualityRecommendation: draft.lastReview?.recommendation ?? "ALLOW",
      reactions,
    };
  }

  @Public()
  @Get("authors/:id/posts")
  async getAuthorPosts(
    @Param("id") id: string,
    @Query() q: AuthorPostsQueryDto,
  ): Promise<{ items: PostDto[] }> {
    const items = await this.feed.getAuthorPosts(id, q.limit);
    return { items };
  }
}

/**
 * 软鉴权:有合法 token 拿 sub,无 token 或 token 失效返回 null。
 * 用于公开路由仍想"看到"登录态(如 reactions.liked)。
 */
async function softVerifyUserId(req: Request, jwtService: JwtService): Promise<string | null> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return null;
  try {
    const decoded = await jwtService.verifyAsync<JwtPayload>(auth.slice(7));
    return decoded.sub;
  } catch {
    return null;
  }
}

function readQ(q: unknown): number {
  if (typeof q !== "object" || q === null) return 0;
  const v = (q as Record<string, unknown>).overall;
  return typeof v === "number" ? v : 0;
}

function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return h;
}
