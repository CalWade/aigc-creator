import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { App } from "supertest/types";

import { AppModule } from "./../src/app.module";
import { LlmClient } from "./../src/llm/llm.client";
import { PrismaService } from "./../src/prisma/prisma.service";
import { applyAllFixtures, cleanupAllFixtures } from "./../prisma/fixtures";
import { loginAs, loginAsDemo } from "./helpers/auth";

interface MeReportsResp {
  items: Array<{
    id: string;
    postId: string;
    postTitle: string;
    reporterHandle: string;
    status: "PENDING" | "RESOLVED";
    resolution: "OFFLINE" | "WARN" | "DISMISS" | null;
  }>;
  nextCursor: string | null;
}

describe("Phase 2.6 — GET /me/reports (e2e)", () => {
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

  it("未登录 → 401", async () => {
    await request(app.getHttpServer()).get("/me/reports").expect(401);
  });

  it("作者(demo-author)看到自己稿件被举报 — 至少 1 条(seed POST_001 归 demo-author)", async () => {
    const token = await loginAsDemo(app);
    const res = await request(app.getHttpServer())
      .get("/me/reports")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const body = res.body as MeReportsResp;
    expect(Array.isArray(body.items)).toBe(true);
    // seed POST_001 归 demo-author(每 3 篇轮换:0,3,6...),被 tech-author 举报
    expect(body.items.length).toBeGreaterThanOrEqual(1);
    for (const it of body.items) {
      expect(typeof it.postTitle).toBe("string");
      expect(typeof it.reporterHandle).toBe("string");
    }
  });

  it("life-author 看不到 demo-author 名下被举报记录(WHERE post.authorId 隔离)", async () => {
    const token = await loginAs(app, "life-author");
    const res = await request(app.getHttpServer())
      .get("/me/reports")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const body = res.body as MeReportsResp;
    // life-author 名下:POST_002 被 life 举报(reporter)、POST_003 不在 life 名下(POST_003 = pub002...
    // 是 life-author 的稿,被 demo-author DISMISS 举报 — 所以 life 看自己稿件应该看到 POST_003 的 RESOLVED 那条)
    // 这里只断言:items 中所有 postId 都不属于 demo-author 的 PUBLISHED 第一篇(POST_001)
    for (const it of body.items) {
      expect(it.postId).not.toBe("pub000draft0000000000000000");
    }
  });

  it("cursor 翻页:limit=1 翻 2 页拿到的不是同一条", async () => {
    const token = await loginAsDemo(app);
    // 手工再造 2 条 demo-author 名下被举报的记录,确保 ≥ 2
    await prisma.report.create({
      data: {
        postId: "pub003draft0000000000000000", // demo-author 第 2 篇 (3*1=3 是 tech-author? — 0,3,6,9 都是 demo)
        reporterId: "techauthor000000000000002",
        category: "OTHER",
        reason: "翻页测试 1",
      },
    });
    await prisma.report.create({
      data: {
        postId: "pub006draft0000000000000000",
        reporterId: "lifeauthor000000000000003",
        category: "OTHER",
        reason: "翻页测试 2",
      },
    });

    const r1 = await request(app.getHttpServer())
      .get("/me/reports?limit=1")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const b1 = r1.body as MeReportsResp;
    expect(b1.items).toHaveLength(1);
    expect(b1.nextCursor).not.toBeNull();

    const r2 = await request(app.getHttpServer())
      .get(`/me/reports?limit=1&cursor=${encodeURIComponent(b1.nextCursor!)}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const b2 = r2.body as MeReportsResp;
    expect(b2.items).toHaveLength(1);
    expect(b2.items[0].id).not.toBe(b1.items[0].id);
  });

  it("非法 cursor → 400 CURSOR_INVALID", async () => {
    const token = await loginAsDemo(app);
    const res = await request(app.getHttpServer())
      .get("/me/reports?cursor=not-base64-anymore")
      .set("Authorization", `Bearer ${token}`)
      .expect(400);
    expect((res.body as { code: string }).code).toBe("CURSOR_INVALID");
  });
});
