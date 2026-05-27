import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { App } from "supertest/types";

import { AppModule } from "./../src/app.module";
import { PrismaService } from "./../src/prisma/prisma.service";
import { applyAllFixtures, cleanupAllFixtures, DEMO_AUTHOR_ID } from "./../prisma/fixtures";

interface LoginResponse {
  accessToken: string;
  user: { id: string; handle: string };
}

describe("AuthController (e2e)", () => {
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

  it("POST /auth/login -> 200 returns accessToken + user", async () => {
    const res = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ handle: "demo-author" })
      .expect(200);
    const body = res.body as LoginResponse;

    expect(typeof body.accessToken).toBe("string");
    expect(body.accessToken.split(".").length).toBe(3); // header.payload.signature
    expect(body.user).toEqual({ id: DEMO_AUTHOR_ID, handle: "demo-author" });
  });

  it("POST /auth/login -> 401 when handle not found", async () => {
    await request(app.getHttpServer())
      .post("/auth/login")
      .send({ handle: "ghost-user-does-not-exist" })
      .expect(401);
  });

  it("POST /auth/login -> 400 when body missing handle", async () => {
    await request(app.getHttpServer()).post("/auth/login").send({}).expect(400);
  });

  it("GET /drafts -> 401 when no Authorization header", async () => {
    await request(app.getHttpServer()).get("/drafts").expect(401);
  });

  it("GET /drafts -> 401 when token is malformed", async () => {
    await request(app.getHttpServer())
      .get("/drafts")
      .set("Authorization", "Bearer foo.bar.baz")
      .expect(401);
  });
});
