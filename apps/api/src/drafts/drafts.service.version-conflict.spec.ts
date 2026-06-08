import { ConflictException } from "@nestjs/common";
import { VERSION_CONFLICT } from "@bytedance-aigc/shared";

import { PrismaService } from "../prisma/prisma.service";
import { DraftsService } from "./drafts.service";
import { VersionsService } from "./versions/versions.service";

// Phase 2.14 — update + baseVersion 乐观并发分支测试。
// 三种走法:命中 / 不命中 / 不传(走老路径)。

type DraftStub = {
  id: string;
  authorId: string;
  title: string;
  body: Record<string, unknown>;
  version: number;
  updatedAt: Date;
};

type DraftUpdateArgs = {
  where: { id: string };
  data: {
    title?: string;
    body?: unknown;
    version?: { increment: number };
  };
};

const STUB_BODY = { type: "doc", content: [] };

function makeStub(overrides: Partial<DraftStub> = {}): DraftStub {
  return {
    id: "d1",
    authorId: "u1",
    title: "原标题",
    body: STUB_BODY,
    version: 3,
    updatedAt: new Date("2026-06-08T00:00:00.000Z"),
    ...overrides,
  };
}

function makeService(stub: DraftStub) {
  // assertAuthor 单次 findUnique 即拿到当前版本,update 路径直接复用。
  const findUnique = jest.fn().mockResolvedValue(stub);
  const update = jest
    .fn()
    .mockImplementation(({ data }: { data: { version?: { increment?: number } } }) =>
      Promise.resolve({
        ...stub,
        version: stub.version + (data.version?.increment ?? 0),
      }),
    );
  const prisma = {
    draft: { findUnique, update },
  } as unknown as PrismaService;
  const versions = {
    snapshotAuto: jest.fn().mockResolvedValue(undefined),
  } as unknown as VersionsService;
  const svc = new DraftsService(prisma, versions);
  return { svc, prisma, versions, findUnique, update };
}

describe("DraftsService.update with baseVersion", () => {
  it("baseVersion === currentVersion → 正常 update,version+1", async () => {
    const stub = makeStub({ version: 3 });
    const { svc, update } = makeService(stub);

    const result = await svc.update("d1", "u1", { baseVersion: 3, title: "新标题" });

    expect(update).toHaveBeenCalledTimes(1);
    const calls = update.mock.calls as DraftUpdateArgs[][];
    expect(calls[0][0].data.version).toEqual({ increment: 1 });
    expect(result.version).toBe(4);
  });

  it("baseVersion !== currentVersion → 抛 ConflictException 带 payload", async () => {
    const stub = makeStub({
      version: 5,
      title: "服务端标题",
      body: { type: "doc", content: [{ type: "text", text: "线上版本" }] },
    });
    const { svc, update } = makeService(stub);

    let caught: ConflictException | undefined;
    try {
      await svc.update("d1", "u1", { baseVersion: 3, title: "本地新标题" });
    } catch (err) {
      caught = err as ConflictException;
    }

    expect(caught).toBeInstanceOf(ConflictException);
    const response = caught!.getResponse() as {
      message: string;
      payload: {
        currentVersion: number;
        title: string;
        body: unknown;
        updatedAt: string;
      };
    };
    expect(response.message).toBe(VERSION_CONFLICT);
    expect(response.payload.currentVersion).toBe(5);
    expect(response.payload.title).toBe("服务端标题");
    expect(response.payload.body).toEqual(stub.body);
    expect(response.payload.updatedAt).toBe(stub.updatedAt.toISOString());
    expect(update).not.toHaveBeenCalled();
  });

  it("baseVersion 不传 → 旧路径,不做版本比对", async () => {
    const stub = makeStub({ version: 7 });
    const { svc, update } = makeService(stub);

    const result = await svc.update("d1", "u1", { title: "无 base" });

    expect(update).toHaveBeenCalledTimes(1);
    expect(result.version).toBe(8);
  });
});
