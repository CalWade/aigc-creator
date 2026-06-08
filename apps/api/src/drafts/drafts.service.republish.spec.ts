import { Test } from "@nestjs/testing";
import { ConflictException, ForbiddenException } from "@nestjs/common";
import { DraftsService } from "./drafts.service";
import { VersionsService } from "./versions/versions.service";
import { PrismaService } from "../prisma/prisma.service";

describe("DraftsService.edit() — 二次编辑入口", () => {
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
      ],
    }).compile();
    service = module.get(DraftsService);
  });

  it("PUBLISHED → DRAFT,version+1", async () => {
    prisma.draft.findUnique.mockResolvedValue({
      id: "d1",
      authorId: "u1",
      status: "PUBLISHED",
      version: 5,
    });
    prisma.draft.update.mockResolvedValue({ id: "d1", status: "DRAFT", version: 6 });

    const r = await service.edit("d1", "u1");
    expect(r).toEqual({ id: "d1", status: "DRAFT", version: 6 });
    expect(prisma.draft.update).toHaveBeenCalledWith({
      where: { id: "d1" },
      data: { status: "DRAFT", version: { increment: 1 } },
    });
  });

  it("DRAFT 状态 → 409 EDIT_NOT_ALLOWED", async () => {
    prisma.draft.findUnique.mockResolvedValue({
      id: "d1",
      authorId: "u1",
      status: "DRAFT",
      version: 1,
    });
    await expect(service.edit("d1", "u1")).rejects.toMatchObject({
      response: { code: "EDIT_NOT_ALLOWED" },
      status: 409,
    });
  });

  it("OFFLINE 状态 → 409 EDIT_NOT_ALLOWED", async () => {
    prisma.draft.findUnique.mockResolvedValue({
      id: "d1",
      authorId: "u1",
      status: "OFFLINE",
      version: 7,
    });
    await expect(service.edit("d1", "u1")).rejects.toBeInstanceOf(ConflictException);
  });

  it("非作者 → 403", async () => {
    prisma.draft.findUnique.mockResolvedValue({
      id: "d1",
      authorId: "u1",
      status: "PUBLISHED",
      version: 5,
    });
    await expect(service.edit("d1", "OTHER_USER")).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe("DraftsService.publish() — 首发 / 二发", () => {
  type PublishUpdateArgs = {
    where: { id: string };
    data: {
      status?: string;
      publishedAt?: Date;
      publishedBody?: unknown;
      publishedTitle?: string | null;
      publishedVersion?: number | null;
    };
  };

  let service: DraftsService;
  let prisma: {
    draft: { findUnique: jest.Mock; update: jest.Mock };
    postStat: { updateMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let versions: { snapshotPublished: jest.Mock };
  const recentReview = { stage: "PREFLIGHT", recommendation: "ALLOW", createdAt: new Date() };

  beforeEach(async () => {
    prisma = {
      draft: { findUnique: jest.fn(), update: jest.fn() },
      postStat: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      $transaction: jest.fn(async (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma)),
    };
    versions = { snapshotPublished: jest.fn().mockResolvedValue(undefined) };
    const module = await Test.createTestingModule({
      providers: [
        DraftsService,
        { provide: PrismaService, useValue: prisma },
        { provide: VersionsService, useValue: versions },
      ],
    }).compile();
    service = module.get(DraftsService);
  });

  it("首发 → publishedBody=body 快照写入,status=PUBLISHED", async () => {
    prisma.draft.findUnique
      .mockResolvedValueOnce({
        id: "d1",
        authorId: "u1",
        status: "DRAFT",
        version: 1,
      })
      .mockResolvedValueOnce({
        id: "d1",
        authorId: "u1",
        status: "DRAFT",
        title: "T1",
        body: { type: "doc" },
        version: 1,
        publishedBody: null,
        lastReview: recentReview,
      });
    prisma.draft.update.mockResolvedValue({
      id: "d1",
      publishedAt: new Date(),
    });

    await service.publish("d1", "u1");

    const updateCalls = prisma.draft.update.mock.calls as PublishUpdateArgs[][];
    expect(updateCalls[0][0]).toMatchObject({ data: { status: "REVIEWING" } });
    const secondCallData = updateCalls[1][0].data;
    expect(secondCallData).toMatchObject({
      status: "PUBLISHED",
      publishedBody: { type: "doc" },
      publishedTitle: "T1",
      publishedVersion: 1,
    });
    expect(prisma.postStat.updateMany).not.toHaveBeenCalled();
  });

  it("二发 + 默认 env(继承热度) → publishedBody 覆盖,PostStat 不动", async () => {
    prisma.draft.findUnique
      .mockResolvedValueOnce({ id: "d1", authorId: "u1", status: "DRAFT", version: 6 })
      .mockResolvedValueOnce({
        id: "d1",
        authorId: "u1",
        status: "DRAFT",
        title: "T2",
        body: { type: "doc", text: "v2" },
        version: 6,
        publishedBody: { type: "doc", text: "v1" },
        lastReview: recentReview,
      });
    prisma.draft.update.mockResolvedValue({ id: "d1", publishedAt: new Date() });

    delete process.env.REPUBLISH_HOTNESS_INHERIT;
    await service.publish("d1", "u1");

    expect(prisma.postStat.updateMany).not.toHaveBeenCalled();
  });

  it("二发 + env=false → PostStat 清零", async () => {
    prisma.draft.findUnique
      .mockResolvedValueOnce({ id: "d1", authorId: "u1", status: "DRAFT", version: 6 })
      .mockResolvedValueOnce({
        id: "d1",
        authorId: "u1",
        status: "DRAFT",
        title: "T2",
        body: { type: "doc", text: "v2" },
        version: 6,
        publishedBody: { type: "doc", text: "v1" },
        lastReview: recentReview,
      });
    prisma.draft.update.mockResolvedValue({ id: "d1", publishedAt: new Date() });

    process.env.REPUBLISH_HOTNESS_INHERIT = "false";
    try {
      await service.publish("d1", "u1");
      expect(prisma.postStat.updateMany).toHaveBeenCalledWith({
        where: { draftId: "d1" },
        data: { impression: 0, click: 0, dwellUnit: 0, like: 0 },
      });
    } finally {
      delete process.env.REPUBLISH_HOTNESS_INHERIT;
    }
  });
});
