import { PromptLabService } from "./prompt-lab.service";
import { PrismaService } from "../../prisma/prisma.service";
import { PromptsService } from "../../prompts/prompts.service";
import { LlmClient } from "../../llm/llm.client";

function makePrisma() {
  return {
    promptTestCase: {
      create: jest.fn().mockResolvedValue({
        id: "tc1",
        tool: "SAFETY_REVIEW",
        input: "test",
        expected: "low",
        category: null,
        createdAt: new Date(),
      }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    promptEvalRun: {
      create: jest.fn().mockResolvedValue({
        id: "er1",
        tool: "SAFETY_REVIEW",
        promptId: "p1",
        totalCases: 0,
        accuracy: 0,
        stability: 0,
        status: "RUNNING",
        startedAt: new Date(),
      }),
      update: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    promptLabAction: {
      create: jest.fn().mockImplementation(
        (args: {
          data: {
            action: string;
            tool: string;
            fromPromptId?: string;
            toPromptId: string;
            evalRunId?: string;
            note?: string;
            operatedBy: string;
          };
        }) =>
          Promise.resolve({
            id: "la_new",
            tool: args.data.tool,
            action: args.data.action,
            fromPromptId: args.data.fromPromptId ?? null,
            toPromptId: args.data.toPromptId,
            evalRunId: args.data.evalRunId ?? null,
            note: args.data.note ?? null,
            operatedBy: args.data.operatedBy,
            createdAt: new Date(),
          }),
      ),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    prompt: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
    },
    promptSnapshot: {
      create: jest.fn().mockResolvedValue({
        id: "snap1",
        promptId: "p1",
        systemPrompt: "old",
        params: {},
        fewShots: [],
        designNote: null,
      }),
      findUnique: jest.fn().mockResolvedValue(null),
    },
  };
}

describe("PromptLabService", () => {
  let service: PromptLabService;
  let prisma: ReturnType<typeof makePrisma>;
  let llm: { chat: jest.Mock };
  let prompts: PromptsService;

  beforeEach(() => {
    prisma = makePrisma();
    llm = { chat: jest.fn() };
    prompts = {} as PromptsService;
    service = new PromptLabService(
      prisma as unknown as PrismaService,
      prompts,
      llm as unknown as LlmClient,
    );
  });

  describe("addTestCase", () => {
    it("创建测试用例并返回", async () => {
      const result = await service.addTestCase("SAFETY_REVIEW", "test input", "low", "allow");
      expect(result).toEqual(expect.objectContaining({ id: "tc1" }));
      expect(prisma.promptTestCase.create).toHaveBeenCalledWith({
        data: { tool: "SAFETY_REVIEW", input: "test input", expected: "low", category: "allow" },
      });
    });
  });

  describe("listTestCases", () => {
    it("按 tool 过滤列出测试用例", async () => {
      prisma.promptTestCase.findMany.mockResolvedValue([{ id: "tc1" }, { id: "tc2" }]);
      const result = await service.listTestCases("SAFETY_REVIEW", 50, 0);
      expect(result).toHaveLength(2);
      expect(prisma.promptTestCase.findMany).toHaveBeenCalledWith({
        where: { tool: "SAFETY_REVIEW" },
        orderBy: { createdAt: "desc" },
        take: 50,
        skip: 0,
      });
    });
  });

  describe("runEval", () => {
    const mockPrompt = {
      id: "p1",
      systemPrompt: "你是审核员",
      params: {},
      fewShots: [],
      designNote: null,
    };

    const mockTestCases = [
      {
        id: "tc1",
        tool: "SAFETY_REVIEW" as const,
        input: "正常内容",
        expected: "low",
        category: "allow",
        createdAt: new Date(),
      },
      {
        id: "tc2",
        tool: "SAFETY_REVIEW" as const,
        input: "赌博内容",
        expected: "high",
        category: "gambling",
        createdAt: new Date(),
      },
    ];

    it("LLM 返回正确 JSON → accuracy 计算正确", async () => {
      prisma.prompt.findUnique.mockResolvedValue(mockPrompt);
      prisma.promptTestCase.findMany.mockResolvedValue(mockTestCases);

      // 第一条:低风险,LLM 返回全 low → 匹配 expected=low
      // 第二条:高风险,LLM 返回有 high → 匹配 expected=high
      llm.chat
        .mockResolvedValueOnce(JSON.stringify({ dimensions: [{ severity: "low" }] }))
        .mockResolvedValueOnce(JSON.stringify({ dimensions: [{ severity: "high" }] }));

      prisma.promptEvalRun.update.mockResolvedValue({
        id: "er1",
        accuracy: 1.0,
        totalCases: 2,
        status: "DONE",
      });
      prisma.promptEvalRun.findUnique.mockResolvedValue({
        id: "er1",
        accuracy: 1.0,
        totalCases: 2,
        status: "DONE",
      });

      const result = await service.runEval("SAFETY_REVIEW", "p1");
      expect(result).toEqual(expect.objectContaining({ accuracy: 1.0 }));
    });

    it("部分 mismatch → accuracy 反映实际", async () => {
      prisma.prompt.findUnique.mockResolvedValue(mockPrompt);
      prisma.promptTestCase.findMany.mockResolvedValue(mockTestCases);

      // 第一条:期望 low,但 LLM 返回 high → mismatch
      // 第二条:期望 high,LLM 返回 high → match
      llm.chat
        .mockResolvedValueOnce(JSON.stringify({ dimensions: [{ severity: "high" }] }))
        .mockResolvedValueOnce(JSON.stringify({ dimensions: [{ severity: "high" }] }));

      prisma.promptEvalRun.update.mockResolvedValue({
        id: "er1",
        accuracy: 0.5,
        totalCases: 2,
        status: "DONE",
      });
      prisma.promptEvalRun.findUnique.mockResolvedValue({
        id: "er1",
        accuracy: 0.5,
        totalCases: 2,
        status: "DONE",
      });

      const result = await service.runEval("SAFETY_REVIEW", "p1");
      expect(result).toEqual(expect.objectContaining({ accuracy: 0.5 }));
    });
  });

  describe("promoteToLive", () => {
    it("accuracy 不回退 → 成功上线", async () => {
      const evalRun = {
        id: "er1",
        tool: "SAFETY_REVIEW" as const,
        promptId: "p2",
        accuracy: 0.9,
        totalCases: 10,
      };
      const currentPrompt = {
        id: "p1",
        name: "默认·安全审核",
        systemPrompt: "old",
        params: {},
        fewShots: [],
        designNote: null,
      };
      const candidatePrompt = {
        id: "p2",
        name: "新版安全审核",
        systemPrompt: "new",
        params: {},
        fewShots: [],
        designNote: "new note",
      };

      // compareWithCurrent 依赖的查询
      prisma.promptEvalRun.findUnique.mockResolvedValue(evalRun);
      prisma.prompt.findFirst
        .mockResolvedValueOnce(currentPrompt) // compareWithCurrent: current
        .mockResolvedValueOnce(currentPrompt); // promoteToLive: current
      prisma.promptEvalRun.findFirst.mockResolvedValue({
        id: "er0",
        promptId: "p0",
        accuracy: 0.8,
      }); // previous
      prisma.prompt.findUnique.mockResolvedValue(candidatePrompt);
      prisma.promptSnapshot.create.mockResolvedValue({
        id: "snap1",
        promptId: "p1",
        systemPrompt: "old",
        params: {},
        fewShots: [],
        designNote: null,
      });

      const result = await service.promoteToLive("er1", "admin");
      expect(result).toEqual(expect.objectContaining({ action: "promote" }));
      expect(prisma.prompt.update).toHaveBeenCalled();
      expect(prisma.promptSnapshot.create).toHaveBeenCalled();
    });

    it("accuracy 回退 → 拒绝上线", async () => {
      const evalRun = {
        id: "er1",
        tool: "SAFETY_REVIEW" as const,
        promptId: "p2",
        accuracy: 0.7,
        totalCases: 10,
      };
      const currentPrompt = { id: "p1", name: "默认·安全审核" };

      prisma.promptEvalRun.findUnique.mockResolvedValue(evalRun);
      prisma.prompt.findFirst.mockResolvedValue(currentPrompt);
      // previous accuracy = 0.9, candidate = 0.7 → regression
      prisma.promptEvalRun.findFirst.mockResolvedValue({
        id: "er0",
        promptId: "p0",
        accuracy: 0.9,
      });

      await expect(service.promoteToLive("er1", "admin")).rejects.toThrow("准确率回退");
    });
  });

  describe("rollback", () => {
    it("回到上一版", async () => {
      const lastPromote = {
        id: "la1",
        tool: "SAFETY_REVIEW" as const,
        action: "promote",
        fromPromptId: "snap1",
        toPromptId: "p2",
      };
      const currentPrompt = {
        id: "p1",
        name: "默认·安全审核",
        systemPrompt: "candidate",
        params: {},
        fewShots: [],
        designNote: null,
      };
      const snapshot = {
        id: "snap1",
        promptId: "p1",
        systemPrompt: "original",
        params: {},
        fewShots: [],
        designNote: "original",
      };

      prisma.promptLabAction.findFirst.mockResolvedValue(lastPromote);
      prisma.prompt.findFirst.mockResolvedValue(currentPrompt);
      prisma.promptSnapshot.findUnique.mockResolvedValue(snapshot);

      const result = await service.rollback("SAFETY_REVIEW", "admin");
      expect(result).toEqual(expect.objectContaining({ action: "rollback" }));
      const updateCall = prisma.prompt.update.mock.calls as [
        { where: { id: string }; data: { systemPrompt: string } },
      ][];
      expect(updateCall[0][0].where.id).toBe("p1");
      expect(updateCall[0][0].data.systemPrompt).toBe("original");
    });
  });
});
