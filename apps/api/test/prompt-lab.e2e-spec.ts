import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { App } from "supertest/types";

import { AppModule } from "./../src/app.module";
import { LlmClient } from "./../src/llm/llm.client";
import { PrismaService } from "./../src/prisma/prisma.service";
import { applyAllFixtures, cleanupAllFixtures } from "./../prisma/fixtures";
import { loginAsAdmin, loginAsDemo } from "./helpers/auth";

interface TestCaseResponse {
  id: string;
  tool: string;
  input: string;
  expected: string;
}

interface EvalRunResponse {
  id: string;
  tool: string;
  status: string;
  accuracy: number;
  totalCases: number;
}

interface CompareResponse {
  candidate: { id: string; promptId: string; accuracy: number; totalCases: number };
  canPromote: boolean;
  accuracyDelta: number;
}

interface ActionResponse {
  id: string;
  action: string;
  tool: string;
  note: string | null;
}

describe("Phase 2.23 — /admin/prompt-lab (e2e)", () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let llmChatMock: jest.Mock;
  let adminToken: string;

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
    adminToken = await loginAsAdmin(app);
  });

  afterAll(async () => {
    await cleanupAllFixtures(prisma);
    await app.close();
  });

  it("POST test-cases → GET test-cases 验证", async () => {
    const createRes = await request(app.getHttpServer())
      .post("/admin/prompt-lab/test-cases")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ tool: "SAFETY_REVIEW", input: "测试输入", expected: "low" })
      .expect(201);

    const created = createRes.body as TestCaseResponse;
    expect(created.tool).toBe("SAFETY_REVIEW");
    expect(created.input).toBe("测试输入");
    expect(created.expected).toBe("low");

    const listRes = await request(app.getHttpServer())
      .get("/admin/prompt-lab/test-cases?tool=SAFETY_REVIEW&limit=10")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);

    const listed = listRes.body as TestCaseResponse[];
    expect(Array.isArray(listed)).toBe(true);
    expect(listed.length).toBeGreaterThanOrEqual(1);
  });

  it("POST eval-runs → GET eval-runs 验证状态 DONE", async () => {
    const safetyPrompt = await prisma.prompt.findFirst({
      where: { owner: "PLATFORM", tool: "SAFETY_REVIEW", isStarter: true },
    });
    expect(safetyPrompt).toBeTruthy();

    llmChatMock.mockResolvedValue(
      JSON.stringify({
        dimensions: [{ key: "pornography", severity: "low", score: 0, hits: [], reason: "无命中" }],
      }),
    );

    const evalRes = await request(app.getHttpServer())
      .post("/admin/prompt-lab/eval-runs")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ tool: "SAFETY_REVIEW", candidatePromptId: safetyPrompt!.id })
      .expect(200);

    const evalRun = evalRes.body as EvalRunResponse;
    expect(evalRun.status).toBe("DONE");
    expect(evalRun.accuracy).toBeGreaterThanOrEqual(0);
    expect(evalRun.totalCases).toBeGreaterThan(0);

    const listRes = await request(app.getHttpServer())
      .get("/admin/prompt-lab/eval-runs?tool=SAFETY_REVIEW")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);

    const listed = listRes.body as EvalRunResponse[];
    expect(Array.isArray(listed)).toBe(true);
    const found = listed.find((r) => r.id === evalRun.id);
    expect(found).toBeTruthy();
    expect(found!.status).toBe("DONE");
  });

  it("GET compare → 对比数据正确", async () => {
    const evalRunsRes = await request(app.getHttpServer())
      .get("/admin/prompt-lab/eval-runs?tool=SAFETY_REVIEW&limit=1")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);

    const evalRuns = evalRunsRes.body as EvalRunResponse[];
    expect(evalRuns.length).toBeGreaterThan(0);
    const evalRunId = evalRuns[0].id;

    const compareRes = await request(app.getHttpServer())
      .get(`/admin/prompt-lab/eval-runs/${evalRunId}/compare`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);

    const comparison = compareRes.body as CompareResponse;
    expect(typeof comparison.candidate.accuracy).toBe("number");
    expect(typeof comparison.candidate.totalCases).toBe("number");
    expect(typeof comparison.canPromote).toBe("boolean");
    expect(typeof comparison.accuracyDelta).toBe("number");
  });

  it("POST promote → 线上 prompt 内容更新", async () => {
    const evalRunsRes = await request(app.getHttpServer())
      .get("/admin/prompt-lab/eval-runs?tool=SAFETY_REVIEW&limit=1")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);

    const evalRuns = evalRunsRes.body as EvalRunResponse[];
    const evalRunId = evalRuns[0].id;

    const promoteRes = await request(app.getHttpServer())
      .post(`/admin/prompt-lab/eval-runs/${evalRunId}/promote`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ note: "e2e promote test" })
      .expect(200);

    const action = promoteRes.body as ActionResponse;
    expect(action.action).toBe("promote");
    expect(action.tool).toBe("SAFETY_REVIEW");

    // verify action recorded
    const dbAction = await prisma.promptLabAction.findFirst({
      where: { action: "promote", tool: "SAFETY_REVIEW" },
    });
    expect(dbAction).toBeTruthy();
    expect(dbAction!.note).toBe("e2e promote test");
  });

  it("POST rollback → 回到之前版本", async () => {
    const rollbackRes = await request(app.getHttpServer())
      .post("/admin/prompt-lab/rollback")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ tool: "SAFETY_REVIEW", note: "e2e rollback test" })
      .expect(200);

    const action = rollbackRes.body as ActionResponse;
    expect(action.action).toBe("rollback");
    expect(action.tool).toBe("SAFETY_REVIEW");

    // verify action recorded
    const dbAction = await prisma.promptLabAction.findFirst({
      where: { action: "rollback", tool: "SAFETY_REVIEW" },
    });
    expect(dbAction).toBeTruthy();
    expect(dbAction!.note).toBe("e2e rollback test");
  });

  it("非 admin → 403", async () => {
    const demoToken = await loginAsDemo(app);
    await request(app.getHttpServer())
      .get("/admin/prompt-lab/test-cases")
      .set("Authorization", `Bearer ${demoToken}`)
      .expect(403);
  });
});
