import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, ReactionKind } from "@prisma/client";
import type { PostReactionsDto } from "@bytedance-aigc/shared";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class ReactionsService {
  constructor(private readonly prisma: PrismaService) {}

  async getForPost(postId: string, viewerId: string | null): Promise<PostReactionsDto> {
    const [likeCount, collectCount, viewerOwn] = await Promise.all([
      this.prisma.reaction.count({ where: { postId, kind: ReactionKind.LIKE } }),
      this.prisma.reaction.count({ where: { postId, kind: ReactionKind.COLLECT } }),
      viewerId
        ? this.prisma.reaction.findMany({
            where: { postId, userId: viewerId },
            select: { kind: true },
          })
        : Promise.resolve([]),
    ]);
    const liked = viewerOwn.some((r) => r.kind === ReactionKind.LIKE);
    const collected = viewerOwn.some((r) => r.kind === ReactionKind.COLLECT);
    return { likeCount, collectCount, liked, collected };
  }

  async add(userId: string, postId: string, kind: ReactionKind): Promise<PostReactionsDto> {
    const post = await this.prisma.draft.findUnique({
      where: { id: postId },
      select: { id: true, status: true },
    });
    if (!post) throw new NotFoundException({ code: "POST_NOT_FOUND", message: "稿件不存在" });
    if (post.status !== "PUBLISHED") {
      throw new NotFoundException({ code: "POST_NOT_FOUND", message: "稿件未发布" });
    }
    try {
      await this.prisma.reaction.create({ data: { userId, postId, kind } });
    } catch (err) {
      // P2002: 唯一约束违反 = 已经存在该 reaction,幂等返回当前状态
      if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== "P2002") {
        throw err;
      }
    }
    return this.getForPost(postId, userId);
  }

  async remove(userId: string, postId: string, kind: ReactionKind): Promise<PostReactionsDto> {
    await this.prisma.reaction
      .delete({ where: { userId_postId_kind: { userId, postId, kind } } })
      .catch((err: unknown) => {
        // P2025: 不存在记录 = 幂等成功
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
          return null;
        }
        throw err;
      });
    return this.getForPost(postId, userId);
  }
}
