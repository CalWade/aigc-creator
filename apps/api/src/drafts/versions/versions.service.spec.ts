import { BadRequestException } from "@nestjs/common";
import { VersionKind } from "@prisma/client";

import { PrismaService } from "../../prisma/prisma.service";
import { CreateVersionKind } from "./dto/create-version.dto";
import { VersionsService } from "./versions.service";

// Phase 2.14 — createNamed 现在统一处理 NAMED + OFFLINE_CONFLICT。
// 用 kind + snapshot 入参做窄化,以下三个用例覆盖三条分支。

type DraftVersionCreateArgs = {
  data: {
    draftId: string;
    kind: VersionKind;
    snapshot: unknown;
    note: string | null;
    wordCount: number;
  };
};

const DRAFT_BODY = { type: "doc", content: [{ type: "text", text: "线上稿" }] };
const LOCAL_BODY = { type: "doc", content: [{ type: "text", text: "离线稿" }] };

function makeService() {
  const findFirst = jest.fn().mockResolvedValue(null);
  const create = jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({
      id: "v1",
      draftId: "d1",
      kind: data.kind,
      snapshot: data.snapshot,
      note: data.note ?? null,
      wordCount: data.wordCount ?? 0,
      createdAt: new Date("2026-06-08T00:00:00.000Z"),
    }),
  );
  const prisma = {
    draftVersion: { findFirst, create, findMany: jest.fn(), deleteMany: jest.fn() },
  } as unknown as PrismaService;
  const svc = new VersionsService(prisma);
  return { svc, prisma, create };
}

describe("createVersion with kind/snapshot narrow", () => {
  it("kind=OFFLINE_CONFLICT 必带 snapshot,否则 BadRequestException", async () => {
    const { svc, create } = makeService();
    await expect(
      svc.createNamed("d1", DRAFT_BODY, undefined, {
        kind: CreateVersionKind.OFFLINE_CONFLICT,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(create).not.toHaveBeenCalled();
  });

  it("kind=NAMED 时传 snapshot → BadRequestException", async () => {
    const { svc, create } = makeService();
    await expect(
      svc.createNamed("d1", DRAFT_BODY, undefined, {
        kind: CreateVersionKind.NAMED,
        snapshot: LOCAL_BODY,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(create).not.toHaveBeenCalled();
  });

  it("kind=OFFLINE_CONFLICT + snapshot → 落表,kind=OFFLINE_CONFLICT,snapshot=参数", async () => {
    const { svc, create } = makeService();
    const result = await svc.createNamed("d1", DRAFT_BODY, "本地稿冲突保留", {
      kind: CreateVersionKind.OFFLINE_CONFLICT,
      snapshot: LOCAL_BODY,
    });

    expect(create).toHaveBeenCalledTimes(1);
    const calls = create.mock.calls as DraftVersionCreateArgs[][];
    const { data } = calls[0][0];
    expect(data.kind).toBe(VersionKind.OFFLINE_CONFLICT);
    expect(data.snapshot).toEqual(LOCAL_BODY);
    expect(data.note).toBe("本地稿冲突保留");
    expect(result.kind).toBe(VersionKind.OFFLINE_CONFLICT);
  });
});
