import { Test, TestingModule } from "@nestjs/testing";

import { PrismaService } from "../prisma/prisma.service";
import { FeedService } from "./feed.service";

describe("FeedService.getMyWorks — OFFLINE 扩展 (Phase 2.6 T10)", () => {
  let service: FeedService;
  const findMany = jest.fn();

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        FeedService,
        {
          provide: PrismaService,
          useValue: {
            draft: { findMany },
          },
        },
      ],
    }).compile();
    service = moduleRef.get(FeedService);
  });

  beforeEach(() => {
    findMany.mockReset();
  });

  it("含 OFFLINE 稿件 → 返回结构带 status='OFFLINE' / offlineReason / offlineAt", async () => {
    const offlineAt = new Date("2026-06-07T10:00:00Z");
    const updatedAt = new Date("2026-06-07T10:05:00Z");
    findMany.mockResolvedValueOnce([
      {
        id: "off001",
        title: "已下线稿",
        status: "OFFLINE",
        mode: "FAST",
        publishedAt: new Date("2026-06-06T08:00:00Z"),
        updatedAt,
        offlineReason: "[低俗] 命中明显违规",
        offlineAt,
        lastReview: { quality: { overall: 78 }, recommendation: "ALLOW" },
      },
    ]);

    const items = await service.getMyWorks("user1", "ALL");

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: "off001",
      status: "OFFLINE",
      offlineReason: "[低俗] 命中明显违规",
      offlineAt: offlineAt.toISOString(),
    });
  });

  it("status='OFFLINE' 过滤 → where.status='OFFLINE' 透传给 prisma", async () => {
    findMany.mockResolvedValueOnce([]);

    await service.getMyWorks("user1", "OFFLINE", 20);

    expect(findMany).toHaveBeenCalledTimes(1);
    const calls = findMany.mock.calls as Array<[{ where: { status?: string; authorId: string } }]>;
    const where = calls[0][0].where;
    expect(where.status).toBe("OFFLINE");
    expect(where.authorId).toBe("user1");
  });
});
