import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { App } from "supertest/types";

import { AppModule } from "./../src/app.module";
import { PrismaService } from "./../src/prisma/prisma.service";
import { applyAllFixtures, cleanupAllFixtures } from "./../prisma/fixtures";
import { loginAsDemo, loginAs } from "./helpers/auth";

interface ReactionsResp {
  likeCount: number;
  collectCount: number;
  liked: boolean;
  collected: boolean;
}

const PUBLISHED_POST_ID = "pub000draft0000000000000000";
const DRAFT_POST_ID = "demodraft0000000000000001";

describe("/post/:id/reactions (e2e)", () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let demoToken: string;
  let techToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();

    prisma = app.get(PrismaService);
    await applyAllFixtures(prisma);
    demoToken = await loginAsDemo(app);
    techToken = await loginAs(app, "tech-author");
  });

  beforeEach(async () => {
    // 每个用例从干净状态开始,避免幂等用例之间互相污染
    await prisma.reaction.deleteMany({ where: { postId: PUBLISHED_POST_ID } });
  });

  afterAll(async () => {
    await cleanupAllFixtures(prisma);
    await app.close();
  });

  it("未登录 POST → 401", async () => {
    await request(app.getHttpServer())
      .post(`/post/${PUBLISHED_POST_ID}/reactions/like`)
      .expect(401);
  });

  it("LIKE 一次 → likeCount=1 + liked=true", async () => {
    const res = await request(app.getHttpServer())
      .post(`/post/${PUBLISHED_POST_ID}/reactions/like`)
      .set("Authorization", `Bearer ${demoToken}`)
      .expect(201);
    const body = res.body as ReactionsResp;
    expect(body).toEqual({ likeCount: 1, collectCount: 0, liked: true, collected: false });
  });

  it("LIKE 同一作者两次 → 幂等 likeCount 仍为 1(P2002 被吞)", async () => {
    await request(app.getHttpServer())
      .post(`/post/${PUBLISHED_POST_ID}/reactions/like`)
      .set("Authorization", `Bearer ${demoToken}`)
      .expect(201);
    const res = await request(app.getHttpServer())
      .post(`/post/${PUBLISHED_POST_ID}/reactions/like`)
      .set("Authorization", `Bearer ${demoToken}`)
      .expect(201);
    const body = res.body as ReactionsResp;
    expect(body.likeCount).toBe(1);
    expect(body.liked).toBe(true);
  });

  it("两个不同用户都 LIKE → likeCount=2,各自 liked=true", async () => {
    await request(app.getHttpServer())
      .post(`/post/${PUBLISHED_POST_ID}/reactions/like`)
      .set("Authorization", `Bearer ${demoToken}`)
      .expect(201);
    const res = await request(app.getHttpServer())
      .post(`/post/${PUBLISHED_POST_ID}/reactions/like`)
      .set("Authorization", `Bearer ${techToken}`)
      .expect(201);
    const body = res.body as ReactionsResp;
    expect(body.likeCount).toBe(2);
    expect(body.liked).toBe(true);
  });

  it("DELETE 不存在的反应 → 幂等 200(P2025 被吞)", async () => {
    const res = await request(app.getHttpServer())
      .delete(`/post/${PUBLISHED_POST_ID}/reactions/like`)
      .set("Authorization", `Bearer ${demoToken}`)
      .expect(200);
    const body = res.body as ReactionsResp;
    expect(body).toEqual({ likeCount: 0, collectCount: 0, liked: false, collected: false });
  });

  it("LIKE → DELETE → likeCount 回到 0", async () => {
    await request(app.getHttpServer())
      .post(`/post/${PUBLISHED_POST_ID}/reactions/like`)
      .set("Authorization", `Bearer ${demoToken}`)
      .expect(201);
    const res = await request(app.getHttpServer())
      .delete(`/post/${PUBLISHED_POST_ID}/reactions/like`)
      .set("Authorization", `Bearer ${demoToken}`)
      .expect(200);
    const body = res.body as ReactionsResp;
    expect(body).toEqual({ likeCount: 0, collectCount: 0, liked: false, collected: false });
  });

  it("LIKE + COLLECT 互不干扰", async () => {
    await request(app.getHttpServer())
      .post(`/post/${PUBLISHED_POST_ID}/reactions/like`)
      .set("Authorization", `Bearer ${demoToken}`)
      .expect(201);
    const res = await request(app.getHttpServer())
      .post(`/post/${PUBLISHED_POST_ID}/reactions/collect`)
      .set("Authorization", `Bearer ${demoToken}`)
      .expect(201);
    const body = res.body as ReactionsResp;
    expect(body).toEqual({ likeCount: 1, collectCount: 1, liked: true, collected: true });
  });

  it("未发布稿件 LIKE → 404 POST_NOT_FOUND", async () => {
    const res = await request(app.getHttpServer())
      .post(`/post/${DRAFT_POST_ID}/reactions/like`)
      .set("Authorization", `Bearer ${demoToken}`)
      .expect(404);
    const body = res.body as { code?: string; message?: { code?: string } };
    const code = body.code ?? body.message?.code;
    expect(code).toBe("POST_NOT_FOUND");
  });

  it("kind 非法 → 400", async () => {
    const res = await request(app.getHttpServer())
      .post(`/post/${PUBLISHED_POST_ID}/reactions/share`)
      .set("Authorization", `Bearer ${demoToken}`)
      .expect(400);
    expect(res.body).toBeDefined();
  });
});
