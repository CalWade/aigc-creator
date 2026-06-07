import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { App } from "supertest/types";

import { AppModule } from "./../src/app.module";
import { LlmClient } from "./../src/llm/llm.client";
import { PrismaService } from "./../src/prisma/prisma.service";
import { applyAllFixtures, cleanupAllFixtures } from "./../prisma/fixtures";
import { loginAsAdmin, loginAsDemo } from "./helpers/auth";

const PUBLISHED_DRAFT_ID = "pub000draft0000000000000000"; // demo 作者的第一篇 PUBLISHED
const DEMO_DRAFT_ID = "demodraft0000000000000001"; // demo 的 DRAFT 态稿
const NONEXISTENT_ID = "nonexistent000000000000000";

describe("Phase 2.11 — /admin/drafts /admin/posts (e2e)", () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

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
  });

  afterAll(async () => {
    await cleanupAllFixtures(prisma);
    await app.close();
  });

  it("非 admin POST /admin/drafts/:id/offline → 403 ADMIN_REQUIRED", async () => {
    const token = await loginAsDemo(app);
    const res = await request(app.getHttpServer())
      .post(`/admin/drafts/${PUBLISHED_DRAFT_ID}/offline`)
      .set("Authorization", `Bearer ${token}`)
      .send({ reason: "测试" })
      .expect(403);
    expect((res.body as { code: string }).code).toBe("ADMIN_REQUIRED");
  });

  it("admin 直接下线 PUBLISHED → Draft.status=OFFLINE + offlineReason 写入", async () => {
    const token = await loginAsAdmin(app);
    const before = await prisma.draft.findUnique({ where: { id: PUBLISHED_DRAFT_ID } });
    expect(before?.status).toBe("PUBLISHED");

    await request(app.getHttpServer())
      .post(`/admin/drafts/${PUBLISHED_DRAFT_ID}/offline`)
      .set("Authorization", `Bearer ${token}`)
      .send({ reason: "命中政策违规" })
      .expect(200);

    const after = await prisma.draft.findUnique({ where: { id: PUBLISHED_DRAFT_ID } });
    expect(after?.status).toBe("OFFLINE");
    expect(after?.offlineReason).toBe("命中政策违规");
    expect(after?.offlineAt).not.toBeNull();
  });

  it("已 OFFLINE 再次下线 → 400 ALREADY_OFFLINE", async () => {
    const token = await loginAsAdmin(app);
    const res = await request(app.getHttpServer())
      .post(`/admin/drafts/${PUBLISHED_DRAFT_ID}/offline`)
      .set("Authorization", `Bearer ${token}`)
      .send({})
      .expect(400);
    expect((res.body as { code: string }).code).toBe("ALREADY_OFFLINE");
  });

  it("DRAFT 态稿件下线 → 400 NOT_PUBLISHED", async () => {
    const token = await loginAsAdmin(app);
    const res = await request(app.getHttpServer())
      .post(`/admin/drafts/${DEMO_DRAFT_ID}/offline`)
      .set("Authorization", `Bearer ${token}`)
      .send({})
      .expect(400);
    expect((res.body as { code: string }).code).toBe("NOT_PUBLISHED");
  });

  it("不存在的 draft → 404 DRAFT_NOT_FOUND", async () => {
    const token = await loginAsAdmin(app);
    const res = await request(app.getHttpServer())
      .post(`/admin/drafts/${NONEXISTENT_ID}/offline`)
      .set("Authorization", `Bearer ${token}`)
      .send({})
      .expect(404);
    expect((res.body as { code: string }).code).toBe("DRAFT_NOT_FOUND");
  });

  it("admin 预览 OFFLINE 稿件返回完整 body", async () => {
    const token = await loginAsAdmin(app);
    const res = await request(app.getHttpServer())
      .get(`/admin/posts/${PUBLISHED_DRAFT_ID}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const body = res.body as {
      id: string;
      status: string;
      body: unknown;
      offlineReason: string | null;
    };
    expect(body.id).toBe(PUBLISHED_DRAFT_ID);
    expect(body.status).toBe("OFFLINE");
    expect(body.body).toBeTruthy();
    expect(body.offlineReason).toBeTruthy();
  });

  it("公共 /post/:id 对 OFFLINE 稿件仍返 404(admin 预览不影响公共流)", async () => {
    await request(app.getHttpServer()).get(`/post/${PUBLISHED_DRAFT_ID}`).expect(404);
  });

  it("非 admin 调 /admin/posts/:id → 403", async () => {
    const token = await loginAsDemo(app);
    await request(app.getHttpServer())
      .get(`/admin/posts/${PUBLISHED_DRAFT_ID}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(403);
  });
});
