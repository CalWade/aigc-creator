import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { App } from "supertest/types";

import { AppModule } from "./../src/app.module";
import { PrismaService } from "./../src/prisma/prisma.service";

interface DraftResponse {
  id: string;
  authorId: string;
  title: string;
  mode: string;
  version: number;
}

describe("DraftsController (e2e)", () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let authorId: string;

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
    await prisma.draftVersion.deleteMany();
    await prisma.draft.deleteMany();
    await prisma.user.deleteMany();

    const user = await prisma.user.create({
      data: { handle: `e2e-${Date.now()}` },
    });
    authorId = user.id;
  });

  afterAll(async () => {
    await prisma.draftVersion.deleteMany();
    await prisma.draft.deleteMany();
    await prisma.user.deleteMany();
    await app.close();
  });

  it("POST /drafts -> 201 returns created draft with cuid", async () => {
    const res = await request(app.getHttpServer())
      .post("/drafts")
      .send({
        authorId,
        title: "Hello Draft",
        body: { type: "doc", content: [] },
      })
      .expect(201);

    const body = res.body as DraftResponse;
    expect(body).toMatchObject({
      authorId,
      title: "Hello Draft",
      mode: "FAST",
      version: 1,
    });
    expect(typeof body.id).toBe("string");
    expect(body.id.length).toBeGreaterThan(10);
  });

  it("GET /drafts -> 200 returns array including the created draft", async () => {
    const res = await request(app.getHttpServer()).get("/drafts").expect(200);
    const list = res.body as DraftResponse[];

    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeGreaterThanOrEqual(1);
  });

  it("GET /drafts/:id -> 200 returns one draft", async () => {
    const created = await request(app.getHttpServer())
      .post("/drafts")
      .send({
        authorId,
        title: "Findable",
        body: {},
      })
      .expect(201);
    const createdBody = created.body as DraftResponse;

    const res = await request(app.getHttpServer()).get(`/drafts/${createdBody.id}`).expect(200);
    const found = res.body as DraftResponse;

    expect(found.id).toBe(createdBody.id);
    expect(found.title).toBe("Findable");
  });

  it("POST /drafts -> 400 when title missing", async () => {
    await request(app.getHttpServer()).post("/drafts").send({ authorId, body: {} }).expect(400);
  });

  it("GET /drafts/:id -> 404 when not found", async () => {
    await request(app.getHttpServer()).get("/drafts/nonexistent-id-zzz").expect(404);
  });
});
