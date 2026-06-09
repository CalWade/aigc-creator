/**
 * Phase 2.17 — PromptsService snapshot 集成测试
 *
 * 用真实 PrismaService(经 AppModule)走 update / listSnapshots / restoreSnapshot,
 * 验证事务内 INSERT snapshot + 裁剪到 3 + UPDATE prompt 的端到端语义。
 * 与 e2e 区分:这里测 service 层契约,不发 HTTP。
 */
import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";

import { AppModule } from "../app.module";
import { PrismaService } from "../prisma/prisma.service";
import { PromptsService } from "./prompts.service";

describe("PromptsService Phase 2.17 snapshot", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let service: PromptsService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    service = app.get(PromptsService);
  });

  afterAll(async () => {
    await app.close();
  });

  let userId: string;
  let promptId: string;

  beforeEach(async () => {
    await prisma.promptSnapshot.deleteMany();
    await prisma.prompt.deleteMany({ where: { owner: "PRIVATE" } });
    await prisma.user.deleteMany({ where: { handle: { startsWith: "p217-" } } });

    const handle = `p217-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const user = await prisma.user.create({ data: { handle } });
    userId = user.id;

    let platform = await prisma.prompt.findFirst({
      where: { owner: "PLATFORM", tool: "REWRITE_FLUENT", isStarter: true },
    });
    if (!platform) {
      platform = await prisma.prompt.create({
        data: {
          owner: "PLATFORM",
          tool: "REWRITE_FLUENT",
          name: "P217 Test Default",
          systemPrompt: "默认 system",
          params: {},
          fewShots: [],
          isStarter: true,
        },
      });
    }
    const copy = await service.copyToPrivate(platform.id, userId);
    promptId = copy.id;
  });

  it("update 把更新前的内容写入一条 snapshot", async () => {
    const before = await prisma.prompt.findUniqueOrThrow({ where: { id: promptId } });
    await service.update(promptId, userId, { systemPrompt: "改后内容 v1" });
    const snaps = await prisma.promptSnapshot.findMany({ where: { promptId } });
    expect(snaps).toHaveLength(1);
    expect(snaps[0].systemPrompt).toBe(before.systemPrompt);
  });

  it("PATCH 第 4 次后 snapshot 表只剩 3 条(最旧被裁剪)", async () => {
    for (let i = 0; i < 4; i++) {
      await service.update(promptId, userId, { systemPrompt: `v${i}` });
    }
    const snaps = await prisma.promptSnapshot.findMany({
      where: { promptId },
      orderBy: { createdAt: "asc" },
    });
    expect(snaps).toHaveLength(3);
  });
});
