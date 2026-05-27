import { INestApplication, ValidationPipe } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { App } from "supertest/types";

import { AppModule } from "./../src/app.module";
import { PrismaService } from "./../src/prisma/prisma.service";
import { applyAllFixtures, cleanupAllFixtures, DEMO_AUTHOR_ID } from "./../prisma/fixtures";
import { loginAsDemo } from "./helpers/auth";

interface DraftResponse {
  id: string;
  authorId: string;
  title: string;
  mode: string;
  version: number;
}

describe("DraftsController GET /drafts/mine (e2e)", () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwt: JwtService;
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
    jwt = app.get(JwtService);
    await applyAllFixtures(prisma);

    token = await loginAsDemo(app);
  });

  afterAll(async () => {
    await cleanupAllFixtures(prisma);
    await app.close();
  });

  it("GET /drafts/mine -> 200 returns only the caller's drafts", async () => {
    const res = await request(app.getHttpServer())
      .get("/drafts/mine")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const list = res.body as DraftResponse[];

    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeGreaterThanOrEqual(2); // demo fixtures: FAST + FINE
    for (const draft of list) {
      expect(draft.authorId).toBe(DEMO_AUTHOR_ID);
    }
  });

  it("GET /drafts/mine -> 401 when no Authorization header", async () => {
    await request(app.getHttpServer()).get("/drafts/mine").expect(401);
  });

  it("GET /drafts/mine -> 401 when token sub does not exist in DB (ghost user)", async () => {
    const ghostToken = await jwt.signAsync({
      sub: "ghost-user-id-not-in-db",
      handle: "ghost",
    });
    await request(app.getHttpServer())
      .get("/drafts/mine")
      .set("Authorization", `Bearer ${ghostToken}`)
      .expect(401);
  });
});
