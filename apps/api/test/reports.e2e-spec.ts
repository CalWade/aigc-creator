import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { App } from "supertest/types";

import { AppModule } from "./../src/app.module";
import { LlmClient } from "./../src/llm/llm.client";
import { PrismaService } from "./../src/prisma/prisma.service";
import { applyAllFixtures, cleanupAllFixtures } from "./../prisma/fixtures";
import { loginAs, loginAsDemo } from "./helpers/auth";

const DEMO_FAST_DRAFT_ID = "demodraft0000000000000001"; // demo-author 的 DRAFT 稿
const PUB_DRAFT_001 = "pub000draft0000000000000000"; // 候选池第 1 篇(已被 seed report1 占用)
const PUB_DRAFT_004 = "pub003draft0000000000000000"; // 没被 seed 用过

describe("Phase 2.6 — POST /posts/:id/reports (e2e)", () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(LlmClient)
      .useValue({
        chat: jest.fn().mockResolvedValue('{"dimensions":[]}'),
        chatStream: jest.fn(),
      })
      .compile();

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

  it("未登录 → 401", async () => {
    await request(app.getHttpServer())
      .post(`/posts/${PUB_DRAFT_004}/reports`)
      .send({ category: "VULGARITY" })
      .expect(401);
  });

  it("举报 PUBLISHED 稿 → 201 + 返回 reportId", async () => {
    const token = await loginAs(app, "tech-author");
    const res = await request(app.getHttpServer())
      .post(`/posts/${PUB_DRAFT_004}/reports`)
      .set("Authorization", `Bearer ${token}`)
      .send({ category: "VULGARITY", reason: "用词低俗" })
      .expect(201);
    const body = res.body as { reportId: string };
    expect(typeof body.reportId).toBe("string");
    expect(body.reportId.length).toBeGreaterThan(0);
  });

  it("同人同稿二次举报 → 409 REPORT_DUPLICATE", async () => {
    const token = await loginAs(app, "tech-author");
    // 第二次 = 复制上面那次的 (tech-author, PUB_DRAFT_004)
    const res = await request(app.getHttpServer())
      .post(`/posts/${PUB_DRAFT_004}/reports`)
      .set("Authorization", `Bearer ${token}`)
      .send({ category: "OTHER" })
      .expect(409);
    expect((res.body as { code: string }).code).toBe("REPORT_DUPLICATE");
  });

  it("举报 DRAFT 状态稿 → 400 POST_NOT_PUBLISHED", async () => {
    const token = await loginAs(app, "tech-author");
    const res = await request(app.getHttpServer())
      .post(`/posts/${DEMO_FAST_DRAFT_ID}/reports`)
      .set("Authorization", `Bearer ${token}`)
      .send({ category: "OTHER" })
      .expect(400);
    expect((res.body as { code: string }).code).toBe("POST_NOT_PUBLISHED");
  });

  it("举报不存在的 post → 404", async () => {
    const token = await loginAs(app, "tech-author");
    await request(app.getHttpServer())
      .post(`/posts/nonexistent000000000000/reports`)
      .set("Authorization", `Bearer ${token}`)
      .send({ category: "OTHER" })
      .expect(404);
  });

  it("category 不在 enum → 400(class-validator)", async () => {
    const token = await loginAsDemo(app);
    await request(app.getHttpServer())
      .post(`/posts/${PUB_DRAFT_001}/reports`)
      .set("Authorization", `Bearer ${token}`)
      .send({ category: "NOT_A_CATEGORY" })
      .expect(400);
  });
});
