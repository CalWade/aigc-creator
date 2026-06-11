import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { Draft, Review } from "@prisma/client";

import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";

const DEFAULT_REASON = "平台审核下线";

export interface AdminStats {
  totalUsers: number;
  totalAuthors: number;
  totalAdmins: number;
  totalDrafts: number;
  totalPublished: number;
  totalOffline: number;
  totalReviewing: number;
  pendingReports: number;
  resolvedReports: number;
  totalReviews: number;
  blockRate: number;
  warnRate: number;
  avgQualityOverall: number;
  pendingSampleAudits: number;
  totalReactions: number;
  totalAssets: number;
}

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
  private readonly logger = new Logger(AdminContentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async offlineDraft(draftId: string, reason: string | undefined): Promise<{ ok: true }> {
    const draft = await this.prisma.draft.findUnique({
      where: { id: draftId },
      select: { id: true, status: true, authorId: true, title: true },
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

    try {
      await this.notifications.create({
        userId: draft.authorId,
        type: "POST_TAKEN_DOWN",
        title: "作品被下线",
        body: `《${draft.title}》因${reason?.trim() || DEFAULT_REASON}被下线`,
        draftId,
      });
    } catch (err) {
      this.logger.error(`offline notification failed for draft ${draftId}`, err as Error);
    }

    return { ok: true };
  }

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

  async getStats(): Promise<AdminStats> {
    const [
      userCounts,
      draftCounts,
      reportCounts,
      totalReviews,
      blockCount,
      warnCount,
      recentReviews,
      sampleAuditPending,
      reactionCount,
      assetCount,
    ] = await Promise.all([
      this.prisma.user.groupBy({ by: ["role"], _count: true }),
      this.prisma.draft.groupBy({ by: ["status"], _count: true }),
      this.prisma.report.groupBy({ by: ["status"], _count: true }),
      this.prisma.review.count(),
      this.prisma.review.count({ where: { recommendation: "BLOCK" } }),
      this.prisma.review.count({ where: { recommendation: "WARN" } }),
      this.prisma.review.findMany({
        where: { stage: "PREFLIGHT" },
        select: { quality: true },
        take: 500,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.sampleAudit.count({ where: { status: "PENDING" } }),
      this.prisma.reaction.count(),
      this.prisma.asset.count(),
    ]);

    const totalUsers = userCounts.reduce((s, u) => s + u._count, 0);
    const totalAuthors = userCounts.find((u) => u.role === "AUTHOR")?._count ?? 0;
    const totalAdmins = userCounts.find((u) => u.role === "ADMIN")?._count ?? 0;

    const totalDrafts = draftCounts.reduce((s, d) => s + d._count, 0);
    const totalPublished = draftCounts.find((d) => d.status === "PUBLISHED")?._count ?? 0;
    const totalOffline = draftCounts.find((d) => d.status === "OFFLINE")?._count ?? 0;
    const totalReviewing = draftCounts.find((d) => d.status === "REVIEWING")?._count ?? 0;

    const pendingReports = reportCounts.find((r) => r.status === "PENDING")?._count ?? 0;
    const resolvedReports = reportCounts.find((r) => r.status === "RESOLVED")?._count ?? 0;

    const blockRate = totalReviews > 0 ? blockCount / totalReviews : 0;
    const warnRate = totalReviews > 0 ? warnCount / totalReviews : 0;

    let qualitySum = 0;
    let qualityCount = 0;
    for (const r of recentReviews) {
      const v = readQualityOverall(r.quality);
      if (v > 0) {
        qualitySum += v;
        qualityCount++;
      }
    }
    const avgQualityOverall = qualityCount > 0 ? qualitySum / qualityCount : 0;

    return {
      totalUsers,
      totalAuthors,
      totalAdmins,
      totalDrafts,
      totalPublished,
      totalOffline,
      totalReviewing,
      pendingReports,
      resolvedReports,
      totalReviews,
      blockRate,
      warnRate,
      avgQualityOverall,
      pendingSampleAudits: sampleAuditPending,
      totalReactions: reactionCount,
      totalAssets: assetCount,
    };
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
