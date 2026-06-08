import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { of } from "rxjs";
import request from "supertest";
import { App } from "supertest/types";

import { AppModule } from "./../src/app.module";
import { LlmClient } from "./../src/llm/llm.client";
import { PrismaService } from "./../src/prisma/prisma.service";
import { applyAllFixtures, cleanupAllFixtures } from "./../prisma/fixtures";
import { loginAsDemo } from "./helpers/auth";

const DEMO_DRAFT_ID = "demodraft0000000000000001";

describe("Phase 2.13 safe-rewrite SSE (e2e)", () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let token: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(LlmClient)
      .useValue({
        chat: jest.fn(),
        chatStream: jest.fn(() => of({ delta: "改" }, { delta: "写" }, { done: true })),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    prisma = app.get(PrismaService);
    await applyAllFixtures(prisma);

    token = await loginAsDemo(app);
  });

  afterAll(async () => {
    await cleanupAllFixtures(prisma);
    await app.close();
  });

  it("401 未登录", async () => {
    await request(app.getHttpServer())
      .post("/reviews/safe-rewrite")
      .send({
        draftId: DEMO_DRAFT_ID,
        text: "测试文本",
        hitCategories: ["politics"],
        message: "命中",
      })
      .expect(401);
  });

  it("400 hitCategories 含非法值", async () => {
    await request(app.getHttpServer())
      .post("/reviews/safe-rewrite")
      .set("Authorization", `Bearer ${token}`)
      .send({
        draftId: DEMO_DRAFT_ID,
        text: "测试文本",
        hitCategories: ["unknown"],
        message: "命中",
      })
      .expect(400);
  });

  it("400 text 超长(>2000)", async () => {
    await request(app.getHttpServer())
      .post("/reviews/safe-rewrite")
      .set("Authorization", `Bearer ${token}`)
      .send({
        draftId: DEMO_DRAFT_ID,
        text: "x".repeat(2001),
        hitCategories: ["politics"],
        message: "命中",
      })
      .expect(400);
  });

  it("200 SSE 头与帧序", async () => {
    const res = await request(app.getHttpServer())
      .post("/reviews/safe-rewrite")
      .set("Authorization", `Bearer ${token}`)
      .send({
        draftId: DEMO_DRAFT_ID,
        text: "原文",
        hitCategories: ["politics"],
        message: "命中政治类",
      })
      .expect(200);

    expect(res.headers["content-type"]).toMatch(/text\/event-stream/);
    expect(res.text).toContain('"event":"start"');
    expect(res.text).toContain('"idx":0');
    expect(res.text).toContain('"idx":1');
    expect(res.text).toContain('"event":"done"');
  });

  it("200 不会写 Review 行", async () => {
    const before = await prisma.review.count();
    await request(app.getHttpServer())
      .post("/reviews/safe-rewrite")
      .set("Authorization", `Bearer ${token}`)
      .send({
        draftId: DEMO_DRAFT_ID,
        text: "原文",
        hitCategories: ["politics"],
        message: "命中政治类",
      })
      .expect(200);
    const after = await prisma.review.count();
    expect(after).toBe(before);
  });
});
