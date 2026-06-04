/**
 * Phase 2.4 fixtures · 给所有 PUBLISHED Draft 各挂一条 PREFLIGHT ALLOW Review,
 *           然后回写 Draft.lastReviewId。quality.overall 在 [60, 95] 散布。
 */
import { Prisma, PrismaClient } from "@prisma/client";

interface PendingReview {
  id: string;
  draftId: string;
}

export async function applyReviews(prisma: PrismaClient): Promise<number> {
  const drafts = await prisma.draft.findMany({
    where: { status: "PUBLISHED" },
    select: { id: true },
  });
  if (drafts.length === 0) return 0;

  const reviews: Prisma.ReviewCreateManyInput[] = [];
  const pending: PendingReview[] = [];

  for (let i = 0; i < drafts.length; i++) {
    const overall = 60 + ((i * 7) % 36); // 60..95
    const id = `rv${String(i).padStart(3, "0")}review000000000000000`;
    const quality: Prisma.InputJsonValue = {
      overall,
      dims: {
        value: overall,
        expression: overall,
        experience: overall,
        potential: overall,
      },
    };
    const safety: Prisma.InputJsonValue = {
      violence: { severity: "low", note: "" },
      sexual: { severity: "low", note: "" },
      political: { severity: "low", note: "" },
      privacy: { severity: "low", note: "" },
      factuality: { severity: "low", note: "" },
      copyright: { severity: "low", note: "" },
    };
    reviews.push({
      id,
      draftId: drafts[i].id,
      stage: "PREFLIGHT",
      recommendation: "ALLOW",
      safety,
      quality,
      modelMeta: { providerSafety: "fixture", providerQuality: "fixture" },
    });
    pending.push({ id, draftId: drafts[i].id });
  }

  const created = await prisma.review.createMany({ data: reviews });

  // 回写 Draft.lastReviewId(无 createMany 反向更新,只能逐个 update)
  for (const p of pending) {
    await prisma.draft.update({
      where: { id: p.draftId },
      data: { lastReviewId: p.id },
    });
  }

  return created.count;
}
