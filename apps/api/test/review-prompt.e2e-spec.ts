import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { App } from "supertest/types";

import { AppModule } from "./../src/app.module";
import { LlmClient } from "./../src/llm/llm.client";
import { GuardClient } from "./../src/llm/guard.client";
import type { GuardResult } from "./../src/llm/guard.client";
import { PrismaService } from "./../src/prisma/prisma.service";
import { applyAllFixtures, cleanupAllFixtures } from "./../prisma/fixtures";
import { loginAsDemo } from "./helpers/auth";

const ALL_PASS_GUARD: GuardResult = { suggestion: "pass", details: [] };

const SAFETY_ALL_LOW = JSON.stringify({
  dimensions: [
    { key: "pornography", score: 0, severity: "low", hits: [], reason: "无命中" },
    { key: "gambling", score: 0, severity: "low", hits: [], reason: "无命中" },
    { key: "drugs", score: 0, severity: "low", hits: [], reason: "无命中" },
    { key: "abuse", score: 0, severity: "low", hits: [], reason: "无命中" },
    { key: "fraud", score: 0, severity: "low", hits: [], reason: "无命中" },
    { key: "illicit_ads", score: 0, severity: "low", hits: [], reason: "无命中" },
  ],
});

const PORN_HIGH_GUARD: GuardResult = {
  suggestion: "block",
  details: [
    {
      type: "contentModeration",
      level: "high",
      suggestion: "block",
      labels: ["pornographic_adult"],
      confidence: 99.5,
    },
  ],
};

const ABUSE_MEDIUM_GUARD: GuardResult = {
  suggestion: "watch",
  details: [
    {
      type: "contentModeration",
      level: "medium",
      suggestion: "watch",
      labels: ["inappropriate_profanity"],
      confidence: 75.0,
    },
  ],
};

describe("Phase 2.5 review prompt (e2e)", () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let token: string;
  const guardModerateMock = jest.fn();
  const llmChatMock = jest.fn();

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(LlmClient)
      .useValue({ chat: llmChatMock, chatStream: jest.fn() })
      .overrideProvider(GuardClient)
      .useValue({ moderate: guardModerateMock })
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

  beforeEach(() => {
    guardModerateMock.mockReset();
    llmChatMock.mockReset().mockResolvedValue(SAFETY_ALL_LOW);
  });

  it("ALLOW: 全 pass → 200 + recommendation ALLOW", async () => {
    guardModerateMock.mockResolvedValueOnce(ALL_PASS_GUARD);
    const res = await request(app.getHttpServer())
      .post("/reviews/prompt")
      .set("Authorization", `Bearer ${token}`)
      .send({ text: "正常选题" })
      .expect(200);
    const body = res.body as { recommendation: string; hitCategories: string[] };
    expect(body.recommendation).toBe("ALLOW");
    expect(body.hitCategories).toEqual([]);
  });

  it("BLOCK: pornography high → recommendation BLOCK + 命中类目", async () => {
    guardModerateMock.mockResolvedValueOnce(PORN_HIGH_GUARD);
    const res = await request(app.getHttpServer())
      .post("/reviews/prompt")
      .set("Authorization", `Bearer ${token}`)
      .send({ text: "敏感选题" })
      .expect(200);
    const body = res.body as { recommendation: string; hitCategories: string[] };
    expect(body.recommendation).toBe("BLOCK");
    expect(body.hitCategories).toContain("pornography");
  });

  it("WARN: abuse medium → recommendation WARN", async () => {
    guardModerateMock.mockResolvedValueOnce(ABUSE_MEDIUM_GUARD);
    const res = await request(app.getHttpServer())
      .post("/reviews/prompt")
      .set("Authorization", `Bearer ${token}`)
      .send({ text: "略有冒犯" })
      .expect(200);
    expect((res.body as { recommendation: string }).recommendation).toBe("WARN");
  });

  it("401 无 token", async () => {
    await request(app.getHttpServer())
      .post("/reviews/prompt")
      .send({ text: "无 token" })
      .expect(401);
    expect(guardModerateMock).not.toHaveBeenCalled();
  });
});
