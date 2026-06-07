import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { App } from "supertest/types";

import { AppModule } from "./../src/app.module";
import { LlmClient } from "./../src/llm/llm.client";
import { PrismaService } from "./../src/prisma/prisma.service";
import { applyAllFixtures, cleanupAllFixtures } from "./../prisma/fixtures";
import { loginAsAdmin, loginAsDemo } from "./helpers/auth";

const SEED_PENDING_ID = "reportseedpending000000001";
const SEED_RESOLVED_ID = "reportseedresolved00000003";

describe("Phase 2.6 — /admin/reports (e2e)", () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(LlmClient)
      .useValue({ chat: jest.fn(), chatStream: jest.fn() })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();

    prisma = app.get(PrismaService);
    await applyAllFixtures(prisma);
  });

  afterAll(async () => {
    await cleanupAllFixtures(prisma);
    await app.close();
  });

  it("非 admin 调 /admin/reports → 403 ADMIN_REQUIRED", async () => {
    const token = await loginAsDemo(app);
    const res = await request(app.getHttpServer())
      .get("/admin/reports")
      .set("Authorization", `Bearer ${token}`)
      .expect(403);
    expect((res.body as { code: string }).code).toBe("ADMIN_REQUIRED");
  });

  it("admin GET 默认 PENDING 列表(seed 2 条 PENDING)", async () => {
    const token = await loginAsAdmin(app);
    const res = await request(app.getHttpServer())
      .get("/admin/reports")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const body = res.body as {
      items: Array<{ id: string; status: string; llmRecommendation: string | null }>;
    };
    expect(body.items.length).toBeGreaterThanOrEqual(2);
    for (const it of body.items) expect(it.status).toBe("PENDING");
  });

  it("admin GET status=RESOLVED 只返已处置", async () => {
    const token = await loginAsAdmin(app);
    const res = await request(app.getHttpServer())
      .get("/admin/reports?status=RESOLVED")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const body = res.body as { items: Array<{ id: string; status: string }> };
    expect(body.items.length).toBeGreaterThanOrEqual(1);
    for (const it of body.items) expect(it.status).toBe("RESOLVED");
  });

  it("admin GET status=ALL 同时含 PENDING + RESOLVED", async () => {
    const token = await loginAsAdmin(app);
    const res = await request(app.getHttpServer())
      .get("/admin/reports?status=ALL")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const body = res.body as { items: Array<{ status: string }> };
    const statuses = new Set(body.items.map((i) => i.status));
    expect(statuses.has("PENDING")).toBe(true);
    expect(statuses.has("RESOLVED")).toBe(true);
  });

  it("admin POST resolve OFFLINE → Draft.status=OFFLINE + offlineReason 写入", async () => {
    const token = await loginAsAdmin(app);
    const before = await prisma.report.findUnique({
      where: { id: SEED_PENDING_ID },
      include: { post: true },
    });
    expect(before?.status).toBe("PENDING");
    expect(before?.post.status).toBe("PUBLISHED");

    await request(app.getHttpServer())
      .post(`/admin/reports/${SEED_PENDING_ID}/resolve`)
      .set("Authorization", `Bearer ${token}`)
      .send({ resolution: "OFFLINE", note: "命中明显违规" })
      .expect(200);

    const after = await prisma.report.findUnique({
      where: { id: SEED_PENDING_ID },
      include: { post: true },
    });
    expect(after?.status).toBe("RESOLVED");
    expect(after?.resolution).toBe("OFFLINE");
    expect(after?.resolvedAt).not.toBeNull();
    expect(after?.post.status).toBe("OFFLINE");
    expect(after?.post.offlineReason).toContain("低俗");
    expect(after?.post.offlineReason).toContain("命中明显违规");
    expect(after?.post.offlineAt).not.toBeNull();
  });

  it("admin POST resolve 已 RESOLVED 的记录 → 409 REPORT_ALREADY_RESOLVED", async () => {
    const token = await loginAsAdmin(app);
    const res = await request(app.getHttpServer())
      .post(`/admin/reports/${SEED_RESOLVED_ID}/resolve`)
      .set("Authorization", `Bearer ${token}`)
      .send({ resolution: "DISMISS" })
      .expect(409);
    expect((res.body as { code: string }).code).toBe("REPORT_ALREADY_RESOLVED");
  });

  it("admin POST resolve 不存在的 reportId → 404 REPORT_NOT_FOUND", async () => {
    const token = await loginAsAdmin(app);
    const res = await request(app.getHttpServer())
      .post(`/admin/reports/nonexistent00000000000000/resolve`)
      .set("Authorization", `Bearer ${token}`)
      .send({ resolution: "DISMISS" })
      .expect(404);
    expect((res.body as { code: string }).code).toBe("REPORT_NOT_FOUND");
  });

  it("非 admin 调 resolve 端点 → 403", async () => {
    const token = await loginAsDemo(app);
    await request(app.getHttpServer())
      .post(`/admin/reports/${SEED_RESOLVED_ID}/resolve`)
      .set("Authorization", `Bearer ${token}`)
      .send({ resolution: "DISMISS" })
      .expect(403);
  });
});
