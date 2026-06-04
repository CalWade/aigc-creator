import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { App } from "supertest/types";

import { AppModule } from "./../src/app.module";
import { PrismaService } from "./../src/prisma/prisma.service";
import { applyAllFixtures, cleanupAllFixtures } from "./../prisma/fixtures";

interface PostDetail {
  id: string;
  title: string;
  body: unknown;
  qualityRecommendation: "ALLOW" | "WARN" | "BLOCK";
}

interface ErrorResp {
  code?: string;
  message?: string | { code?: string };
}

function readErrCode(body: ErrorResp): string | undefined {
  if (typeof body.code === "string") return body.code;
  if (typeof body.message === "object" && body.message) return body.message.code;
  return undefined;
}

describe("/post/:id (e2e)", () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let publishedId: string;

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
    const d = await prisma.draft.findFirst({ where: { status: "PUBLISHED" } });
    publishedId = d!.id;
  });

  afterAll(async () => {
    await cleanupAllFixtures(prisma);
    await app.close();
  });

  it("详情含 body/qualityRecommendation", async () => {
    const res = await request(app.getHttpServer()).get(`/post/${publishedId}`).expect(200);
    const body = res.body as PostDetail;
    expect(body.id).toBe(publishedId);
    expect(typeof body.body).toBe("object");
    expect(["ALLOW", "WARN", "BLOCK"]).toContain(body.qualityRecommendation);
  });

  it("不存在 → 404 POST_NOT_FOUND", async () => {
    const res = await request(app.getHttpServer())
      .get("/post/nonexistent000000000000000")
      .expect(404);
    expect(readErrCode(res.body as ErrorResp)).toBe("POST_NOT_FOUND");
  });

  it("DRAFT 状态稿子 → 404", async () => {
    const draft = await prisma.draft.findFirst({ where: { status: "DRAFT" } });
    if (!draft) return;
    await request(app.getHttpServer()).get(`/post/${draft.id}`).expect(404);
  });
});
