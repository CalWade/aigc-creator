import { Test } from "@nestjs/testing";
import { ConflictException, ForbiddenException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { DraftsService } from "./drafts.service";
import { VersionsService } from "./versions/versions.service";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";

describe("DraftsService.restoreFromOffline() — OFFLINE 恢复为 DRAFT 重新提审", () => {
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

  it("OFFLINE → DRAFT,version+1,publishedBody/Title/Version 清空,offlineReason/At 清空", async () => {
    prisma.draft.findUnique.mockResolvedValue({
      id: "d1",
      authorId: "u1",
      status: "OFFLINE",
      version: 5,
      publishedBody: { type: "doc" },
      publishedTitle: "老标题",
      publishedVersion: 3,
      offlineReason: "作者主动下线",
      offlineAt: new Date(),
    });
    prisma.draft.update.mockResolvedValue({
      id: "d1",
      status: "DRAFT",
      version: 6,
      publishedBody: null,
      publishedTitle: null,
      publishedVersion: null,
      offlineReason: null,
      offlineAt: null,
    });

    const r = await service.restoreFromOffline("d1", "u1");
    expect(r.status).toBe("DRAFT");
    expect(prisma.draft.update).toHaveBeenCalledWith({
      where: { id: "d1" },
      data: {
        status: "DRAFT",
        version: { increment: 1 },
        publishedBody: Prisma.JsonNull,
        publishedTitle: null,
        publishedVersion: null,
        offlineReason: null,
        offlineAt: null,
      },
    });
  });

  it("非 OFFLINE(DRAFT) → 409 RESTORE_NOT_ALLOWED", async () => {
    prisma.draft.findUnique.mockResolvedValue({
      id: "d1",
      authorId: "u1",
      status: "DRAFT",
      version: 1,
    });
    await expect(service.restoreFromOffline("d1", "u1")).rejects.toMatchObject({
      response: { code: "RESTORE_NOT_ALLOWED" },
      status: 409,
    });
  });

  it("非 OFFLINE(PUBLISHED) → 409 RESTORE_NOT_ALLOWED", async () => {
    prisma.draft.findUnique.mockResolvedValue({
      id: "d1",
      authorId: "u1",
      status: "PUBLISHED",
      version: 2,
    });
    await expect(service.restoreFromOffline("d1", "u1")).rejects.toBeInstanceOf(ConflictException);
  });

  it("非作者 → 403", async () => {
    prisma.draft.findUnique.mockResolvedValue({
      id: "d1",
      authorId: "u1",
      status: "OFFLINE",
      version: 5,
    });
    await expect(service.restoreFromOffline("d1", "OTHER_USER")).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
