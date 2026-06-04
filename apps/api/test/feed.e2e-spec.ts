import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { App } from "supertest/types";

import { AppModule } from "./../src/app.module";
import { PrismaService } from "./../src/prisma/prisma.service";
import { applyAllFixtures, cleanupAllFixtures } from "./../prisma/fixtures";

interface FeedResp {
  items: { id: string; title: string; qualityOverall: number; hotnessMock: number }[];
  nextCursor: string | null;
}

interface ErrorResp {
  code?: string;
  message?: string | { code?: string; message?: string };
}

function readErrCode(body: ErrorResp): string | undefined {
  if (typeof body.code === "string") return body.code;
  if (typeof body.message === "object" && body.message) return body.message.code;
  return undefined;
}

describe("/feed (e2e)", () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

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
  });

  afterAll(async () => {
    await cleanupAllFixtures(prisma);
    await app.close();
  });

  it("GET /feed 公开返回 items[]", async () => {
    const res = await request(app.getHttpServer()).get("/feed?limit=10").expect(200);
    const body = res.body as FeedResp;
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.items.length).toBeLessThanOrEqual(10);
    expect(body.items[0]).toMatchObject({
      id: expect.any(String) as string,
      title: expect.any(String) as string,
      qualityOverall: expect.any(Number) as number,
      hotnessMock: expect.any(Number) as number,
    });
  });

  it("cursor 翻页可拿到不同 items", async () => {
    const r1 = await request(app.getHttpServer()).get("/feed?limit=5").expect(200);
    const b1 = r1.body as FeedResp;
    expect(b1.nextCursor).toBeTruthy();
    const r2 = await request(app.getHttpServer())
      .get(`/feed?limit=5&cursor=${encodeURIComponent(b1.nextCursor!)}`)
      .expect(200);
    const b2 = r2.body as FeedResp;
    const ids1 = b1.items.map((x) => x.id);
    const ids2 = b2.items.map((x) => x.id);
    expect(ids1.some((id) => ids2.includes(id))).toBe(false);
  });

  it("翻页中途权重变化 → 400 CURSOR_WEIGHTS_MISMATCH", async () => {
    const r1 = await request(app.getHttpServer()).get("/feed?limit=5").expect(200);
    const cursor = (r1.body as FeedResp).nextCursor!;
    const res = await request(app.getHttpServer())
      .get(`/feed?limit=5&cursor=${encodeURIComponent(cursor)}&alpha=0.9&beta=0.05&gamma=0.05`)
      .expect(400);
    expect(readErrCode(res.body as ErrorResp)).toBe("CURSOR_WEIGHTS_MISMATCH");
  });

  it("非法 cursor → 400 CURSOR_INVALID", async () => {
    const res = await request(app.getHttpServer())
      .get("/feed?cursor=not-a-valid-cursor")
      .expect(400);
    expect(readErrCode(res.body as ErrorResp)).toBe("CURSOR_INVALID");
  });
});
