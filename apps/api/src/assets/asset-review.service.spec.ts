import { AssetReviewService } from "./asset-review.service";
import { PromptsService } from "../prompts/prompts.service";
import { LlmClient } from "../llm/llm.client";

describe("AssetReviewService", () => {
  let service: AssetReviewService;
  let prompts: { findDefaultByTool: jest.Mock };
  let llm: { chat: jest.Mock };

  const allowJson = JSON.stringify({
    dimensions: [
      { key: "face", score: 0, severity: "low", reason: "无命中" },
      { key: "watermark", score: 0, severity: "low", reason: "无命中" },
      { key: "sensitive", score: 0, severity: "low", reason: "无命中" },
      { key: "ai_unmarked", score: 0, severity: "low", reason: "无命中" },
    ],
  });

  const faceHighJson = JSON.stringify({
    dimensions: [
      { key: "face", score: 80, severity: "high", reason: "文件名含人像关键词" },
      { key: "watermark", score: 0, severity: "low", reason: "无命中" },
      { key: "sensitive", score: 0, severity: "low", reason: "无命中" },
      { key: "ai_unmarked", score: 0, severity: "low", reason: "无命中" },
    ],
  });

  const watermarkMediumJson = JSON.stringify({
    dimensions: [
      { key: "face", score: 0, severity: "low", reason: "无命中" },
      { key: "watermark", score: 50, severity: "medium", reason: "疑似水印" },
      { key: "sensitive", score: 0, severity: "low", reason: "无命中" },
      { key: "ai_unmarked", score: 0, severity: "low", reason: "无命中" },
    ],
  });

  const aiUnmarkedHighJson = JSON.stringify({
    dimensions: [
      { key: "face", score: 0, severity: "low", reason: "无命中" },
      { key: "watermark", score: 0, severity: "low", reason: "无命中" },
      { key: "sensitive", score: 0, severity: "low", reason: "无命中" },
      { key: "ai_unmarked", score: 80, severity: "high", reason: "疑似 AI 生成" },
    ],
  });

  beforeEach(() => {
    prompts = {
      findDefaultByTool: jest.fn().mockResolvedValue({ systemPrompt: "test" }),
    };
    llm = { chat: jest.fn().mockResolvedValue(allowJson) };
    service = new AssetReviewService(
      prompts as unknown as PromptsService,
      llm as unknown as LlmClient,
    );
  });

  it("INGEST high → BLOCK", async () => {
    llm.chat.mockResolvedValue(faceHighJson);
    const result = await service.reviewAsset({
      mime: "image/png",
      filename: "portrait.png",
      sceneTags: ["人像"],
      subjectTags: ["人物"],
      aiGenerated: false,
      aiDeclared: false,
      stage: "INGEST",
    });
    expect(result.recommendation).toBe("BLOCK");
    expect(result.dimensions.find((d) => d.key === "face")?.severity).toBe("high");
  });

  it("PRE_INSERT high → WARN(不 BLOCK)", async () => {
    llm.chat.mockResolvedValue(faceHighJson);
    const result = await service.reviewAsset({
      mime: "image/png",
      filename: "portrait.png",
      sceneTags: [],
      subjectTags: [],
      aiGenerated: false,
      aiDeclared: false,
      stage: "PRE_INSERT",
    });
    expect(result.recommendation).toBe("WARN");
  });

  it("INGEST medium → WARN", async () => {
    llm.chat.mockResolvedValue(watermarkMediumJson);
    const result = await service.reviewAsset({
      mime: "image/png",
      filename: "image.png",
      sceneTags: [],
      subjectTags: [],
      aiGenerated: false,
      aiDeclared: false,
      stage: "INGEST",
    });
    expect(result.recommendation).toBe("WARN");
  });

  it("aiDeclared=false + ai_unmarked=high → WARN(INGEST)", async () => {
    llm.chat.mockResolvedValue(aiUnmarkedHighJson);
    const result = await service.reviewAsset({
      mime: "image/png",
      filename: "photo.png",
      sceneTags: [],
      subjectTags: [],
      aiGenerated: false,
      aiDeclared: false,
      stage: "INGEST",
    });
    expect(result.recommendation).toBe("BLOCK");
    const aiDim = result.dimensions.find((d) => d.key === "ai_unmarked");
    expect(aiDim?.severity).toBe("high");
  });

  it("aiDeclared=true + ai_unmarked=high → ALLOW(已声明降级)", async () => {
    llm.chat.mockResolvedValue(aiUnmarkedHighJson);
    const result = await service.reviewAsset({
      mime: "image/png",
      filename: "photo.png",
      sceneTags: [],
      subjectTags: [],
      aiGenerated: false,
      aiDeclared: true,
      stage: "INGEST",
    });
    expect(result.recommendation).toBe("ALLOW");
    const aiDim = result.dimensions.find((d) => d.key === "ai_unmarked");
    expect(aiDim?.severity).toBe("low");
  });

  it("LLM 抛错 → fallback ALLOW", async () => {
    llm.chat.mockRejectedValue(new Error("timeout"));
    const result = await service.reviewAsset({
      mime: "image/png",
      filename: "photo.png",
      sceneTags: [],
      subjectTags: [],
      aiGenerated: false,
      aiDeclared: false,
      stage: "INGEST",
    });
    expect(result.recommendation).toBe("ALLOW");
    expect(result.reason).toContain("LLM error");
  });

  it("recommendationToStatus 映射正确", () => {
    expect(service.recommendationToStatus("ALLOW")).toBe("PASSED");
    expect(service.recommendationToStatus("WARN")).toBe("WARNED");
    expect(service.recommendationToStatus("BLOCK")).toBe("BLOCKED");
  });
});
