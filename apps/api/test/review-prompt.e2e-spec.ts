import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { App } from "supertest/types";

import { AppModule } from "./../src/app.module";
import { LlmClient } from "./../src/llm/llm.client";
import { PrismaService } from "./../src/prisma/prisma.service";
import { applyAllFixtures, cleanupAllFixtures } from "./../prisma/fixtures";
import { loginAsDemo } from "./helpers/auth";

const ALL_LOW = JSON.stringify({
  dimensions: [
    { key: "politics", score: 0, severity: "low", hits: [], reason: "无" },
    { key: "pornography", score: 0, severity: "low", hits: [], reason: "无" },
    { key: "gambling", score: 0, severity: "low", hits: [], reason: "无" },
    { key: "drugs", score: 0, severity: "low", hits: [], reason: "无" },
    { key: "vulgarity", score: 0, severity: "low", hits: [], reason: "无" },
    { key: "fraud", score: 0, severity: "low", hits: [], reason: "无" },
    { key: "medical", score: 0, severity: "low", hits: [], reason: "无" },
  ],
});

const POLITICS_HIGH = JSON.stringify({
  dimensions: [
    { key: "politics", score: 90, severity: "high", hits: ["x"], reason: "命中" },
    { key: "pornography", score: 0, severity: "low", hits: [], reason: "无" },
    { key: "gambling", score: 0, severity: "low", hits: [], reason: "无" },
    { key: "drugs", score: 0, severity: "low", hits: [], reason: "无" },
    { key: "vulgarity", score: 0, severity: "low", hits: [], reason: "无" },
    { key: "fraud", score: 0, severity: "low", hits: [], reason: "无" },
    { key: "medical", score: 0, severity: "low", hits: [], reason: "无" },
  ],
});

const VULGAR_MEDIUM = JSON.stringify({
  dimensions: [
    { key: "politics", score: 0, severity: "low", hits: [], reason: "无" },
    { key: "pornography", score: 0, severity: "low", hits: [], reason: "无" },
    { key: "gambling", score: 0, severity: "low", hits: [], reason: "无" },
    { key: "drugs", score: 0, severity: "low", hits: [], reason: "无" },
    { key: "vulgarity", score: 50, severity: "medium", hits: [], reason: "" },
    { key: "fraud", score: 0, severity: "low", hits: [], reason: "无" },
    { key: "medical", score: 0, severity: "low", hits: [], reason: "无" },
  ],
});

describe("Phase 2.5 review prompt (e2e)", () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let token: string;
  const llmChatMock = jest.fn();

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(LlmClient)
      .useValue({ chat: llmChatMock, chatStream: jest.fn() })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
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

  beforeEach(() => llmChatMock.mockReset());

  it("ALLOW: 全 low → 200 + recommendation ALLOW", async () => {
    llmChatMock.mockResolvedValueOnce(ALL_LOW);
    const res = await request(app.getHttpServer())
      .post("/reviews/prompt")
      .set("Authorization", `Bearer ${token}`)
      .send({ text: "正常选题" })
      .expect(200);
    const body = res.body as { recommendation: string; hitCategories: string[] };
    expect(body.recommendation).toBe("ALLOW");
    expect(body.hitCategories).toEqual([]);
  });

  it("BLOCK: politics high → recommendation BLOCK + 命中类目", async () => {
    llmChatMock.mockResolvedValueOnce(POLITICS_HIGH);
    const res = await request(app.getHttpServer())
      .post("/reviews/prompt")
      .set("Authorization", `Bearer ${token}`)
      .send({ text: "敏感选题" })
      .expect(200);
    const body = res.body as { recommendation: string; hitCategories: string[] };
    expect(body.recommendation).toBe("BLOCK");
    expect(body.hitCategories).toContain("politics");
  });

  it("WARN: vulgarity medium → recommendation WARN", async () => {
    llmChatMock.mockResolvedValueOnce(VULGAR_MEDIUM);
    const res = await request(app.getHttpServer())
      .post("/reviews/prompt")
      .set("Authorization", `Bearer ${token}`)
      .send({ text: "略低俗" })
      .expect(200);
    expect((res.body as { recommendation: string }).recommendation).toBe("WARN");
  });

  it("401 无 token", async () => {
    await request(app.getHttpServer())
      .post("/reviews/prompt")
      .send({ text: "无 token" })
      .expect(401);
    expect(llmChatMock).not.toHaveBeenCalled();
  });
});
