/**
 * Phase 2.4 排序公式 — 纯函数,前后端共享。
 *
 * score = α · QualityScore + β · HotnessScore + γ · TimeDecayScore
 *
 * - QualityScore: 4 维质量分总分(由 Phase 2.3 写入 Review.quality.overall),0-100
 * - HotnessScore: 候选池内 min-max 归一化(Phase 2.4 输入是 hotnessMockBase 哈希;
 *   Phase 2.5 接埋点后输入是 PostStat 加权 raw)。归一化保证排序公式不被原始量级吞噬。
 * - TimeDecayScore: 100·exp(-Δh / τ),Δh = 当前时刻减发布时刻的小时数
 *
 * 关键不变量:
 * - 输入纯数据,无 IO,可前后端复用
 * - hotnessRaw 在 Phase 2.4 = hotnessMockBase(post.id);Phase 2.5 = computeRawFromStats(stat, window)
 *   单点替换路径,见 apps/api/src/feed/feed.service.ts 的 // PHASE_2_5_REPLACE_HERE
 */

import type { FeedWeights } from "./post";

export interface Scoreable {
  id: string;
  publishedAt: Date;
  qualityOverall: number; // 0-100
  hotnessRaw: number; // Phase 2.4 = mock; Phase 2.5 = 真实加权
  externalTrendScore: number; // 0-100; 抖音热榜相关性,0=无匹配
}

export interface ScoreContext {
  weights: FeedWeights;
  tauHours: number;
  now: Date;
  hotnessPool: number[]; // 当前候选池所有 hotnessRaw,用于 min-max 归一化
}

/** TimeDecayScore = 100 · exp(-Δh / τ);0-100,publishedAt 越新越接近 100 */
export function timeDecayScore(publishedAt: Date, now: Date, tauHours: number): number {
  const dh = Math.max(0, (now.getTime() - publishedAt.getTime()) / 3600_000);
  return 100 * Math.exp(-dh / tauHours);
}

/**
 * min-max 归一化到 0-100。
 * - 空池或 max==min:返 0(无意义,候选池不足以归一化)
 * - 池规模 < 50:用候选池 P95 作为 max(避免单 outlier 把其他全压成 0)
 * - 否则用 max
 */
export function normalizeHotness(raw: number, pool: number[]): number {
  if (pool.length === 0) return 0;
  const min = Math.min(...pool);
  const sorted = pool.length < 50 ? [...pool].sort((a, b) => a - b) : null;
  const max = sorted ? sorted[Math.floor(sorted.length * 0.95)] : Math.max(...pool);
  if (max === min) return 0;
  const clamped = Math.max(min, Math.min(max, raw));
  return 100 * ((clamped - min) / (max - min));
}

/** α·Q + β·H + γ·T + δ·E;输入纯数据,无 IO */
export function computeScore(p: Scoreable, ctx: ScoreContext): number {
  const q = p.qualityOverall;
  const h = normalizeHotness(p.hotnessRaw, ctx.hotnessPool);
  const t = timeDecayScore(p.publishedAt, ctx.now, ctx.tauHours);
  const e = p.externalTrendScore;
  return (
    ctx.weights.alpha * q + ctx.weights.beta * h + ctx.weights.gamma * t + ctx.weights.delta * e
  );
}

/**
 * Phase 2.4 mock:稳定哈希,跨调用一致;输入同 id 永远同输出。
 * Phase 2.5 接埋点后此函数仍保留(Phase 2.4 的 e2e 还在用),但 feed.service 不再调用。
 */
export function hotnessMockBase(postId: string): number {
  let h = 0;
  for (let i = 0; i < postId.length; i++) {
    h = (h * 31 + postId.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % 100;
}

/**
 * Phase 2.5 真实热度:基于 PostStat 多因子加权。
 *
 * 公式:log(impression+1)·1 + click·2 + like·5 + collect·8 + share·10 - report·20
 *
 * 设计理由:
 * - impression 走 log:曝光量级跨度大(0 ~ 数十万),线性会让头部完全压死长尾。
 * - click/like/collect/share 是显性参与,权重递增反映用户投入成本递增。
 * - report 是负反馈,权重 -20 远高于正向单项,一次举报抵 4 次 share。这是为了让
 *   "被多人举报但点赞也多" 的争议内容自然下沉,让 hotness 自带轻度安全自净。
 * - 结果可能为负(report 多 + 互动少),归一化阶段会被 clamp 到候选池下限。
 *
 * 输入纯数据,无 IO,前后端可复用。
 */
export interface PostStatLike {
  impression: number;
  click: number;
  like: number;
  collect: number;
  share: number;
  report: number;
}

export function computeHotnessRaw(stat: PostStatLike | null | undefined): number {
  if (!stat) return 0;
  return (
    Math.log(stat.impression + 1) * 1 +
    stat.click * 2 +
    stat.like * 5 +
    stat.collect * 8 +
    stat.share * 10 -
    stat.report * 20
  );
}

/**
 * 外部热度匹配分:标题与热榜话题的文本相关性 + 热榜 popularity 归一化。
 *
 * 匹配策略(Phase 1 轻量方案):
 * - 对标题做 2-4 字滑动窗口分词
 * - 与热榜话题做双向子串匹配(标题包含话题 / 话题包含标题分词片段)
 * - 匹配到的话题取其归一化 popularity(min-max → 0-100)
 * - 多个话题匹配时取最高分;无匹配返 0
 *
 * 输入纯数据,无 IO,前后端可复用。
 */
export function computeExternalTrendScore(
  title: string,
  trendingTopics: string[],
  trendingPopularities: number[],
): number {
  if (!title || trendingTopics.length === 0) return 0;

  const titleLower = title.toLowerCase();
  // 生成 2-4 字分词片段
  const segments: string[] = [];
  for (let len = 2; len <= 4; len++) {
    for (let i = 0; i <= titleLower.length - len; i++) {
      segments.push(titleLower.slice(i, i + len));
    }
  }

  let bestScore = 0;
  const minPop = Math.min(...trendingPopularities);
  const maxPop = Math.max(...trendingPopularities);

  for (let i = 0; i < trendingTopics.length; i++) {
    const topic = trendingTopics[i].toLowerCase();
    let matched = false;

    // 精确子串:标题包含话题
    if (titleLower.includes(topic) || topic.includes(titleLower)) {
      matched = true;
    }

    // 分词片段匹配:话题包含标题的某个分词片段(至少 3 字)
    if (!matched) {
      for (const seg of segments) {
        if (seg.length >= 3 && topic.includes(seg)) {
          matched = true;
          break;
        }
      }
    }

    if (matched) {
      const pop = trendingPopularities[i];
      const normalized = maxPop > minPop ? (100 * (pop - minPop)) / (maxPop - minPop) : 50;
      if (normalized > bestScore) bestScore = normalized;
    }
  }

  return bestScore;
}
