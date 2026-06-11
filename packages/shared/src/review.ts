/**
 * Phase 2.3 — 发布前审核 / 4 维质量分 共享类型
 * 后端 ReviewService 与前端 PreflightDialog 共用同一份 schema
 */

export const SAFETY_KEYS = [
  "pornography",
  "gambling",
  "drugs",
  "abuse",
  "fraud",
  "illicit_ads",
] as const;
export type SafetyKey = (typeof SAFETY_KEYS)[number];

export const QUALITY_KEYS = [
  "content_value",
  "expression",
  "reader_experience",
  "viral_potential",
] as const;
export type QualityKey = (typeof QUALITY_KEYS)[number];

export type Severity = "low" | "medium" | "high";
export type Recommendation = "ALLOW" | "WARN" | "BLOCK";

export interface SafetyDim {
  key: SafetyKey;
  score: number;
  severity: Severity;
  hits: string[];
  reason?: string;
}

export interface ReviewSafety {
  overall: number;
  dimensions: SafetyDim[];
  note?: string;
}

export interface QualityDim {
  key: QualityKey;
  score: number;
  reason: string;
}

export interface ReviewQuality {
  overall: number;
  dimensions: QualityDim[];
  note?: string;
}

export interface ReviewModelMeta {
  latencyMsSafety: number;
  latencyMsQuality: number;
  totalMs: number;
  truncated: boolean;
}

export interface ReviewDto {
  id: string;
  stage: "PREFLIGHT" | "PROMPT_INPUT" | "SECTION_INLINE" | "POST_PUBLISH";
  safety: ReviewSafety;
  quality: ReviewQuality;
  recommendation: Recommendation;
  modelMeta?: ReviewModelMeta | null;
  createdAt: string;
}

export interface PreflightResponse {
  review: ReviewDto;
  recommendation: Recommendation;
}

/**
 * Phase 2.16 → Guard 迁移:6 类目敏感词分类(与 SAFETY_KEYS 统一)
 * drugs 恢复为独立类目(阿里云 MultiModalGuard 有独立 contraband_drug 标签);
 * politics/vulgarity/false_advertising 合并进 abuse/fraud/illicit_ads。
 */
export const SENSITIVE_CATEGORIES = [
  "pornography",
  "gambling",
  "drugs",
  "abuse",
  "fraud",
  "illicit_ads",
] as const;
export type SensitiveCategory = (typeof SENSITIVE_CATEGORIES)[number];

/**
 * Phase 2.5 ① Prompt 阶段审核响应
 * 端点:POST /reviews/prompt
 */
export interface PromptReviewResponse {
  recommendation: Recommendation;
  hitCategories: SensitiveCategory[];
  message: string;
  reviewId: string;
}

/**
 * Phase 2.5 ③ 段落审核响应
 * 端点:POST /reviews/section
 * abortStream: 同 sessionId 内连续 ≥ 3 段 high → true,前端 stop SectionStream
 */
export interface SectionReviewResponse {
  recommendation: Recommendation;
  hitCategories: SensitiveCategory[];
  severity: Severity;
  message: string;
  abortStream: boolean;
  reviewId: string;
}

/**
 * Phase 2.13 — 一键生成合规替代(§4.2 medium)
 * 端点:POST /reviews/safe-rewrite (SSE)
 * 单连接两路候选,以 idx 区分
 */
export interface SafeRewriteRequest {
  draftId: string;
  text: string;
  hitCategories: SensitiveCategory[];
  message: string; // 段落审核或安全分给出的命中原因,塞 user prompt
}

export type SafeRewriteFrame =
  | { event: "start"; idx: 0 | 1 }
  | { event: "token"; idx: 0 | 1; delta: string }
  | { event: "end"; idx: 0 | 1 }
  | { event: "done" }
  | { event: "error"; idx?: 0 | 1; message: string };
