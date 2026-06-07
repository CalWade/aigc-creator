/**
 * Phase 2.10 工作台数据看板共享类型。
 * 数据源 = PostStat(impression/click/dwellUnit/like/collect/share/report)
 * + Review.quality.overall。Demo 阶段 PostStat 多为 0,真实埋点写入留 phase 3。
 */

export interface AnalyticsTotals {
  totalDrafts: number;
  totalPublished: number;
  totalOffline: number;
  totalImpression: number;
  totalClick: number;
  totalLike: number;
  totalCollect: number;
  totalShare: number;
  totalReport: number;
  /** 已发布作品的平均质量分(无作品时 0) */
  avgQualityOverall: number;
  /** 优质率 = quality >= 80 占已发布比例(0-1,无作品时 0) */
  premiumRate: number;
  /** 互动率 = (like+collect+share)/click;click=0 时 0 */
  engagementRate: number;
}

export interface AnalyticsTopPost {
  id: string;
  title: string;
  publishedAt: string | null;
  qualityOverall: number;
  impression: number;
  click: number;
  like: number;
  collect: number;
  share: number;
}

export interface AnalyticsResponse {
  totals: AnalyticsTotals;
  /** 单篇按 (like+collect+share) 降序的 top N */
  topPosts: AnalyticsTopPost[];
}
