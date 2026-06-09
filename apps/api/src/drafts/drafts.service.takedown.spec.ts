import { Test } from "@nestjs/testing";
import { ConflictException, ForbiddenException } from "@nestjs/common";
import { DraftsService } from "./drafts.service";
import { VersionsService } from "./versions/versions.service";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";

describe("DraftsService.takedown() — 作者主动下线", () => {
  let service: DraftsService;
  let prisma: { draft: { findUnique: jest.Mock; update: jest.Mock } };

  beforeEach(async () => {
    prisma = {
      draft: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };
    const module = await Test.createTestingModule({
      providers: [
        DraftsService,
        { provide: PrismaService, useValue: prisma },
        { provide: VersionsService, useValue: {} },
        {
          provide: NotificationsService,
          useValue: { create: jest.fn().mockResolvedValue({ id: "n1" }) },
        },
      ],
    }).compile();
    service = module.get(DraftsService);
  });

  it("PUBLISHED → OFFLINE,offlineReason 默认'作者主动下线',offlineAt 写入", async () => {
    prisma.draft.findUnique.mockResolvedValue({
      id: "d1",
      authorId: "u1",
      status: "PUBLISHED",
      version: 3,
    });
    prisma.draft.update.mockResolvedValue({
      id: "d1",
      status: "OFFLINE",
      offlineReason: "作者主动下线",
      offlineAt: new Date(),
    });

    const r = await service.takedown("d1", "u1");
    expect(r).toMatchObject({ status: "OFFLINE" });
    expect(prisma.draft.update).toHaveBeenCalledWith({
      where: { id: "d1" },
      data: {
        status: "OFFLINE",
        offlineReason: "作者主动下线",
        offlineAt: expect.any(Date) as Date,
      },
    });
  });

  it("PUBLISHED + 自定义 reason → trim + slice(0, 200)", async () => {
    const longReason = "  ".padEnd(250, "x") + "  ";
    prisma.draft.findUnique.mockResolvedValue({
      id: "d1",
      authorId: "u1",
      status: "PUBLISHED",
      version: 3,
    });
    prisma.draft.update.mockResolvedValue({
      id: "d1",
      status: "OFFLINE",
      offlineReason: longReason.trim().slice(0, 200),
      offlineAt: new Date(),
    });

    await service.takedown("d1", "u1", longReason);

    const updateCalls = prisma.draft.update.mock.calls as [
      { where: { id: string }; data: { offlineReason: string } },
    ][];
    expect(updateCalls[0][0].data.offlineReason).toBe(longReason.trim().slice(0, 200));
  });

  it("DRAFT 状态 → 409 TAKEDOWN_NOT_ALLOWED", async () => {
    prisma.draft.findUnique.mockResolvedValue({
      id: "d1",
      authorId: "u1",
      status: "DRAFT",
      version: 1,
    });
    await expect(service.takedown("d1", "u1")).rejects.toMatchObject({
      response: { code: "TAKEDOWN_NOT_ALLOWED" },
      status: 409,
    });
  });

  it("REVIEWING 状态 → 409 TAKEDOWN_NOT_ALLOWED", async () => {
    prisma.draft.findUnique.mockResolvedValue({
      id: "d1",
      authorId: "u1",
      status: "REVIEWING",
      version: 2,
    });
    await expect(service.takedown("d1", "u1")).rejects.toBeInstanceOf(ConflictException);
  });

  it("OFFLINE 状态 → 409 TAKEDOWN_NOT_ALLOWED", async () => {
    prisma.draft.findUnique.mockResolvedValue({
      id: "d1",
      authorId: "u1",
      status: "OFFLINE",
      version: 5,
    });
    await expect(service.takedown("d1", "u1")).rejects.toBeInstanceOf(ConflictException);
  });

  it("非作者 → 403", async () => {
    prisma.draft.findUnique.mockResolvedValue({
      id: "d1",
      authorId: "u1",
      status: "PUBLISHED",
      version: 3,
    });
    await expect(service.takedown("d1", "OTHER_USER")).rejects.toBeInstanceOf(ForbiddenException);
  });
});
