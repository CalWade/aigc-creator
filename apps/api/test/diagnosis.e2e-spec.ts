/**
 * Phase 2.25 — /me/works 数据回流诊断 e2e
 *   - 验证 GET /me/works 返回 stat 和 diagnosis 字段
 */
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { App } from "supertest/types";

import { AppModule } from "./../src/app.module";
import { PrismaService } from "./../src/prisma/prisma.service";
import { applyAllFixtures, cleanupAllFixtures, DEMO_AUTHOR_ID } from "./../prisma/fixtures";
import { loginAsDemo } from "./helpers/auth";

interface MeWorksItem {
  id: string;
  status: string;
  stat: {
    impression: number;
    click: number;
    dwellUnit: number;
    like: number;
    collect: number;
    share: number;
  } | null;
  diagnosis: { title: string; description: string; toolAction: string } | null;
  qualityOverall: number;
}

interface MeWorksResp {
  items: MeWorksItem[];
}

describe("/me/works diagnosis (e2e) — Phase 2.25", () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let token: string;
  let lowImpressionHighQualityId: string;
  let highImpressionLowCompletionId: string;

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

    // 创建两篇 PUBLISHED 稿件并挂上已知质量分的 Review,再灌 PostStat
    // 1. 低阅读+高质量 → HEADLINE_NEW
    lowImpressionHighQualityId = "diag-low-imp-high-q-0000000001";
    await prisma.draft.create({
      data: {
        id: lowImpressionHighQualityId,
        authorId: DEMO_AUTHOR_ID,
        mode: "FAST",
        status: "PUBLISHED",
        title: "诊断测试:低阅读高质量",
        body: {
          type: "doc",
          content: [{ type: "paragraph", content: [{ type: "text", text: "测试" }] }],
        },
        publishedAt: new Date(),
      },
    });
    const review1 = await prisma.review.create({
      data: {
        draftId: lowImpressionHighQualityId,
        stage: "PREFLIGHT",
        recommendation: "ALLOW",
        safety: {},
        quality: {
          overall: 85,
          dims: { value: 85, expression: 85, experience: 85, potential: 85 },
        },
        modelMeta: {},
      },
    });
    await prisma.draft.update({
      where: { id: lowImpressionHighQualityId },
      data: { lastReviewId: review1.id },
    });
    await prisma.postStat.create({
      data: {
        draftId: lowImpressionHighQualityId,
        impression: 50,
        click: 5,
        dwellUnit: 4,
        like: 1,
        collect: 0,
        share: 0,
      },
    });

    // 2. 高阅读+低完读 → REWRITE_OPENING
    highImpressionLowCompletionId = "diag-high-imp-low-comp00000001";
    await prisma.draft.create({
      data: {
        id: highImpressionLowCompletionId,
        authorId: DEMO_AUTHOR_ID,
        mode: "FINE",
        status: "PUBLISHED",
        title: "诊断测试:高阅读低完读",
        body: {
          type: "doc",
          content: [{ type: "paragraph", content: [{ type: "text", text: "测试" }] }],
        },
        publishedAt: new Date(),
      },
    });
    const review2 = await prisma.review.create({
      data: {
        draftId: highImpressionLowCompletionId,
        stage: "PREFLIGHT",
        recommendation: "ALLOW",
        safety: {},
        quality: {
          overall: 50,
          dims: { value: 50, expression: 50, experience: 50, potential: 50 },
        },
        modelMeta: {},
      },
    });
    await prisma.draft.update({
      where: { id: highImpressionLowCompletionId },
      data: { lastReviewId: review2.id },
    });
    await prisma.postStat.create({
      data: {
        draftId: highImpressionLowCompletionId,
        impression: 500,
        click: 200,
        dwellUnit: 30,
        like: 5,
        collect: 2,
        share: 1,
      },
    });

    token = await loginAsDemo(app);
  });

  afterAll(async () => {
    await cleanupAllFixtures(prisma);
    await app.close();
  });

  it("PUBLISHED 稿件含 stat 字段", async () => {
    const res = await request(app.getHttpServer())
      .get("/me/works?status=PUBLISHED")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const body = res.body as MeWorksResp;
    const item = body.items.find((i) => i.id === lowImpressionHighQualityId);
    expect(item).toBeDefined();
    expect(item!.stat).not.toBeNull();
    expect(item!.stat!.impression).toBe(50);
    expect(item!.stat!.click).toBe(5);
  });

  it("低阅读+高质量 → diagnosis.toolAction=HEADLINE_NEW", async () => {
    const res = await request(app.getHttpServer())
      .get("/me/works?status=PUBLISHED")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const body = res.body as MeWorksResp;
    const item = body.items.find((i) => i.id === lowImpressionHighQualityId);
    expect(item).toBeDefined();
    expect(item!.diagnosis).not.toBeNull();
    expect(item!.diagnosis!.toolAction).toBe("HEADLINE_NEW");
    expect(item!.diagnosis!.title).toBe("好文章被埋了");
  });

  it("高阅读+低完读 → diagnosis.toolAction=REWRITE_OPENING", async () => {
    const res = await request(app.getHttpServer())
      .get("/me/works?status=PUBLISHED")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const body = res.body as MeWorksResp;
    const item = body.items.find((i) => i.id === highImpressionLowCompletionId);
    expect(item).toBeDefined();
    expect(item!.diagnosis).not.toBeNull();
    expect(item!.diagnosis!.toolAction).toBe("REWRITE_OPENING");
    expect(item!.diagnosis!.title).toBe("标题吸引但留不住");
  });

  it("无 PostStat 的 PUBLISHED 稿件 → stat=null, diagnosis=null", async () => {
    const res = await request(app.getHttpServer())
      .get("/me/works?status=PUBLISHED")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const body = res.body as MeWorksResp;
    const withoutStat = body.items.find(
      (i) => i.id !== lowImpressionHighQualityId && i.id !== highImpressionLowCompletionId,
    );
    if (withoutStat) {
      expect(withoutStat.stat).toBeNull();
      expect(withoutStat.diagnosis).toBeNull();
    }
  });

  it("DRAFT 稿件无 stat/diagnosis", async () => {
    const res = await request(app.getHttpServer())
      .get("/me/works?status=DRAFT")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const body = res.body as MeWorksResp;
    for (const item of body.items) {
      expect(item.stat).toBeNull();
      expect(item.diagnosis).toBeNull();
    }
  });
});
