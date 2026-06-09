import { RuleRecheckService } from "./rule-recheck.service";
import { PrismaService } from "../../prisma/prisma.service";
import { ReviewService } from "../../reviews/review.service";
import { AdminContentService } from "../admin-content.service";

const DRAFT_BODY = {
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "正文内容" }] }],
};

function makePrisma() {
  return {
    draft: { findMany: jest.fn() },
    ruleRecheckRun: {
      create: jest.fn().mockResolvedValue({ id: "run1" }),
      update: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn().mockResolvedValue({
        id: "run1",
        ruleVersion: "v2",
        totalScanned: 2,
        totalOffline: 0,
        status: "DONE",
      }),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
}

interface DoneCallData {
  status: string;
  totalScanned: number;
  totalOffline: number;
}

function findDoneData(mockFn: jest.Mock): DoneCallData | undefined {
  for (const call of mockFn.mock.calls) {
    const data = (call as [{ data: DoneCallData }])[0].data;
    if (data?.status === "DONE") return data;
  }
  return undefined;
}

describe("RuleRecheckService", () => {
  let service: RuleRecheckService;
  let prisma: ReturnType<typeof makePrisma>;
  let review: { reviewPostPublish: jest.Mock };
  let adminContent: { offlineDraft: jest.Mock };

  beforeEach(() => {
    prisma = makePrisma();
    review = { reviewPostPublish: jest.fn() };
    adminContent = { offlineDraft: jest.fn().mockResolvedValue({ ok: true }) };

    service = new RuleRecheckService(
      prisma as unknown as PrismaService,
      review as unknown as ReviewService,
      adminContent as unknown as AdminContentService,
    );
  });

  it("扫到 ALLOW 不动(不调 offlineDraft)", async () => {
    prisma.draft.findMany.mockResolvedValue([{ id: "d1", title: "标题1", body: DRAFT_BODY }]);
    review.reviewPostPublish.mockResolvedValue({
      recommendation: "ALLOW",
      reason: "ok",
      hitCategories: [],
    });

    await service.recheckSinceRuleVersion("v2");
    expect(adminContent.offlineDraft).not.toHaveBeenCalled();
    const doneData = findDoneData(prisma.ruleRecheckRun.update);
    expect(doneData).toBeTruthy();
    expect(doneData!.totalScanned).toBe(1);
    expect(doneData!.totalOffline).toBe(0);
  });

  it("扫到 BLOCK 转 OFFLINE", async () => {
    prisma.draft.findMany.mockResolvedValue([{ id: "d1", title: "标题1", body: DRAFT_BODY }]);
    review.reviewPostPublish.mockResolvedValue({
      recommendation: "BLOCK",
      reason: "命中敏感类目",
      hitCategories: ["pornography"],
    });

    await service.recheckSinceRuleVersion("v2");
    expect(adminContent.offlineDraft).toHaveBeenCalledWith(
      "d1",
      expect.stringContaining("规则更新复审"),
    );
    const doneData = findDoneData(prisma.ruleRecheckRun.update);
    expect(doneData!.totalOffline).toBe(1);
  });

  it("写 RuleRecheckRun 计数", async () => {
    prisma.draft.findMany.mockResolvedValue([
      { id: "d1", title: "标题1", body: DRAFT_BODY },
      { id: "d2", title: "标题2", body: DRAFT_BODY },
      { id: "d3", title: "标题3", body: DRAFT_BODY },
    ]);
    review.reviewPostPublish
      .mockResolvedValueOnce({
        recommendation: "ALLOW",
        reason: "ok",
        hitCategories: [],
      })
      .mockResolvedValueOnce({
        recommendation: "BLOCK",
        reason: "命中",
        hitCategories: ["abuse"],
      })
      .mockResolvedValueOnce({
        recommendation: "ALLOW",
        reason: "ok",
        hitCategories: [],
      });

    await service.recheckSinceRuleVersion("v3");
    const doneData = findDoneData(prisma.ruleRecheckRun.update);
    expect(doneData).toBeTruthy();
    expect(doneData!.totalScanned).toBe(3);
    expect(doneData!.totalOffline).toBe(1);
  });
});
