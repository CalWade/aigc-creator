import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Draft, Review } from "@prisma/client";

import { PrismaService } from "../prisma/prisma.service";

const DEFAULT_REASON = "平台审核下线";

export interface AdminPostView {
  id: string;
  title: string;
  status: "DRAFT" | "REVIEWING" | "PUBLISHED" | "OFFLINE";
  authorId: string;
  authorHandle: string;
  publishedAt: string | null;
  updatedAt: string;
  offlineReason: string | null;
  offlineAt: string | null;
  body: unknown;
  qualityOverall: number;
  qualityRecommendation: "ALLOW" | "WARN" | "BLOCK" | null;
}

@Injectable()
export class AdminContentService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 直接下线作品(不经过举报)。已 OFFLINE 拒绝;PUBLISHED 才允许。
   * DRAFT 没意义(还没上架),也拒。
   */
  async offlineDraft(draftId: string, reason: string | undefined): Promise<{ ok: true }> {
    const draft = await this.prisma.draft.findUnique({
      where: { id: draftId },
      select: { id: true, status: true },
    });
    if (!draft) {
      throw new NotFoundException({ code: "DRAFT_NOT_FOUND", message: "作品不存在" });
    }
    if (draft.status === "OFFLINE") {
      throw new BadRequestException({
        code: "ALREADY_OFFLINE",
        message: "该作品已下线",
      });
    }
    if (draft.status === "DRAFT") {
      throw new BadRequestException({
        code: "NOT_PUBLISHED",
        message: "该作品未发布,无需下线",
      });
    }
    await this.prisma.draft.update({
      where: { id: draftId },
      data: {
        status: "OFFLINE",
        offlineAt: new Date(),
        offlineReason: (reason?.trim() || DEFAULT_REASON).slice(0, 200),
      },
    });
    return { ok: true };
  }

  /**
   * Admin 预览任意状态作品(含 OFFLINE / DRAFT),不受公开 /post/:id 的 PUBLISHED 限制。
   */
  async getPost(draftId: string): Promise<AdminPostView> {
    const draft = await this.prisma.draft.findUnique({
      where: { id: draftId },
      include: {
        author: { select: { handle: true } },
        lastReview: { select: { quality: true, recommendation: true } },
      },
    });
    if (!draft) {
      throw new NotFoundException({ code: "DRAFT_NOT_FOUND", message: "作品不存在" });
    }
    return toAdminView(draft);
  }
}

type DraftWithJoins = Draft & {
  author: { handle: string };
  lastReview: Pick<Review, "quality" | "recommendation"> | null;
};

function toAdminView(d: DraftWithJoins): AdminPostView {
  return {
    id: d.id,
    title: d.title,
    status: d.status,
    authorId: d.authorId,
    authorHandle: d.author.handle,
    publishedAt: d.publishedAt?.toISOString() ?? null,
    updatedAt: d.updatedAt.toISOString(),
    offlineReason: d.offlineReason ?? null,
    offlineAt: d.offlineAt?.toISOString() ?? null,
    body: d.body,
    qualityOverall: readQualityOverall(d.lastReview?.quality),
    qualityRecommendation: d.lastReview?.recommendation ?? null,
  };
}

function readQualityOverall(quality: unknown): number {
  if (typeof quality !== "object" || quality === null) return 0;
  const v = (quality as Record<string, unknown>).overall;
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}
