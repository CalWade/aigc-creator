import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { App } from "supertest/types";

import { AppModule } from "./../src/app.module";
import { LlmClient } from "./../src/llm/llm.client";
import { PrismaService } from "./../src/prisma/prisma.service";
import { applyAllFixtures, cleanupAllFixtures, DEMO_AUTHOR_ID } from "./../prisma/fixtures";
import { loginAsDemo } from "./helpers/auth";

const OTHER_AUTHOR_ID = "promptother00000000000001";
const OTHER_PRIVATE_PROMPT_ID = "promptotherp0000000000001";
const NONEXISTENT_PROMPT_ID = "ghostprompt000000000000x";

describe("Prompts write API (e2e)", () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let token: string;
  let platformPromptId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(LlmClient)
      .useValue({ chat: jest.fn(), chatStream: jest.fn() })
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

    // 取一个 PLATFORM prompt 用于 copy 测
    const platform = await prisma.prompt.findFirstOrThrow({
      where: { owner: "PLATFORM", tool: "REWRITE_FLUENT" },
    });
    platformPromptId = platform.id;

    // 一个非 demo 用户 + 他的私有 prompt(用于测越权 403)
    await prisma.user.create({
      data: { id: OTHER_AUTHOR_ID, handle: "other-author-prompts" },
    });
    await prisma.prompt.create({
      data: {
        id: OTHER_PRIVATE_PROMPT_ID,
        owner: "PRIVATE",
        authorId: OTHER_AUTHOR_ID,
        tool: "EXPAND",
        name: "他人私有",
        systemPrompt: "他人私有 prompt",
        params: {},
        fewShots: [],
        isStarter: false,
      },
    });

    token = await loginAsDemo(app);
  });

  afterAll(async () => {
    await cleanupAllFixtures(prisma);
    await app.close();
  });

  it("GET /prompts/private 起初为空", async () => {
    const res = await request(app.getHttpServer())
      .get("/prompts/private")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(res.body).toEqual([]);
  });

  it("POST /prompts/:platformId/copy -> 201,新建 PRIVATE 副本溯源 sourcePromptId", async () => {
    const res = await request(app.getHttpServer())
      .post(`/prompts/${platformPromptId}/copy`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);
    const body = res.body as {
      id: string;
      owner: string;
      authorId: string;
      sourcePromptId: string;
      isStarter: boolean;
    };
    expect(body.owner).toBe("PRIVATE");
    expect(body.authorId).toBe(DEMO_AUTHOR_ID);
    expect(body.sourcePromptId).toBe(platformPromptId);
    expect(body.isStarter).toBe(false);
  });

  it("POST /prompts/:nonexistent/copy -> 404", async () => {
    await request(app.getHttpServer())
      .post(`/prompts/${NONEXISTENT_PROMPT_ID}/copy`)
      .set("Authorization", `Bearer ${token}`)
      .expect(404);
  });

  it("POST /prompts/:privateId/copy -> 400(不能复制 PRIVATE)", async () => {
    await request(app.getHttpServer())
      .post(`/prompts/${OTHER_PRIVATE_PROMPT_ID}/copy`)
      .set("Authorization", `Bearer ${token}`)
      .expect(400);
  });

  it("PATCH /prompts/:id 改自己 PRIVATE -> 200,字段被更新", async () => {
    const mine = await prisma.prompt.findFirstOrThrow({
      where: { owner: "PRIVATE", authorId: DEMO_AUTHOR_ID },
    });
    const res = await request(app.getHttpServer())
      .patch(`/prompts/${mine.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ systemPrompt: "改写后的 system", designNote: "我的笔记" })
      .expect(200);
    const body = res.body as { systemPrompt: string; designNote: string };
    expect(body.systemPrompt).toBe("改写后的 system");
    expect(body.designNote).toBe("我的笔记");
  });

  it("PATCH /prompts/:platformId -> 403(平台 prompt 不可改)", async () => {
    await request(app.getHttpServer())
      .patch(`/prompts/${platformPromptId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ systemPrompt: "应被拒绝" })
      .expect(403);
  });

  it("PATCH /prompts/:otherPrivateId -> 403(别人的私有不可改)", async () => {
    await request(app.getHttpServer())
      .patch(`/prompts/${OTHER_PRIVATE_PROMPT_ID}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ systemPrompt: "x" })
      .expect(403);
  });

  it("DELETE /prompts/:id 删自己 PRIVATE -> 204", async () => {
    const mine = await prisma.prompt.findFirstOrThrow({
      where: { owner: "PRIVATE", authorId: DEMO_AUTHOR_ID },
    });
    await request(app.getHttpServer())
      .delete(`/prompts/${mine.id}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(204);

    const deleted = await prisma.prompt.findUnique({ where: { id: mine.id } });
    expect(deleted).toBeNull();
  });
});
