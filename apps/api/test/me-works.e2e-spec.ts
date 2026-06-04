import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { App } from "supertest/types";

import { AppModule } from "./../src/app.module";
import { PrismaService } from "./../src/prisma/prisma.service";
import { applyAllFixtures, cleanupAllFixtures } from "./../prisma/fixtures";
import { loginAsDemo } from "./helpers/auth";

interface MeWorksResp {
  items: { id: string; status: "DRAFT" | "PUBLISHED" }[];
}

describe("/me/works (e2e)", () => {
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
    token = await loginAsDemo(app);
  });

  afterAll(async () => {
    await cleanupAllFixtures(prisma);
    await app.close();
  });

  it("无 token → 401", async () => {
    await request(app.getHttpServer()).get("/me/works").expect(401);
  });

  it("登录用户 status=ALL 返回所有稿(>=3)", async () => {
    const res = await request(app.getHttpServer())
      .get("/me/works?status=ALL")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    // demo 名下:1 FAST + 1 FINE(DRAFT) + 10 PUBLISHED = 12
    expect((res.body as MeWorksResp).items.length).toBeGreaterThanOrEqual(3);
  });

  it("status=PUBLISHED 只返已发布", async () => {
    const res = await request(app.getHttpServer())
      .get("/me/works?status=PUBLISHED")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const items = (res.body as MeWorksResp).items;
    for (const it of items) expect(it.status).toBe("PUBLISHED");
  });
});
