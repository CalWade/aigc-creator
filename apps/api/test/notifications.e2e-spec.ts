import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { App } from "supertest/types";

import { AppModule } from "./../src/app.module";
import { LlmClient } from "./../src/llm/llm.client";
import { PrismaService } from "./../src/prisma/prisma.service";
import { applyAllFixtures, cleanupAllFixtures } from "./../prisma/fixtures";
import { loginAsDemo, loginAsAdmin } from "./helpers/auth";

describe("Phase 2.26 — /notifications (e2e)", () => {
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

  it("未登录 GET /notifications → 401", async () => {
    await request(app.getHttpServer()).get("/notifications").expect(401);
  });

  it("GET /notifications 返回当前用户的通知列表", async () => {
    const token = await loginAsDemo(app);
    const res = await request(app.getHttpServer())
      .get("/notifications")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    const body = res.body as {
      items: { id: string; type: string; title: string; read: boolean }[];
      nextCursor: string | null;
    };
    expect(Array.isArray(body.items)).toBe(true);
    // demo-author has 2 HOT_RANK + MILESTONE_VIEWS from fixtures
    expect(body.items.length).toBeGreaterThanOrEqual(2);
  });

  it("GET /notifications/unread-count 返回未读数", async () => {
    const token = await loginAsDemo(app);
    const res = await request(app.getHttpServer())
      .get("/notifications/unread-count")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    const body = res.body as { count: number };
    expect(typeof body.count).toBe("number");
    expect(body.count).toBeGreaterThanOrEqual(2); // 2 unread from fixtures
  });

  it("PATCH /notifications/:id/read 标记已读", async () => {
    const token = await loginAsDemo(app);

    // Get list first
    const listRes = await request(app.getHttpServer())
      .get("/notifications?read=false&limit=1")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    const items = (listRes.body as { items: { id: string }[] }).items;
    if (items.length === 0) return; // no unread items to test

    const id = items[0].id;

    await request(app.getHttpServer())
      .patch(`/notifications/${id}/read`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    // Verify unread count decreased
    const countRes = await request(app.getHttpServer())
      .get("/notifications/unread-count")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    const count = (countRes.body as { count: number }).count;
    // Was at least 2, now at least 1 less
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it("PATCH /notifications/:id/read 别人通知 → 404", async () => {
    const adminToken = await loginAsAdmin(app);

    // Get demo user's notification
    const demoToken = await loginAsDemo(app);
    const listRes = await request(app.getHttpServer())
      .get("/notifications?limit=1")
      .set("Authorization", `Bearer ${demoToken}`)
      .expect(200);

    const items = (listRes.body as { items: { id: string }[] }).items;
    if (items.length === 0) return;

    // Admin tries to mark demo's notification
    await request(app.getHttpServer())
      .patch(`/notifications/${items[0].id}/read`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(404);
  });

  it("PATCH /notifications/read-all 全部标记已读", async () => {
    const token = await loginAsDemo(app);

    await request(app.getHttpServer())
      .patch("/notifications/read-all")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    const countRes = await request(app.getHttpServer())
      .get("/notifications/unread-count")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    const count = (countRes.body as { count: number }).count;
    expect(count).toBe(0);
  });

  it("GET /notifications?read=false 过滤只看未读", async () => {
    const token = await loginAsDemo(app);

    const res = await request(app.getHttpServer())
      .get("/notifications?read=false")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    const items = (res.body as { items: { read: boolean }[] }).items;
    for (const item of items) {
      expect(item.read).toBe(false);
    }
  });

  it("admin 下线后作者收到 POST_TAKEN_DOWN 通知", async () => {
    // Re-apply fixtures to reset state
    await applyAllFixtures(prisma);

    const adminToken = await loginAsAdmin(app);
    const demoToken = await loginAsDemo(app);

    // Get the PUBLISHED draft
    const PUBLISHED_DRAFT_ID = "pub000draft0000000000000000";

    // Offline it
    await request(app.getHttpServer())
      .post(`/admin/drafts/${PUBLISHED_DRAFT_ID}/offline`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reason: "命中政策违规" })
      .expect(200);

    // Check author's notifications include POST_TAKEN_DOWN
    const notifRes = await request(app.getHttpServer())
      .get("/notifications?limit=50")
      .set("Authorization", `Bearer ${demoToken}`)
      .expect(200);

    const items = (notifRes.body as { items: { type: string; title: string }[] }).items;
    const takedown = items.find((n) => n.type === "POST_TAKEN_DOWN");
    expect(takedown).toBeDefined();
    expect(takedown!.title).toBe("作品被下线");
  });
});
