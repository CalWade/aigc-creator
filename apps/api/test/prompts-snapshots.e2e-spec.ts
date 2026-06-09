/**
 * Phase 2.17 — snapshots + restore 端点 e2e
 *
 * 完整链路:登录 demo → 复制平台 prompt → PATCH x4 → GET snapshots(只 3 条)→
 * restore 第 2 条 → 验证 prompt 内容已变 → 验证最新一条快照 = 被回滚前的内容。
 */
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { App } from "supertest/types";

import { AppModule } from "./../src/app.module";
import { PrismaService } from "./../src/prisma/prisma.service";
import { applyAllFixtures, cleanupAllFixtures, DEMO_AUTHOR_ID } from "./../prisma/fixtures";
import { loginAs, loginAsDemo } from "./helpers/auth";

interface SnapshotBody {
  id: string;
  systemPrompt: string;
  createdAt: string;
}

interface PromptBody {
  id: string;
  systemPrompt: string;
}

describe("Prompts snapshots (e2e, Phase 2.17)", () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let token: string;
  let copyId: string;
  let platformId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    prisma = app.get(PrismaService);
    await applyAllFixtures(prisma);
  });

  afterAll(async () => {
    await cleanupAllFixtures(prisma);
    await app.close();
  });

  beforeEach(async () => {
    // 隔离每个 case:清掉 demo 作者的私人副本与所有快照
    await prisma.promptSnapshot.deleteMany();
    await prisma.prompt.deleteMany({ where: { owner: "PRIVATE", authorId: DEMO_AUTHOR_ID } });

    token = await loginAsDemo(app);

    const platform = await prisma.prompt.findFirstOrThrow({
      where: { owner: "PLATFORM", tool: "REWRITE_FLUENT", isStarter: true },
    });
    platformId = platform.id;

    const copyRes = await request(app.getHttpServer())
      .post(`/prompts/${platformId}/copy`)
      .set("Authorization", `Bearer ${token}`)
      .send();
    expect(copyRes.status).toBe(201);
    copyId = (copyRes.body as { id: string }).id;
  });

  it("PATCH x4 → list 仅 3 条 → restore 第 2 条 → prompt 内容变,新快照在最前", async () => {
    for (let i = 0; i < 4; i++) {
      const res = await request(app.getHttpServer())
        .patch(`/prompts/${copyId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ systemPrompt: `v${i}` });
      expect(res.status).toBe(200);
    }

    const listRes = await request(app.getHttpServer())
      .get(`/prompts/${copyId}/snapshots`)
      .set("Authorization", `Bearer ${token}`);
    expect(listRes.status).toBe(200);
    const list = listRes.body as SnapshotBody[];
    expect(list).toHaveLength(3);

    const second = list[1];
    const restoreRes = await request(app.getHttpServer())
      .post(`/prompts/${copyId}/snapshots/${second.id}/restore`)
      .set("Authorization", `Bearer ${token}`)
      .send();
    expect(restoreRes.status).toBe(200);
    expect((restoreRes.body as PromptBody).systemPrompt).toBe(second.systemPrompt);

    const after = await request(app.getHttpServer())
      .get(`/prompts/${copyId}/snapshots`)
      .set("Authorization", `Bearer ${token}`);
    expect(after.status).toBe(200);
    const afterList = after.body as SnapshotBody[];
    expect(afterList).toHaveLength(3);
    // 最新一条 = 被回滚前的内容(也就是最后一次 PATCH 的 v3)
    expect(afterList[0].systemPrompt).toBe("v3");
  });

  it("非作者 GET snapshots → 403", async () => {
    const otherToken = await loginAs(app, "tech-author");
    const res = await request(app.getHttpServer())
      .get(`/prompts/${copyId}/snapshots`)
      .set("Authorization", `Bearer ${otherToken}`);
    expect(res.status).toBe(403);
  });

  it("restore snapId 不属于该 prompt → 404", async () => {
    await request(app.getHttpServer())
      .patch(`/prompts/${copyId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ systemPrompt: "v1" });
    const res = await request(app.getHttpServer())
      .post(`/prompts/${copyId}/snapshots/cl_xxx_not_exist/restore`)
      .set("Authorization", `Bearer ${token}`)
      .send();
    expect(res.status).toBe(404);
  });
});
