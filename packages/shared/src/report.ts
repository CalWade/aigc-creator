/**
 * Phase 2.6 发布后举报闭环 — 共享类型(source-of-truth)。
 * 用户举报 → LLM 推荐 → admin 处置(OFFLINE / WARN / DISMISS)。
 */

export const REPORT_CATEGORIES = [
  "POLITICS",
  "PORNOGRAPHY",
  "GAMBLING",
  "DRUGS",
  "VULGARITY",
  "FRAUD",
  "MEDICAL",
  "OTHER",
] as const;

export type ReportCategory = (typeof REPORT_CATEGORIES)[number];

export const REPORT_CATEGORY_LABELS: Record<ReportCategory, string> = {
  POLITICS: "涉政",
  PORNOGRAPHY: "涉黄",
  GAMBLING: "涉赌",
  DRUGS: "涉毒",
  VULGARITY: "低俗",
  FRAUD: "欺诈",
  MEDICAL: "医疗误导",
  OTHER: "其他",
};

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
