import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { App } from "supertest/types";
import type { AnalyticsResponse } from "@bytedance-aigc/shared";

import { AppModule } from "./../src/app.module";
import { PrismaService } from "./../src/prisma/prisma.service";
import { applyAllFixtures, cleanupAllFixtures, DEMO_AUTHOR_ID } from "./../prisma/fixtures";
import { loginAsDemo } from "./helpers/auth";

describe("/me/analytics (e2e)", () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let token: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

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

    // 给 demo 作者前 3 篇 PUBLISHED 文章打 PostStat,验证聚合非零
    const published = await prisma.draft.findMany({
      where: { authorId: DEMO_AUTHOR_ID, status: "PUBLISHED" },
      select: { id: true },
      orderBy: { id: "asc" },
      take: 3,
    });
    expect(published.length).toBeGreaterThanOrEqual(3);
    await prisma.postStat.create({
      data: {
        draftId: published[0].id,
        impression: 1000,
        click: 200,
        like: 30,
        collect: 10,
        share: 5,
        report: 0,
      },
    });
    await prisma.postStat.create({
      data: {
        draftId: published[1].id,
        impression: 500,
        click: 100,
        like: 60,
        collect: 20,
        share: 10,
        report: 1,
      },
    });
    await prisma.postStat.create({
      data: {
        draftId: published[2].id,
        impression: 300,
        click: 50,
        like: 5,
        collect: 1,
        share: 1,
        report: 0,
      },
    });

    token = await loginAsDemo(app);
  });

  afterAll(async () => {
    await cleanupAllFixtures(prisma);
    await app.close();
  });

  it("无 token → 401", async () => {
    await request(app.getHttpServer()).get("/me/analytics").expect(401);
  });

  it("返回 totals 聚合且与 PostStat 三条加和一致", async () => {
    const res = await request(app.getHttpServer())
      .get("/me/analytics")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const body = res.body as AnalyticsResponse;
    expect(body.totals.totalImpression).toBe(1800);
    expect(body.totals.totalClick).toBe(350);
    expect(body.totals.totalLike).toBe(95);
    expect(body.totals.totalCollect).toBe(31);
    expect(body.totals.totalShare).toBe(16);
    expect(body.totals.totalReport).toBe(1);
    // (95+31+16)/350 = 0.405...; 保留 3 位 = 0.406
    expect(body.totals.engagementRate).toBeCloseTo(0.406, 2);
    expect(body.totals.totalPublished).toBeGreaterThanOrEqual(3);
  });

  it("topPosts 按互动量降序,第一名是 like+collect+share 最大那篇", async () => {
    const res = await request(app.getHttpServer())
      .get("/me/analytics")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const body = res.body as AnalyticsResponse;
    expect(body.topPosts.length).toBeGreaterThan(0);
    expect(body.topPosts[0].like + body.topPosts[0].collect + body.topPosts[0].share).toBe(90);
    expect(body.topPosts.length).toBeLessThanOrEqual(5);
    // 互动量降序
    for (let i = 1; i < body.topPosts.length; i++) {
      const a = body.topPosts[i - 1];
      const b = body.topPosts[i];
      const ia = a.like + a.collect + a.share;
      const ib = b.like + b.collect + b.share;
      expect(ia).toBeGreaterThanOrEqual(ib);
    }
  });

  it("avgQualityOverall 与 premiumRate 在 0-100 / 0-1 区间", async () => {
    const res = await request(app.getHttpServer())
      .get("/me/analytics")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const body = res.body as AnalyticsResponse;
    expect(body.totals.avgQualityOverall).toBeGreaterThanOrEqual(0);
    expect(body.totals.avgQualityOverall).toBeLessThanOrEqual(100);
    expect(body.totals.premiumRate).toBeGreaterThanOrEqual(0);
    expect(body.totals.premiumRate).toBeLessThanOrEqual(1);
  });
});
