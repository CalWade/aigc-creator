/**
 * Phase 2.17 — PromptsService snapshot 集成测试
 *
 * 用真实 PrismaService(经 AppModule)走 update / listSnapshots / restoreSnapshot,
 * 验证事务内 INSERT snapshot + 裁剪到 3 + UPDATE prompt 的端到端语义。
 * 与 e2e 区分:这里测 service 层契约,不发 HTTP。
 */
import { Test } from "@nestjs/testing";
import { ForbiddenException, INestApplication, NotFoundException } from "@nestjs/common";

import { AppModule } from "../app.module";
import { PrismaService } from "../prisma/prisma.service";
import { PromptsService } from "./prompts.service";
import { GuardClient } from "../llm/guard.client";

describe("PromptsService Phase 2.17 snapshot", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let service: PromptsService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GuardClient)
      .useValue({ moderate: jest.fn() })
      .compile();
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

  it("listSnapshots 仅返回最多 3 条 desc by createdAt", async () => {
    for (let i = 0; i < 4; i++) {
      await service.update(promptId, userId, { systemPrompt: `v${i}` });
    }
    const snaps = await service.listSnapshots(promptId, userId);
    expect(snaps).toHaveLength(3);
    for (let i = 0; i + 1 < snaps.length; i++) {
      expect(snaps[i].createdAt.getTime()).toBeGreaterThanOrEqual(snaps[i + 1].createdAt.getTime());
    }
  });

  it("listSnapshots 非作者 → Forbidden", async () => {
    const otherHandle = `p217-other-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const other = await prisma.user.create({ data: { handle: otherHandle } });
    await service.update(promptId, userId, { systemPrompt: "v1" });
    await expect(service.listSnapshots(promptId, other.id)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("restoreSnapshot 把 prompt 内容覆盖为 snapshot 内容", async () => {
    const beforeFirst = (await prisma.prompt.findUniqueOrThrow({ where: { id: promptId } }))
      .systemPrompt;
    await service.update(promptId, userId, { systemPrompt: "vNEW" });
    const snaps = await service.listSnapshots(promptId, userId);
    expect(snaps[0].systemPrompt).toBe(beforeFirst);

    await service.restoreSnapshot(promptId, snaps[0].id, userId);

    const after = await prisma.prompt.findUniqueOrThrow({ where: { id: promptId } });
    expect(after.systemPrompt).toBe(beforeFirst);
  });

  it("restoreSnapshot 后,snapshot 列表第 1 条是被回滚前的状态", async () => {
    await service.update(promptId, userId, { systemPrompt: "v1" });
    await service.update(promptId, userId, { systemPrompt: "v2" });
    const snaps = await service.listSnapshots(promptId, userId);
    // 最旧那条是平台拷贝原始内容
    const oldest = snaps[snaps.length - 1];
    await service.restoreSnapshot(promptId, oldest.id, userId);
    const after = await service.listSnapshots(promptId, userId);
    // 被回滚前 prompt 的 systemPrompt 是 "v2",所以新快照第 1 条应是 v2
    expect(after[0].systemPrompt).toBe("v2");
  });

  it("restoreSnapshot snapId 不属于该 prompt → NotFound", async () => {
    await service.update(promptId, userId, { systemPrompt: "v1" });
    await expect(
      service.restoreSnapshot(promptId, "nonexistent-id", userId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("restoreSnapshot 非作者 → Forbidden", async () => {
    await service.update(promptId, userId, { systemPrompt: "v1" });
    const snaps = await service.listSnapshots(promptId, userId);
    const otherHandle = `p217-other-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const other = await prisma.user.create({ data: { handle: otherHandle } });
    await expect(service.restoreSnapshot(promptId, snaps[0].id, other.id)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("assertOwnPrivate PLATFORM owner → Forbidden(走 update 路径)", async () => {
    const platform = await prisma.prompt.findFirstOrThrow({
      where: { owner: "PLATFORM", tool: "REWRITE_FLUENT", isStarter: true },
    });
    await expect(service.update(platform.id, userId, { systemPrompt: "x" })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
