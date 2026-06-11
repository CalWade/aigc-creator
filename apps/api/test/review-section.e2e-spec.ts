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

const DEMO_DRAFT_ID = "demodraft0000000000000001";
const OTHER_AUTHOR_ID = "otherauthor00000000000003";
const OTHER_DRAFT_ID = "otherdraftxxxxxxxxxxxxxx3";

const allPassGuard: GuardResult = { suggestion: "pass", details: [] };
const pornHighGuard: GuardResult = {
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
const abuseMediumGuard: GuardResult = {
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

describe("Phase 2.5 review section (e2e)", () => {
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

    await prisma.user.create({ data: { id: OTHER_AUTHOR_ID, handle: "section-other" } });
    await prisma.draft.create({
      data: {
        id: OTHER_DRAFT_ID,
        authorId: OTHER_AUTHOR_ID,
        mode: "FAST",
        title: "他人草稿",
        body: { type: "doc", content: [] },
        version: 1,
      },
    });

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

  const post = (body: Record<string, unknown>, t = token) =>
    request(app.getHttpServer())
      .post("/reviews/section")
      .set("Authorization", `Bearer ${t}`)
      .send(body);

  it("ALLOW: 不落 Review", async () => {
    guardModerateMock.mockResolvedValueOnce(allPassGuard);
    const before = await prisma.review.count({ where: { stage: "SECTION_INLINE" } });
    const res = await post({
      draftId: DEMO_DRAFT_ID,
      sessionId: "sess-allow",
      range: { from: 0, to: 50 },
      text: "正常",
    }).expect(200);
    expect((res.body as { recommendation: string }).recommendation).toBe("ALLOW");
    const after = await prisma.review.count({ where: { stage: "SECTION_INLINE" } });
    expect(after).toBe(before);
  });

  it("medium: 落 Review + abortStream=false", async () => {
    guardModerateMock.mockResolvedValueOnce(abuseMediumGuard);
    const res = await post({
      draftId: DEMO_DRAFT_ID,
      sessionId: "sess-medium",
      range: { from: 0, to: 100 },
      text: "略有冒犯",
    }).expect(200);
    const body = res.body as { recommendation: string; abortStream: boolean; reviewId: string };
    expect(body.recommendation).toBe("WARN");
    expect(body.abortStream).toBe(false);
    const stored = await prisma.review.findUnique({ where: { id: body.reviewId } });
    expect(stored?.stage).toBe("SECTION_INLINE");
  });

  it("连续 3 段 high → 第 3 次 abortStream=true", async () => {
    guardModerateMock
      .mockResolvedValueOnce(pornHighGuard)
      .mockResolvedValueOnce(pornHighGuard)
      .mockResolvedValueOnce(pornHighGuard);
    const sid = "sess-burst";
    const r1 = await post({
      draftId: DEMO_DRAFT_ID,
      sessionId: sid,
      range: { from: 0, to: 50 },
      text: "段 1",
    }).expect(200);
    const r2 = await post({
      draftId: DEMO_DRAFT_ID,
      sessionId: sid,
      range: { from: 51, to: 100 },
      text: "段 2",
    }).expect(200);
    const r3 = await post({
      draftId: DEMO_DRAFT_ID,
      sessionId: sid,
      range: { from: 101, to: 150 },
      text: "段 3",
    }).expect(200);
    expect((r1.body as { abortStream: boolean }).abortStream).toBe(false);
    expect((r2.body as { abortStream: boolean }).abortStream).toBe(false);
    expect((r3.body as { abortStream: boolean }).abortStream).toBe(true);
  });

  it("401: 无 token", async () => {
    await request(app.getHttpServer())
      .post("/reviews/section")
      .send({ draftId: DEMO_DRAFT_ID, sessionId: "x", range: { from: 0, to: 1 }, text: "x" })
      .expect(401);
    expect(guardModerateMock).not.toHaveBeenCalled();
  });

  it("403: 别人草稿", async () => {
    await post({
      draftId: OTHER_DRAFT_ID,
      sessionId: "x",
      range: { from: 0, to: 1 },
      text: "x",
    }).expect(403);
    expect(guardModerateMock).not.toHaveBeenCalled();
  });
});
