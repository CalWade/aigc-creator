/**
 * Phase 2.6 fixtures · 3 条 Report seed
 *
 * 3 条故意覆盖 3 种状态,e2e 用作"已知态"基线:
 *   1. PENDING + 无 LLM 回填(刚举报、复审尚未跑完)
 *   2. PENDING + LLM 已 BLOCK(复审完成、admin 待处置)
 *   3. RESOLVED + DISMISS(已驳回的历史记录)
 *
 * 防灌水 @@unique(reporterId, postId):3 条用 3 个不同 (reporter, post) 组合。
 */
import { Prisma, PrismaClient } from "@prisma/client";

import { DEMO_AUTHOR_ID, LIFE_AUTHOR_ID, TECH_AUTHOR_ID } from "./users";

export const SEED_REPORT_PENDING_NO_LLM_ID = "reportseedpending000000001";
export const SEED_REPORT_PENDING_BLOCK_ID = "reportseedpending000000002";
export const SEED_REPORT_RESOLVED_DISMISS_ID = "reportseedresolved00000003";

/** 取 PUBLISHED 候选池前三篇(generateMockPosts 拼出的 id 格式) */
const POST_001 = "pub000draft0000000000000000";
const POST_002 = "pub001draft0000000000000000";
const POST_003 = "pub002draft0000000000000000";

export const DEMO_REPORTS: Prisma.ReportCreateManyInput[] = [
  {
    id: SEED_REPORT_PENDING_NO_LLM_ID,
    postId: POST_001,
    reporterId: TECH_AUTHOR_ID,
    category: "VULGARITY",
    reason: "用词低俗",
    status: "PENDING",
  },
  {
    id: SEED_REPORT_PENDING_BLOCK_ID,
    postId: POST_002,
    reporterId: LIFE_AUTHOR_ID,
    category: "POLITICS",
    reason: "涉敏感话题",
    status: "PENDING",
    llmRecommendation: "BLOCK",
    llmReason: "复审命中 politics 类目,建议下线。",
  },
  {
    id: SEED_REPORT_RESOLVED_DISMISS_ID,
    postId: POST_003,
    reporterId: DEMO_AUTHOR_ID,
    category: "OTHER",
    reason: "误举报示例",
    status: "RESOLVED",
    resolution: "DISMISS",
    llmRecommendation: "ALLOW",
    llmReason: "复审未发现高风险类目,建议保留。",
    resolvedAt: new Date(),
  },
];

export async function applyReportFixtures(prisma: PrismaClient): Promise<number> {
  const res = await prisma.report.createMany({ data: DEMO_REPORTS, skipDuplicates: true });
  return res.count;
}
