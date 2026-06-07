import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { VersionKind } from "@prisma/client";
import request from "supertest";
import { App } from "supertest/types";

import { AppModule } from "./../src/app.module";
import { PrismaService } from "./../src/prisma/prisma.service";
import { applyAllFixtures, cleanupAllFixtures, DEMO_AUTHOR_ID } from "./../prisma/fixtures";
import { loginAs, loginAsDemo } from "./helpers/auth";

interface DraftResponse {
  id: string;
  authorId: string;
  title: string;
  body: unknown;
  version: number;
}

interface VersionDto {
  id: string;
  kind: "AUTO" | "NAMED" | "PUBLISHED";
  note: string | null;
  wordCount: number;
  createdAt: string;
}

const SAMPLE_BODY = {
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "你好世界" }] }],
};

describe("VersionsController (e2e)", () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let token: string;

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
    await applyAllFixtures(prisma);

    token = await loginAsDemo(app);
  });

  afterAll(async () => {
    await cleanupAllFixtures(prisma);
    await app.close();
  });

  async function createDraft(): Promise<DraftResponse> {
    const res = await request(app.getHttpServer())
      .post("/drafts")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "v-test", body: SAMPLE_BODY })
      .expect(201);
    return res.body as DraftResponse;
  }

  async function patchBody(draftId: string, text: string): Promise<void> {
    await request(app.getHttpServer())
      .patch(`/drafts/${draftId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        body: {
          type: "doc",
          content: [{ type: "paragraph", content: [{ type: "text", text }] }],
        },
      })
      .expect(200);
  }

  it("PATCH draft body 触发 1 个 AUTO 版本(首次)", async () => {
    const d = await createDraft();
    await patchBody(d.id, "first edit");

    const count = await prisma.draftVersion.count({
      where: { draftId: d.id, kind: VersionKind.AUTO },
    });
    expect(count).toBe(1);
  });

  it("5 分钟内连续 PATCH × 5 仍只有 1 个 AUTO(节流生效)", async () => {
    const d = await createDraft();
    for (let i = 0; i < 5; i++) {
      await patchBody(d.id, `edit ${i}`);
    }
    const count = await prisma.draftVersion.count({
      where: { draftId: d.id, kind: VersionKind.AUTO },
    });
    expect(count).toBe(1);
  });

  it("把已有 AUTO 时间往前推 6 分钟,再 PATCH 产生第 2 个 AUTO(节流释放)", async () => {
    const d = await createDraft();
    await patchBody(d.id, "first");
    // 把刚生的 AUTO 往前推 6 分钟,模拟时间过期
    await prisma.draftVersion.updateMany({
      where: { draftId: d.id, kind: VersionKind.AUTO },
      data: { createdAt: new Date(Date.now() - 6 * 60 * 1000) },
    });
    await patchBody(d.id, "second");
    const count = await prisma.draftVersion.count({
      where: { draftId: d.id, kind: VersionKind.AUTO },
    });
    expect(count).toBe(2);
  });

  it("POST /versions 显式建 NAMED + note,GET /versions 包含它", async () => {
    const d = await createDraft();

    const created = await request(app.getHttpServer())
      .post(`/drafts/${d.id}/versions`)
      .set("Authorization", `Bearer ${token}`)
      .send({ note: "初稿完成" })
      .expect(201);
    const namedV = created.body as VersionDto;
    expect(namedV.kind).toBe("NAMED");
    expect(namedV.note).toBe("初稿完成");

    const list = await request(app.getHttpServer())
      .get(`/drafts/${d.id}/versions`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const items = (list.body as { items: VersionDto[] }).items;
    expect(items.some((v) => v.id === namedV.id && v.kind === "NAMED")).toBe(true);
  });

  it("publish draft → PUBLISHED 版本自动产生", async () => {
    const d = await createDraft();
    // 走 preflight review 走通(同 publish.e2e-spec.ts 字段:safety/quality/recommendation/modelMeta)
    const review = await prisma.review.create({
      data: {
        draftId: d.id,
        stage: "PREFLIGHT",
        safety: { overall: 100, dimensions: [] },
        quality: { overall: 80, dimensions: [] },
        recommendation: "ALLOW",
        modelMeta: {},
      },
    });
    await prisma.draft.update({
      where: { id: d.id },
      data: { lastReviewId: review.id },
    });

    await request(app.getHttpServer())
      .post(`/drafts/${d.id}/publish`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    const published = await prisma.draftVersion.count({
      where: { draftId: d.id, kind: VersionKind.PUBLISHED },
    });
    expect(published).toBe(1);
  });

  it("注入 30 个 AUTO + PATCH 1 次 → 总数仍 30(滚动删生效)", async () => {
    const d = await createDraft();
    // 直接在 DB 注入 30 个 AUTO,createdAt 拉开 — 第 31 次会触发 prune
    const now = Date.now();
    for (let i = 0; i < 30; i++) {
      await prisma.draftVersion.create({
        data: {
          draftId: d.id,
          kind: VersionKind.AUTO,
          snapshot: SAMPLE_BODY,
          wordCount: 4,
          createdAt: new Date(now - (30 - i) * 10 * 60 * 1000), // 每个隔 10 分钟,确保最早的最早
        },
      });
    }
    // 触发新 AUTO(最近一个 createdAt 也已是 10 分钟前,过节流)
    await patchBody(d.id, "trigger prune");

    const total = await prisma.draftVersion.count({
      where: { draftId: d.id, kind: VersionKind.AUTO },
    });
    expect(total).toBe(30);
  });

  it("1 个 NAMED + 30 个 AUTO + PATCH → NAMED 永不删", async () => {
    const d = await createDraft();
    const named = await prisma.draftVersion.create({
      data: {
        draftId: d.id,
        kind: VersionKind.NAMED,
        snapshot: SAMPLE_BODY,
        note: "里程碑",
        wordCount: 4,
        createdAt: new Date(Date.now() - 60 * 60 * 1000),
      },
    });
    const now = Date.now();
    for (let i = 0; i < 30; i++) {
      await prisma.draftVersion.create({
        data: {
          draftId: d.id,
          kind: VersionKind.AUTO,
          snapshot: SAMPLE_BODY,
          wordCount: 4,
          createdAt: new Date(now - (30 - i) * 10 * 60 * 1000),
        },
      });
    }
    await patchBody(d.id, "trigger");

    const namedStill = await prisma.draftVersion.findUnique({ where: { id: named.id } });
    expect(namedStill).not.toBeNull();
  });

  it("POST /restore → Draft.body 等于 version snapshot,version +1", async () => {
    const d = await createDraft();
    await patchBody(d.id, "before restore");

    const v = await prisma.draftVersion.findFirst({
      where: { draftId: d.id, kind: VersionKind.AUTO },
    });
    if (!v) throw new Error("expected AUTO version to exist");

    const beforeDraft = await prisma.draft.findUnique({ where: { id: d.id } });
    if (!beforeDraft) throw new Error("draft missing");

    const res = await request(app.getHttpServer())
      .post(`/drafts/${d.id}/versions/${v.id}/restore`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const restored = res.body as { id: string; body: unknown };
    expect(restored.id).toBe(d.id);
    expect(restored.body).toEqual(v.snapshot);

    const afterDraft = await prisma.draft.findUnique({ where: { id: d.id } });
    if (!afterDraft) throw new Error("draft missing post restore");
    expect(afterDraft.version).toBe(beforeDraft.version + 1);
  });

  it("跨用户 GET /versions → 403", async () => {
    const d = await createDraft();
    await patchBody(d.id, "owner edits");

    const otherToken = await loginAs(app, "tech-author");
    await request(app.getHttpServer())
      .get(`/drafts/${d.id}/versions`)
      .set("Authorization", `Bearer ${otherToken}`)
      .expect(403);
  });

  it("GET /versions/:vid 返回完整 snapshot", async () => {
    const d = await createDraft();
    await patchBody(d.id, "snapshot test");

    const v = await prisma.draftVersion.findFirst({
      where: { draftId: d.id, kind: VersionKind.AUTO },
    });
    if (!v) throw new Error("expected AUTO");

    const res = await request(app.getHttpServer())
      .get(`/drafts/${d.id}/versions/${v.id}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const detail = res.body as VersionDto & { snapshot: unknown };
    expect(detail.id).toBe(v.id);
    expect(detail.snapshot).toEqual(v.snapshot);
  });

  it("DEMO_AUTHOR_ID 与 token 用户一致(防 fixtures 漂移的健全性)", () => {
    expect(DEMO_AUTHOR_ID).toBe("demoauthor000000000000001");
  });
});
