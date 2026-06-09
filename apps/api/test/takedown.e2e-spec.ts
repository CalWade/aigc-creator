import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { App } from "supertest/types";

import { AppModule } from "./../src/app.module";
import { LlmClient } from "./../src/llm/llm.client";
import { PrismaService } from "./../src/prisma/prisma.service";
import { applyAllFixtures, cleanupAllFixtures } from "./../prisma/fixtures";
import { loginAs, loginAsDemo } from "./helpers/auth";

const DEMO_FAST_DRAFT_ID = "demodraft0000000000000001";

async function seedAllowReview(prisma: PrismaService, draftId: string): Promise<void> {
  const review = await prisma.review.create({
    data: {
      draftId,
      stage: "PREFLIGHT",
      safety: { overall: 100, dimensions: [] },
      quality: { overall: 80, dimensions: [] },
      recommendation: "ALLOW",
      modelMeta: {},
    },
  });
  await prisma.draft.update({ where: { id: draftId }, data: { lastReviewId: review.id } });
}

describe("Phase 2.18 — 作者主动下线 + OFFLINE 重新提审 (e2e)", () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let tokenA: string;
  let tokenB: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(LlmClient)
      .useValue({ chat: jest.fn(), chatStream: jest.fn() })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();

    prisma = app.get(PrismaService);
    await applyAllFixtures(prisma);
    tokenA = await loginAsDemo(app);
    tokenB = await loginAs(app, "tech-author");
  });

  afterAll(async () => {
    await cleanupAllFixtures(prisma);
    await app.close();
  });

  beforeEach(async () => {
    // 复位 demo 草稿到首发态
    await prisma.draft.update({
      where: { id: DEMO_FAST_DRAFT_ID },
      data: {
        status: "DRAFT",
        publishedAt: null,
        publishedTitle: null,
        publishedVersion: null,
        offlineReason: null,
        offlineAt: null,
        title: "demo·快速稿示例",
        body: { type: "doc", content: [{ type: "paragraph", text: "v1 正文" }] },
        lastReviewId: null,
      },
    });
    await prisma.$executeRaw`UPDATE "drafts" SET "publishedBody" = NULL WHERE id = ${DEMO_FAST_DRAFT_ID}`;
    await prisma.review.deleteMany({ where: { draftId: DEMO_FAST_DRAFT_ID } });
  });

  it("完整链路:发布 → 下线 → 公网404 → 恢复 → 重走预检+发布 → 再次上线", async () => {
    // 1. 用户 A 创建(已有) + preflight + publish
    await seedAllowReview(prisma, DEMO_FAST_DRAFT_ID);
    await request(app.getHttpServer())
      .post(`/drafts/${DEMO_FAST_DRAFT_ID}/publish`)
      .set("Authorization", `Bearer ${tokenA}`)
      .expect(200);

    // 2. 公网 GET /post/:id → 200(确认线上可见)
    await request(app.getHttpServer()).get(`/post/${DEMO_FAST_DRAFT_ID}`).expect(200);

    // 3. 用户 A POST /drafts/:id/takedown reason="测试下线" → 200, status OFFLINE
    const takedownRes = await request(app.getHttpServer())
      .post(`/drafts/${DEMO_FAST_DRAFT_ID}/takedown`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ reason: "测试下线" })
      .expect(200);
    expect((takedownRes.body as { status: string }).status).toBe("OFFLINE");

    const afterTakedown = await prisma.draft.findUnique({ where: { id: DEMO_FAST_DRAFT_ID } });
    expect(afterTakedown?.offlineReason).toBe("测试下线");
    expect(afterTakedown?.offlineAt).not.toBeNull();

    // 4. 公网 GET /post/:id → 404
    await request(app.getHttpServer()).get(`/post/${DEMO_FAST_DRAFT_ID}`).expect(404);

    // 5. 用户 A POST /drafts/:id/restore-from-offline → 200, status DRAFT, version+1
    const versionBefore = afterTakedown?.version ?? 0;
    const restoreRes = await request(app.getHttpServer())
      .post(`/drafts/${DEMO_FAST_DRAFT_ID}/restore-from-offline`)
      .set("Authorization", `Bearer ${tokenA}`)
      .expect(200);
    expect((restoreRes.body as { status: string }).status).toBe("DRAFT");

    const afterRestore = await prisma.draft.findUnique({ where: { id: DEMO_FAST_DRAFT_ID } });
    expect(afterRestore?.status).toBe("DRAFT");
    expect(afterRestore?.version).toBe(versionBefore + 1);
    expect(afterRestore?.publishedBody).toBeNull();
    expect(afterRestore?.publishedTitle).toBeNull();
    expect(afterRestore?.publishedVersion).toBeNull();
    expect(afterRestore?.offlineReason).toBeNull();
    expect(afterRestore?.offlineAt).toBeNull();

    // 6. 用户 A 重走 preflight + publish → 再次成功上线
    await seedAllowReview(prisma, DEMO_FAST_DRAFT_ID);
    await request(app.getHttpServer())
      .post(`/drafts/${DEMO_FAST_DRAFT_ID}/publish`)
      .set("Authorization", `Bearer ${tokenA}`)
      .expect(200);

    const afterRepublish = await prisma.draft.findUnique({ where: { id: DEMO_FAST_DRAFT_ID } });
    expect(afterRepublish?.status).toBe("PUBLISHED");
    expect(afterRepublish?.publishedAt).not.toBeNull();

    // 公网再次可见
    await request(app.getHttpServer()).get(`/post/${DEMO_FAST_DRAFT_ID}`).expect(200);
  });

  it("非作者 POST /drafts/:id/takedown → 403", async () => {
    await seedAllowReview(prisma, DEMO_FAST_DRAFT_ID);
    await request(app.getHttpServer())
      .post(`/drafts/${DEMO_FAST_DRAFT_ID}/publish`)
      .set("Authorization", `Bearer ${tokenA}`)
      .expect(200);

    await request(app.getHttpServer())
      .post(`/drafts/${DEMO_FAST_DRAFT_ID}/takedown`)
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ reason: "非法操作" })
      .expect(403);
  });

  it("非作者 POST /drafts/:id/restore-from-offline → 403", async () => {
    await seedAllowReview(prisma, DEMO_FAST_DRAFT_ID);
    await request(app.getHttpServer())
      .post(`/drafts/${DEMO_FAST_DRAFT_ID}/publish`)
      .set("Authorization", `Bearer ${tokenA}`)
      .expect(200);

    await request(app.getHttpServer())
      .post(`/drafts/${DEMO_FAST_DRAFT_ID}/takedown`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({})
      .expect(200);

    // tech-author(B) 尝试恢复 → 403
    await request(app.getHttpServer())
      .post(`/drafts/${DEMO_FAST_DRAFT_ID}/restore-from-offline`)
      .set("Authorization", `Bearer ${tokenB}`)
      .expect(403);
  });
});
