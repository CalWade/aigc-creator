import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import type { Server } from "node:http";
import { of } from "rxjs";
import request from "supertest";
import { App } from "supertest/types";

import { AppModule } from "./../src/app.module";
import { LlmClient } from "./../src/llm/llm.client";
import type { ChatStreamFrame } from "./../src/llm/llm.client";
import { PrismaService } from "./../src/prisma/prisma.service";
import { applyAllFixtures, cleanupAllFixtures } from "./../prisma/fixtures";
import { loginAsDemo } from "./helpers/auth";
import { readSse } from "./helpers/sse-client";

const DEMO_FAST_DRAFT_ID = "demodraft0000000000000001";

const OUTLINE = [
  { heading: "引子", summary: "背景介绍" },
  { heading: "现状", summary: "数据与现象" },
  { heading: "结论", summary: "总结观点" },
];

describe("POST /drafts/:id/sections/stream — headings 子集 (e2e)", () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let token: string;
  const llmStreamMock = jest.fn();

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(LlmClient)
      .useValue({ chat: jest.fn(), chatStream: llmStreamMock })
      .compile();

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

  beforeEach(() => {
    llmStreamMock.mockReset();
  });

  async function streamWithBody(body: unknown): Promise<{
    status: number;
    frames: { data: unknown }[];
  }> {
    const server = app.getHttpServer() as Server;
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const addr = server.address() as { port: number; address: string };
    try {
      return await readSse({
        host: addr.address,
        port: addr.port,
        path: `/drafts/${DEMO_FAST_DRAFT_ID}/sections/stream`,
        method: "POST",
        body,
        token,
        timeoutMs: 5000,
      });
    } finally {
      server.close();
    }
  }

  it("不传 headings → 行为不变,所有段都 stream", async () => {
    llmStreamMock.mockReturnValue(
      of(...([{ delta: "片段" }, { done: true }] as [ChatStreamFrame, ChatStreamFrame])),
    );

    const { status, frames } = await streamWithBody({ sections: OUTLINE });

    expect(status).toBe(200);
    const startHeadings = frames
      .filter((f) => (f.data as { type: string }).type === "section.start")
      .map((f) => (f.data as { data: { heading: string } }).data.heading);
    expect(startHeadings).toEqual(["引子", "现状", "结论"]);
    expect(llmStreamMock).toHaveBeenCalledTimes(3);
  });

  it("传 headings=['现状'] → 仅该段 start/token/end + done", async () => {
    llmStreamMock.mockReturnValue(
      of(...([{ delta: "数据" }, { done: true }] as [ChatStreamFrame, ChatStreamFrame])),
    );

    const { status, frames } = await streamWithBody({
      sections: OUTLINE,
      headings: ["现状"],
    });

    expect(status).toBe(200);
    const types = frames.map((f) => (f.data as { type: string }).type);
    expect(types).toEqual(["section.start", "token", "section.end", "done"]);
    const startFrame = frames.find((f) => (f.data as { type: string }).type === "section.start");
    expect((startFrame?.data as { data: { heading: string } }).data.heading).toBe("现状");
    expect(llmStreamMock).toHaveBeenCalledTimes(1);
  });

  it("headings 含不存在的 heading → 200,不出该段(不 422)", async () => {
    llmStreamMock.mockReturnValue(of<ChatStreamFrame>({ done: true }));

    const { status, frames } = await streamWithBody({
      sections: OUTLINE,
      headings: ["不存在的标题"],
    });

    expect(status).toBe(200);
    const types = frames.map((f) => (f.data as { type: string }).type);
    expect(types).toEqual(["done"]);
    expect(llmStreamMock).not.toHaveBeenCalled();
  });

  it("headings 长度 = 51 → 400(class-validator ArrayMaxSize)", async () => {
    const tooMany = Array.from({ length: 51 }, (_, i) => `h${i}`);
    await request(app.getHttpServer())
      .post(`/drafts/${DEMO_FAST_DRAFT_ID}/sections/stream`)
      .set("Authorization", `Bearer ${token}`)
      .send({ sections: OUTLINE, headings: tooMany })
      .expect(400);
    expect(llmStreamMock).not.toHaveBeenCalled();
  });
});
