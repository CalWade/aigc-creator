import { SampleAuditService } from "./sample-audit.service";
import { PrismaService } from "../../prisma/prisma.service";
import { AdminContentService } from "../admin-content.service";

function makePrisma() {
  const sampleAuditCreate = jest
    .fn()
    .mockResolvedValue({ id: "sa1", draftId: "d1", status: "PENDING" });
  return {
    draft: {
      count: jest.fn().mockResolvedValue(100),
      findMany: jest.fn(),
    },
    sampleAudit: {
      findMany: jest.fn().mockResolvedValue([]),
      create: sampleAuditCreate,
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    $queryRaw: jest.fn(),
  };
}

describe("SampleAuditService", () => {
  let service: SampleAuditService;
  let prisma: ReturnType<typeof makePrisma>;
  let adminContent: { offlineDraft: jest.Mock };

  beforeEach(() => {
    prisma = makePrisma();
    adminContent = { offlineDraft: jest.fn().mockResolvedValue({ ok: true }) };
    service = new SampleAuditService(
      prisma as unknown as PrismaService,
      adminContent as unknown as AdminContentService,
    );
  });

  describe("enqueueSample", () => {
    it("抽样数量正确(5% of 100 = 5)", async () => {
      prisma.$queryRaw.mockResolvedValue([
        { id: "d1" },
        { id: "d2" },
        { id: "d3" },
        { id: "d4" },
        { id: "d5" },
      ]);
      const result = await service.enqueueSample(0.05);
      expect(result.enqueued).toBe(5);
      expect(prisma.sampleAudit.create).toHaveBeenCalledTimes(5);
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    });

    it("跳过已有 PENDING 的 draft", async () => {
      prisma.sampleAudit.findMany.mockResolvedValue([{ draftId: "d1" }]);
      prisma.$queryRaw.mockResolvedValue([{ id: "d1" }, { id: "d2" }]);
      const result = await service.enqueueSample(0.05);
      expect(result.enqueued).toBe(1);
      expect(prisma.sampleAudit.create).toHaveBeenCalledTimes(1);
    });
  });

  describe("decide", () => {
    it("标记 PASS 更新状态", async () => {
      prisma.sampleAudit.findUnique.mockResolvedValue({
        id: "sa1",
        draftId: "d1",
        status: "PENDING",
      });
      await service.decide("sa1", "PASS", "admin");
      expect(prisma.sampleAudit.update).toHaveBeenCalledWith({
        where: { id: "sa1" },
        data: {
          status: "PASSED",
          reviewedAt: expect.any(Date) as Date,
          reviewedBy: "admin",
          note: null,
        },
      });
      expect(adminContent.offlineDraft).not.toHaveBeenCalled();
    });

    it("标记 FAIL 转 OFFLINE", async () => {
      prisma.sampleAudit.findUnique.mockResolvedValue({
        id: "sa2",
        draftId: "d1",
        status: "PENDING",
      });
      await service.decide("sa2", "FAIL", "admin", "违规内容");
      expect(adminContent.offlineDraft).toHaveBeenCalledWith(
        "d1",
        expect.stringContaining("抽样巡检下线"),
      );
      expect(prisma.sampleAudit.update).toHaveBeenCalledWith({
        where: { id: "sa2" },
        data: {
          status: "FAILED",
          reviewedAt: expect.any(Date) as Date,
          reviewedBy: "admin",
          note: "违规内容",
        },
      });
    });
  });
});
