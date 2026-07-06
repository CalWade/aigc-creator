/**
 * 发布后举报闭环 — 共享类型(source-of-truth)。
 * 用户举报 → LLM 推荐 → admin 处置(OFFLINE / WARN / DISMISS)。
 *
 * ReportCategory 与 SensitiveCategory 对齐(Phase 2.16 重排后统一):
 * - pornography / gambling / drugs / abuse / fraud / illicit_ads: 与审核系统 1:1 对应
 * - OTHER: 保留作为兜底分类(用户举报无法归入上述 6 类时使用)
 */

import type { SensitiveCategory } from "./review";

export const REPORT_CATEGORIES = [
  "PORNOGRAPHY",
  "GAMBLING",
  "DRUGS",
  "ABUSE",
  "FRAUD",
  "ILLICIT_ADS",
  "OTHER",
] as const;

export type ReportCategory = (typeof REPORT_CATEGORIES)[number];

export const REPORT_CATEGORY_LABELS: Record<ReportCategory, string> = {
  PORNOGRAPHY: "涉黄",
  GAMBLING: "涉赌",
  DRUGS: "涉毒",
  ABUSE: "辱骂攻击",
  FRAUD: "欺诈",
  ILLICIT_ADS: "黑产广告",
  OTHER: "其他",
};

/** ReportCategory → SensitiveCategory 映射(OTHER 无对应,返 null) */
export function reportCategoryToSensitive(cat: ReportCategory): SensitiveCategory | null {
  const map: Record<ReportCategory, SensitiveCategory | null> = {
    PORNOGRAPHY: "pornography",
    GAMBLING: "gambling",
    DRUGS: "drugs",
    ABUSE: "abuse",
    FRAUD: "fraud",
    ILLICIT_ADS: "illicit_ads",
    OTHER: null,
  };
  return map[cat];
}

export type ReportStatus = "PENDING" | "RESOLVED";

export type ReportResolution = "OFFLINE" | "WARN" | "DISMISS";

export interface ReportDto {
  id: string;
  postId: string;
  postTitle: string;
  reporterId: string;
  reporterHandle: string;
  category: ReportCategory;
  reason: string | null;
  status: ReportStatus;
  resolution: ReportResolution | null;
  llmRecommendation: "ALLOW" | "WARN" | "BLOCK" | null;
  llmReason: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface CreateReportInput {
  category: ReportCategory;
  reason?: string;
}

export interface ResolveReportInput {
  resolution: ReportResolution;
  note?: string;
}
