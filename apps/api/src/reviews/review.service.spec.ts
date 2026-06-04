import { LlmClient } from "../llm/llm.client";
import { PrismaService } from "../prisma/prisma.service";
import { PromptsService } from "../prompts/prompts.service";
import { DraftsService } from "../drafts/drafts.service";
import { ReviewService } from "./review.service";

const ALL_LOW_SAFETY = JSON.stringify({
  dimensions: [
    { key: "pornography", score: 0, severity: "low", hits: [], reason: "无" },
    { key: "gambling", score: 0, severity: "low", hits: [], reason: "无" },
    { key: "drugs", score: 0, severity: "low", hits: [], reason: "无" },
    { key: "politics", score: 0, severity: "low", hits: [], reason: "无" },
    { key: "vulgarity", score: 0, severity: "low", hits: [], reason: "无" },
    { key: "false_advertising", score: 0, severity: "low", hits: [], reason: "无" },
  ],
});

const HIGH_QUALITY = JSON.stringify({
  dimensions: [
    { key: "content_value", score: 90, reason: "好" },
    { key: "expression", score: 88, reason: "好" },
    { key: "reader_experience", score: 85, reason: "好" },
    { key: "viral_potential", score: 82, reason: "好" },
  ],
});

const LOW_QUALITY = JSON.stringify({
  dimensions: [
    { key: "content_value", score: 50, reason: "弱" },
    { key: "expression", score: 50, reason: "弱" },
    { key: "reader_experience", score: 50, reason: "弱" },
    { key: "viral_potential", score: 50, reason: "弱" },
  ],
});

function makeService(safetyRaw: string, qualityRaw: string) {
  const drafts = {
    assertAuthor: jest.fn().mockResolvedValue({
      title: "标题",
      body: {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "正文" }] }],
      },
    }),
  } as unknown as DraftsService;
  const llm = {
    chat: jest
      .fn()
      .mockImplementationOnce(() => Promise.resolve(safetyRaw))
      .mockImplementationOnce(() => Promise.resolve(qualityRaw)),
  } as unknown as LlmClient;
  const prompts = {
    findDefaultByTool: jest.fn().mockResolvedValue({ systemPrompt: "你是审核员", params: {} }),
  } as unknown as PromptsService;
  const prisma = {
    $transaction: jest.fn().mockImplementation((cb: (tx: unknown) => Promise<unknown>) =>
      cb({
        review: {
          create: jest.fn().mockResolvedValue({
            id: "r1",
            stage: "PREFLIGHT",
            safety: {},
            quality: {},
            recommendation: "ALLOW",
            modelMeta: {},
            createdAt: new Date(),
          }),
        },
        draft: { update: jest.fn().mockResolvedValue({}) },
      }),
    ),
  } as unknown as PrismaService;
  return new ReviewService(drafts, prisma, llm, prompts);
}

describe("ReviewService.preflight", () => {
  it("全 low + 高质量 → ALLOW", async () => {
    const svc = makeService(ALL_LOW_SAFETY, HIGH_QUALITY);
    const res = await svc.preflight("d1", "u1");
    expect(res.recommendation).toBe("ALLOW");
  });

  it("safety 含 high → BLOCK", async () => {
    const high = JSON.stringify({
      dimensions: [
        { key: "pornography", score: 80, severity: "high", hits: ["..."], reason: "命中" },
        { key: "gambling", score: 0, severity: "low", hits: [], reason: "无" },
        { key: "drugs", score: 0, severity: "low", hits: [], reason: "无" },
        { key: "politics", score: 0, severity: "low", hits: [], reason: "无" },
        { key: "vulgarity", score: 0, severity: "low", hits: [], reason: "无" },
        { key: "false_advertising", score: 0, severity: "low", hits: [], reason: "无" },
      ],
    });
    const svc = makeService(high, HIGH_QUALITY);
    const res = await svc.preflight("d1", "u1");
    expect(res.recommendation).toBe("BLOCK");
  });

  it("safety 含 medium → WARN", async () => {
    const med = JSON.stringify({
      dimensions: [
        { key: "pornography", score: 50, severity: "medium", hits: [], reason: "中" },
        { key: "gambling", score: 0, severity: "low", hits: [], reason: "无" },
        { key: "drugs", score: 0, severity: "low", hits: [], reason: "无" },
        { key: "politics", score: 0, severity: "low", hits: [], reason: "无" },
        { key: "vulgarity", score: 0, severity: "low", hits: [], reason: "无" },
        { key: "false_advertising", score: 0, severity: "low", hits: [], reason: "无" },
      ],
    });
    const svc = makeService(med, HIGH_QUALITY);
    const res = await svc.preflight("d1", "u1");
    expect(res.recommendation).toBe("WARN");
  });

  it("safety 全 low + quality.overall<60 → WARN", async () => {
    const svc = makeService(ALL_LOW_SAFETY, LOW_QUALITY);
    const res = await svc.preflight("d1", "u1");
    expect(res.recommendation).toBe("WARN");
  });

  it("LLM 输出非 JSON → 默认按高风险 BLOCK", async () => {
    const svc = makeService("not json at all", HIGH_QUALITY);
    const res = await svc.preflight("d1", "u1");
    expect(res.recommendation).toBe("BLOCK");
  });

  it("LLM 输出缺维度 → BLOCK", async () => {
    const partial = JSON.stringify({
      dimensions: [{ key: "pornography", score: 0, severity: "low" }],
    });
    const svc = makeService(partial, HIGH_QUALITY);
    const res = await svc.preflight("d1", "u1");
    expect(res.recommendation).toBe("BLOCK");
  });
});
