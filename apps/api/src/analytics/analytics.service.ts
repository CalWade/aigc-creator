import { Injectable } from "@nestjs/common";
import type { AnalyticsResponse, AnalyticsTotals, AnalyticsTopPost } from "@bytedance-aigc/shared";

import { PrismaService } from "../prisma/prisma.service";

const PREMIUM_THRESHOLD = 80;
const TOP_LIMIT = 5;

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 看板单接口:聚合该作者所有 Draft 的 PostStat + 最近 Review.quality.overall。
   * 数据源是 demo 期 mock(seed 写入),真实埋点写入 PostStat 留 phase 3。
   */
  async getMyAnalytics(userId: string): Promise<AnalyticsResponse> {
    const drafts = await this.prisma.draft.findMany({
      where: { authorId: userId },
      select: {
        id: true,
        title: true,
        status: true,
        publishedAt: true,
        lastReview: { select: { quality: true } },
        stat: {
          select: {
            impression: true,
            click: true,
            like: true,
            collect: true,
            share: true,
            report: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    let totalDrafts = 0;
    let totalPublished = 0;
    let totalOffline = 0;
    let totalImpression = 0;
    let totalClick = 0;
    let totalLike = 0;
    let totalCollect = 0;
    let totalShare = 0;
    let totalReport = 0;
    let qualitySum = 0;
    let premiumCount = 0;

    const publishedDrafts: typeof drafts = [];

    for (const d of drafts) {
      totalDrafts++;
      if (d.status === "PUBLISHED") {
        totalPublished++;
        publishedDrafts.push(d);
        const q = readQualityOverall(d.lastReview?.quality);
        qualitySum += q;
        if (q >= PREMIUM_THRESHOLD) premiumCount++;
      } else if (d.status === "OFFLINE") {
        totalOffline++;
      }
      const s = d.stat;
      if (s) {
        totalImpression += s.impression;
        totalClick += s.click;
        totalLike += s.like;
        totalCollect += s.collect;
        totalShare += s.share;
        totalReport += s.report;
      }
    }

    const interactions = totalLike + totalCollect + totalShare;
    const totals: AnalyticsTotals = {
      totalDrafts,
      totalPublished,
      totalOffline,
      totalImpression,
      totalClick,
      totalLike,
      totalCollect,
      totalShare,
      totalReport,
      avgQualityOverall:
        totalPublished > 0 ? Math.round((qualitySum / totalPublished) * 10) / 10 : 0,
      premiumRate:
        totalPublished > 0 ? Math.round((premiumCount / totalPublished) * 1000) / 1000 : 0,
      engagementRate: totalClick > 0 ? Math.round((interactions / totalClick) * 1000) / 1000 : 0,
    };

    const topPosts: AnalyticsTopPost[] = publishedDrafts
      .map((d) => {
        const s = d.stat;
        return {
          id: d.id,
          title: d.title,
          publishedAt: d.publishedAt?.toISOString() ?? null,
          qualityOverall: readQualityOverall(d.lastReview?.quality),
          impression: s?.impression ?? 0,
          click: s?.click ?? 0,
          like: s?.like ?? 0,
          collect: s?.collect ?? 0,
          share: s?.share ?? 0,
        };
      })
      .sort((a, b) => {
        const ia = a.like + a.collect + a.share;
        const ib = b.like + b.collect + b.share;
        if (ib !== ia) return ib - ia;
        return b.impression - a.impression;
      })
      .slice(0, TOP_LIMIT);

    return { totals, topPosts };
  }
}

function readQualityOverall(quality: unknown): number {
  if (typeof quality !== "object" || quality === null) return 0;
  const v = (quality as Record<string, unknown>).overall;
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}
