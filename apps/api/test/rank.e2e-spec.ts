import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { App } from "supertest/types";

import { AppModule } from "./../src/app.module";
import { PrismaService } from "./../src/prisma/prisma.service";
import { applyAllFixtures, cleanupAllFixtures } from "./../prisma/fixtures";

interface FeedResp {
  items: { id: string }[];
  nextCursor: string | null;
}

describe("/rank (e2e)", () => {
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

  it("/rank/hot 返回 12h 内候选(>=2)", async () => {
    const res = await request(app.getHttpServer()).get("/rank/hot").expect(200);
    expect((res.body as FeedResp).items.length).toBeGreaterThanOrEqual(2);
  });

  it("/rank/best 返回 72h 内候选(>=10)", async () => {
    const res = await request(app.getHttpServer()).get("/rank/best").expect(200);
    expect((res.body as FeedResp).items.length).toBeGreaterThanOrEqual(10);
  });

  it("权重切换导致同 mode 排序变化", async () => {
    const rQ = await request(app.getHttpServer())
      .get("/rank/best?alpha=1&beta=0&gamma=0&delta=0&limit=5")
      .expect(200);
    const rT = await request(app.getHttpServer())
      .get("/rank/best?alpha=0&beta=0&gamma=1&delta=0&limit=5")
      .expect(200);
    const idsQ = (rQ.body as FeedResp).items.map((x) => x.id);
    const idsT = (rT.body as FeedResp).items.map((x) => x.id);
    expect(idsQ).not.toEqual(idsT);
  });

  it("delta 参数被接受且不影响 200 响应", async () => {
    await request(app.getHttpServer()).get("/rank/hot?delta=0.25&limit=5").expect(200);
  });
});
