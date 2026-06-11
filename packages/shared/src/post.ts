/**
 * Phase 2.4 信息流相关类型;前后端共享的 source-of-truth。
 * Phase 2.5 接埋点后,PostDto.hotnessMock 字段可能 rename,但端点契约不变。
 */

export interface PostDto {
  id: string;
  title: string;
  authorId: string;
  authorHandle: string;
  publishedAt: string; // ISO
  qualityOverall: number; // 0-100
  hotnessMock: number; // 0-100; Phase 2.5 接埋点后由真实计算替换
  coverIndex: number; // 1-5
  excerpt: string; // 取 body 前 80 字
  trendingMatch: boolean; // 是否匹配到外部热榜话题
}

export interface PostDetailDto extends PostDto {
  body: unknown; // TipTap JSONContent
  qualityRecommendation: "ALLOW" | "WARN" | "BLOCK";
  reactions: PostReactionsDto;
}

export type ReactionKind = "LIKE" | "COLLECT";

export interface PostReactionsDto {
  likeCount: number;
  collectCount: number;
  liked: boolean; // 当前登录用户是否点赞;未登录恒 false
  collected: boolean;
}

export interface FeedResponse {
  items: PostDto[];
  nextCursor: string | null;
}

export interface FeedWeights {
  alpha: number; // QualityScore 权重
  beta: number; // HotnessScore 权重
  gamma: number; // TimeDecayScore 权重
  delta: number; // ExternalTrendScore 权重(抖音热榜相关性)
}

export const DEFAULT_FEED_WEIGHTS: FeedWeights = {
  alpha: 0.5,
  beta: 0.3,
  gamma: 0.2,
  delta: 0,
};

/** 各 mode 推荐的 delta 默认值;不传 delta 时按 mode 自动取 */
export const DELTA_DEFAULTS: Record<FeedMode, number> = {
  all: 0.1,
  hot: 0.25,
  best: 0.05,
};

export type FeedMode = "all" | "hot" | "best";

/** 各 mode 对应的 τ(小时) — TimeDecayScore 用 */
export const TAU_HOURS: Record<FeedMode, number> = {
  all: 24,
  hot: 12,
  best: 72,
};

/** 各 mode 候选池窗口(小时,小于此 publishedAt 才入候选) */
export const WINDOW_HOURS: Record<FeedMode, number> = {
  all: 24 * 30, // 30 天
  hot: 12,
  best: 72,
};

export interface MeWorksItemStat {
  impression: number;
  click: number;
  dwellUnit: number;
  like: number;
  collect: number;
  share: number;
}

export interface MeWorksItemDiagnosis {
  title: string;
  description: string;
  toolAction: string;
}

export interface MeWorksItem {
  id: string;
  title: string;
  status: "DRAFT" | "REVIEWING" | "PUBLISHED" | "OFFLINE";
  mode: "FAST" | "FINE";
  publishedAt: string | null;
  updatedAt: string;
  qualityOverall: number;
  recommendation: "ALLOW" | "WARN" | "BLOCK" | null;
  offlineReason: string | null;
  offlineAt: string | null;
  stat?: MeWorksItemStat | null;
  diagnosis?: MeWorksItemDiagnosis | null;
}
