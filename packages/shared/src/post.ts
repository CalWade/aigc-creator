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
}

export interface PostDetailDto extends PostDto {
  body: unknown; // TipTap JSONContent
  qualityRecommendation: "ALLOW" | "WARN" | "BLOCK";
}

export interface FeedResponse {
  items: PostDto[];
  nextCursor: string | null;
}

export interface FeedWeights {
  alpha: number; // QualityScore 权重
  beta: number; // HotnessScore 权重
  gamma: number; // TimeDecayScore 权重
}

export const DEFAULT_FEED_WEIGHTS: FeedWeights = {
  alpha: 0.5,
  beta: 0.3,
  gamma: 0.2,
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
