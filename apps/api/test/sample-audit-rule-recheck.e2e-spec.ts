import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { App } from "supertest/types";

import { AppModule } from "./../src/app.module";
import { LlmClient } from "./../src/llm/llm.client";
import { PrismaService } from "./../src/prisma/prisma.service";
import { applyAllFixtures, cleanupAllFixtures } from "./../prisma/fixtures";
import { loginAsAdmin } from "./helpers/auth";

// 使用 fixture 中的第一篇 PUBLISHED draft
const PUBLISHED_DRAFT_ID = "pub000draft0000000000000000";

describe("Phase 2.21 — sample-audit + rule-recheck (e2e)", () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let llmChatMock: jest.Mock;

  beforeAll(async () => {
    llmChatMock = jest.fn();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(LlmClient)
      .useValue({ chat: llmChatMock, chatStream: jest.fn() })
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

  // ─── 抽样巡检 ───

  it("POST /admin/sample-audits/enqueue 触发抽样", async () => {
    const token = await loginAsAdmin(app);
    const res = await request(app.getHttpServer())
      .post("/admin/sample-audits/enqueue")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const body = res.body as { enqueued: number };
    expect(body.enqueued).toBeGreaterThanOrEqual(1);
  });

  it("POST /admin/sample-audits/:id/decide PASS", async () => {
    const token = await loginAsAdmin(app);
    // 先列出 PENDING
    const listRes = await request(app.getHttpServer())
      .get("/admin/sample-audits?status=PENDING")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const list = listRes.body as Array<{ id: string; status: string }>;
    expect(list.length).toBeGreaterThanOrEqual(1);

    const auditId = list[0].id;
    await request(app.getHttpServer())
      .post(`/admin/sample-audits/${auditId}/decide`)
      .set("Authorization", `Bearer ${token}`)
      .send({ decision: "PASS" })
      .expect(200);

    // 验证状态已变
    const audit = await prisma.sampleAudit.findUnique({ where: { id: auditId } });
    expect(audit?.status).toBe("PASSED");
  });

  it("POST /admin/sample-audits/:id/decide FAIL 转 OFFLINE", async () => {
    const token = await loginAsAdmin(app);
    // 先确保有一条 PUBLISHED draft 用于抽样
    await prisma.draft.update({
      where: { id: PUBLISHED_DRAFT_ID },
      data: { status: "PUBLISHED" },
    });
    // 再触发一次抽样
    await request(app.getHttpServer())
      .post("/admin/sample-audits/enqueue")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    // 找到包含 PUBLISHED_DRAFT_ID 的 PENDING 审计
    const pendingAudits = await prisma.sampleAudit.findMany({
      where: { status: "PENDING", draftId: PUBLISHED_DRAFT_ID },
    });
    if (pendingAudits.length > 0) {
      const auditId = pendingAudits[0].id;
      await request(app.getHttpServer())
        .post(`/admin/sample-audits/${auditId}/decide`)
        .set("Authorization", `Bearer ${token}`)
        .send({ decision: "FAIL", note: "测试下线" })
        .expect(200);

      const draft = await prisma.draft.findUnique({ where: { id: PUBLISHED_DRAFT_ID } });
      expect(draft?.status).toBe("OFFLINE");
    } else {
      // 抽样没命中这篇,手动创建一条审计
      const audit = await prisma.sampleAudit.create({
        data: { draftId: PUBLISHED_DRAFT_ID, status: "PENDING" },
      });
      await request(app.getHttpServer())
        .post(`/admin/sample-audits/${audit.id}/decide`)
        .set("Authorization", `Bearer ${token}`)
        .send({ decision: "FAIL", note: "测试下线" })
        .expect(200);

      const draft = await prisma.draft.findUnique({ where: { id: PUBLISHED_DRAFT_ID } });
      expect(draft?.status).toBe("OFFLINE");
    }
  });

  // ─── 规则更新批量复审 ───

  it("POST /admin/rule-rechecks 完整链路", async () => {
    const token = await loginAsAdmin(app);
    // 确保至少一篇 PUBLISHED
    // 先把之前测试下线的改回 PUBLISHED
    await prisma.draft.update({
      where: { id: PUBLISHED_DRAFT_ID },
      data: { status: "PUBLISHED", offlineAt: null, offlineReason: null },
    });

    // Mock LLM 返回 ALLOW
    const ALL_LOW = JSON.stringify({
      dimensions: [
        { key: "pornography", score: 0, severity: "low", hits: [], reason: "无" },
        { key: "gambling", score: 0, severity: "low", hits: [], reason: "无" },
        { key: "abuse", score: 0, severity: "low", hits: [], reason: "无" },
        { key: "fraud", score: 0, severity: "low", hits: [], reason: "无" },
        { key: "illicit_ads", score: 0, severity: "low", hits: [], reason: "无" },
      ],
    });
    llmChatMock.mockResolvedValue(ALL_LOW);

    const res = await request(app.getHttpServer())
      .post("/admin/rule-rechecks")
      .set("Authorization", `Bearer ${token}`)
      .send({ ruleVersion: "v2.1" })
      .expect(200);

    const body = res.body as {
      id: string;
      ruleVersion: string;
      totalScanned: number;
      totalOffline: number;
      status: string;
    };
    expect(body.ruleVersion).toBe("v2.1");
    expect(body.status).toBe("DONE");
    expect(body.totalScanned).toBeGreaterThanOrEqual(1);
    expect(body.totalOffline).toBe(0);

    // 验证 GET /admin/rule-rechecks 也能工作
    const listRes = await request(app.getHttpServer())
      .get("/admin/rule-rechecks")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const list = listRes.body as Array<{ ruleVersion: string }>;
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(list.some((r) => r.ruleVersion === "v2.1")).toBe(true);
  });
});
