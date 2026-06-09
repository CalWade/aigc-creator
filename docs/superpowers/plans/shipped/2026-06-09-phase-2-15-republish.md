# Phase 2.15 — 发布后二次编辑实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 已发布稿点「编辑」 → 切回 CloudDraft,但线上仍是老版本;新版本编辑完走完整 §4.1.4 PreflightDialog → publish 成功后 publishedBody 覆盖,旧版本入版本历史。

**Architecture:** Draft 双 body 字段(`body` 编辑中 / `publishedBody` 线上展示)+ 4 态 status(`DRAFT/REVIEWING/PUBLISHED/OFFLINE`,REVIEWING 仅事务内一闪)+ 单 endpoint `POST /drafts/:id/edit` 显式状态转移 + `publish()` 二发分支同步落 publishedBody/Title/Version 快照。读侧 `/post/:id` `/feed` `/authors/:id/posts` 切到 `publishedBody/publishedTitle`,作者侧 `/me/works` 双 Action,作者编辑器顶部 RepublishBanner。env `REPUBLISH_HOTNESS_INHERIT=true` 控热度继承(默认继承)。

**Tech Stack:** NestJS 11 + Prisma 5 + PostgreSQL(后端);Next.js 16 + React 19 + TipTap(前端);Jest + Vitest + Playwright(测试)。

**Spec ref:** [`docs/superpowers/specs/2026-06-09-phase-2-15-republish-design.md`](../specs/2026-06-09-phase-2-15-republish-design.md)

---

## File Structure

**Schema / migration:**

- Modify: `apps/api/prisma/schema.prisma` — DraftStatus 加 REVIEWING、Draft 加 publishedBody / publishedTitle / publishedVersion
- Create: `apps/api/prisma/migrations/<ts>_phase_2_15_republish/migration.sql`

**Backend (NestJS):**

- Modify: `apps/api/src/drafts/drafts.service.ts` — 新增 `edit()`,改 `publish()` 加二发分支(REVIEWING 短瞬+publishedBody 快照+PostStat 重置)
- Modify: `apps/api/src/drafts/drafts.controller.ts` — 新增 `POST :id/edit` 端点;`findOne` 返回追加 publishedBody/Title/Version/At
- Modify: `apps/api/src/feed/feed.service.ts` — `getFeed/getPostDetail/getAuthorPosts/getMyWorks` 读侧切到 publishedBody/publishedTitle(带 fallback 兼容)
- Test: `apps/api/src/drafts/drafts.service.republish.spec.ts` (新建,单测 edit + publish 二发分支)
- Test: `apps/api/test/republish.e2e-spec.ts` (新建,完整二发链路 e2e)

**Shared types:**

- Modify: `packages/shared/src/index.ts` — `MeWorksItem`、`PostDto`、`DraftStatus` 等类型加 `REVIEWING`(若已 export)、补 `EDIT_NOT_ALLOWED` 错误码常量

**Frontend (Next.js):**

- Modify: `apps/web/src/components/draft-editor.tsx` — DraftDetail interface 加 publishedBody/Title/Version,渲染 RepublishBanner
- Create: `apps/web/src/components/republish-banner.tsx`
- Create: `apps/web/src/components/republish-banner.test.tsx`
- Modify: `apps/web/src/app/me/works/page.tsx` — PUBLISHED 卡双 Action;handleEdit 调 /drafts/:id/edit
- Test: `apps/web/src/app/me/works/page.test.tsx`(若不存在,新建关键 UI 单测)

**E2E:**

- Create: `e2e/republish.spec.ts` — Playwright 全 mock 后端,作者点编辑→改→发布→/post/:id 老版/新版可见性

**Docs:**

- Modify: `README.md` — Phase 2.15 段落
- Modify: `.env.example` — `REPUBLISH_HOTNESS_INHERIT=true` 注释

---

## Tasks

### Task 1: schema.prisma + migration

**Files:**

- Modify: `apps/api/prisma/schema.prisma:25-29` (DraftStatus enum) 与 `:112-137` (Draft model)
- Create: `apps/api/prisma/migrations/<ts>_phase_2_15_republish/migration.sql`

- [ ] **Step 1: 改 DraftStatus enum**

```prisma
enum DraftStatus {
  DRAFT
  REVIEWING
  PUBLISHED
  OFFLINE
}
```

- [ ] **Step 2: Draft model 加 3 字段**

在 `model Draft { ... }` 内 `body` 行下面追加:

```prisma
  body              Json
  publishedBody     Json?
  publishedTitle    String?
  publishedVersion  Int?
  version           Int         @default(1)
```

(其它字段顺序不动)

- [ ] **Step 3: 跑 migrate dev,生成 migration.sql**

Run: `cd apps/api && pnpm prisma migrate dev --name phase_2_15_republish --create-only`
Expected: 生成空 SQL 框架,人工编辑加 backfill。

- [ ] **Step 4: 编辑生成的 migration.sql,保证幂等 + backfill**

```sql
-- 添加 enum 值(Postgres 不允许在事务内 ALTER ENUM,Prisma 已自动用 BEGIN/COMMIT 拆开)
ALTER TYPE "DraftStatus" ADD VALUE 'REVIEWING' BEFORE 'PUBLISHED';

-- 添加列
ALTER TABLE "drafts" ADD COLUMN "publishedBody" JSONB;
ALTER TABLE "drafts" ADD COLUMN "publishedTitle" TEXT;
ALTER TABLE "drafts" ADD COLUMN "publishedVersion" INTEGER;

-- backfill:已 PUBLISHED 行兜底,把 body/title/version 拷到 publishedBody/Title/Version
UPDATE "drafts"
SET
  "publishedBody"    = "body",
  "publishedTitle"   = "title",
  "publishedVersion" = "version"
WHERE "status" = 'PUBLISHED' AND "publishedBody" IS NULL;
```

- [ ] **Step 5: 应用 migrate,跑 prisma generate**

Run: `cd apps/api && pnpm prisma migrate deploy && pnpm prisma generate`
Expected: 输出包含 "Database schema is in sync"。

- [ ] **Step 6: 提交**

```bash
unset NODE_OPTIONS && git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/
git commit -m "feat(db): Phase 2.15 加 publishedBody 字段 + REVIEWING 状态"
```

---

### Task 2: DraftsService.edit() 单测先行

**Files:**

- Create: `apps/api/src/drafts/drafts.service.republish.spec.ts`

- [ ] **Step 1: 写失败测试**

```ts
// apps/api/src/drafts/drafts.service.republish.spec.ts
import { Test } from "@nestjs/testing";
import { ConflictException, ForbiddenException } from "@nestjs/common";
import { DraftsService } from "./drafts.service";
import { VersionsService } from "./versions/versions.service";
import { PrismaService } from "../prisma/prisma.service";

describe("DraftsService.edit() — 二次编辑入口", () => {
  let service: DraftsService;
  let prisma: { draft: { findUnique: jest.Mock; update: jest.Mock } };

  beforeEach(async () => {
    prisma = {
      draft: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };
    const module = await Test.createTestingModule({
      providers: [
        DraftsService,
        { provide: PrismaService, useValue: prisma },
        { provide: VersionsService, useValue: {} },
      ],
    }).compile();
    service = module.get(DraftsService);
  });

  it("PUBLISHED → DRAFT,version+1", async () => {
    prisma.draft.findUnique.mockResolvedValue({
      id: "d1",
      authorId: "u1",
      status: "PUBLISHED",
      version: 5,
    });
    prisma.draft.update.mockResolvedValue({ id: "d1", status: "DRAFT", version: 6 });

    const r = await service.edit("d1", "u1");
    expect(r).toEqual({ id: "d1", status: "DRAFT", version: 6 });
    expect(prisma.draft.update).toHaveBeenCalledWith({
      where: { id: "d1" },
      data: { status: "DRAFT", version: { increment: 1 } },
    });
  });

  it("DRAFT 状态 → 409 EDIT_NOT_ALLOWED", async () => {
    prisma.draft.findUnique.mockResolvedValue({
      id: "d1",
      authorId: "u1",
      status: "DRAFT",
      version: 1,
    });
    await expect(service.edit("d1", "u1")).rejects.toMatchObject({
      response: { code: "EDIT_NOT_ALLOWED" },
      status: 409,
    });
  });

  it("OFFLINE 状态 → 409 EDIT_NOT_ALLOWED", async () => {
    prisma.draft.findUnique.mockResolvedValue({
      id: "d1",
      authorId: "u1",
      status: "OFFLINE",
      version: 7,
    });
    await expect(service.edit("d1", "u1")).rejects.toBeInstanceOf(ConflictException);
  });

  it("非作者 → 403", async () => {
    prisma.draft.findUnique.mockResolvedValue({
      id: "d1",
      authorId: "u1",
      status: "PUBLISHED",
      version: 5,
    });
    await expect(service.edit("d1", "OTHER_USER")).rejects.toBeInstanceOf(ForbiddenException);
  });
});
```

- [ ] **Step 2: 跑测试,验证 4 条都 fail**

Run: `pnpm --filter @bytedance-aigc/api test drafts.service.republish.spec`
Expected: 4 fail,因为 `service.edit` 还不存在(报 `is not a function`)。

- [ ] **Step 3: 实现 edit()**

打开 `apps/api/src/drafts/drafts.service.ts`,在 `update()` 之上加:

```ts
/**
 * Phase 2.15:已 PUBLISHED 的稿件切回 DRAFT,作者继续二次编辑。
 * 显式状态转移端点(不复用 PATCH),version+1 让任何 /post/:id 客户端缓存自洽失效。
 */
async edit(
  id: string,
  authorId: string,
): Promise<{ id: string; status: "DRAFT"; version: number }> {
  const cur = await this.assertAuthor(id, authorId);
  if (cur.status !== "PUBLISHED") {
    throw new ConflictException({
      code: "EDIT_NOT_ALLOWED",
      message: "仅 PUBLISHED 状态可进入二次编辑",
    });
  }
  const updated = await this.prisma.draft.update({
    where: { id },
    data: { status: "DRAFT", version: { increment: 1 } },
  });
  return { id: updated.id, status: "DRAFT", version: updated.version };
}
```

- [ ] **Step 4: 跑测试,验证 4 条都 pass**

Run: `pnpm --filter @bytedance-aigc/api test drafts.service.republish.spec`
Expected: 4 pass。

- [ ] **Step 5: 提交**

```bash
unset NODE_OPTIONS && git add apps/api/src/drafts/
git commit -m "feat(api): Phase 2.15 DraftsService.edit() PUBLISHED→DRAFT 二次编辑入口"
```

---

### Task 3: DraftsController POST /drafts/:id/edit

**Files:**

- Modify: `apps/api/src/drafts/drafts.controller.ts:106` 之上(publish 之前)

- [ ] **Step 1: 在 controller 加端点**

```ts
@Post(":id/edit")
@HttpCode(HttpStatus.OK)
edit(
  @Param("id") id: string,
  @CurrentUser() user: JwtPayload,
): Promise<{ id: string; status: "DRAFT"; version: number }> {
  return this.drafts.edit(id, user.sub);
}
```

- [ ] **Step 2: typecheck 不报错**

Run: `pnpm --filter @bytedance-aigc/api typecheck`
Expected: exit 0。

- [ ] **Step 3: 提交**

```bash
unset NODE_OPTIONS && git add apps/api/src/drafts/drafts.controller.ts
git commit -m "feat(api): Phase 2.15 POST /drafts/:id/edit 端点"
```

---

### Task 4: DraftsService.publish() 二发分支(单测 + 实现)

**Files:**

- Modify: `apps/api/src/drafts/drafts.service.republish.spec.ts`(已存在,加 describe)
- Modify: `apps/api/src/drafts/drafts.service.ts:109-146` (publish)

- [ ] **Step 1: 加单测 describe — 二发分支**

在 republish.spec.ts 末尾追加:

```ts
describe("DraftsService.publish() — 首发 / 二发", () => {
  let service: DraftsService;
  let prisma: {
    draft: { findUnique: jest.Mock; update: jest.Mock };
    postStat: { updateMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let versions: { snapshotPublished: jest.Mock };
  const recentReview = { stage: "PREFLIGHT", recommendation: "ALLOW", createdAt: new Date() };

  beforeEach(async () => {
    prisma = {
      draft: { findUnique: jest.fn(), update: jest.fn() },
      postStat: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      $transaction: jest.fn(async (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma)),
    };
    versions = { snapshotPublished: jest.fn().mockResolvedValue(undefined) };
    const module = await Test.createTestingModule({
      providers: [
        DraftsService,
        { provide: PrismaService, useValue: prisma },
        { provide: VersionsService, useValue: versions },
      ],
    }).compile();
    service = module.get(DraftsService);
  });

  it("首发 → publishedBody=body 快照写入,status=PUBLISHED", async () => {
    prisma.draft.findUnique
      .mockResolvedValueOnce({
        id: "d1",
        authorId: "u1",
        status: "DRAFT",
        version: 1,
      })
      .mockResolvedValueOnce({
        id: "d1",
        authorId: "u1",
        status: "DRAFT",
        title: "T1",
        body: { type: "doc" },
        version: 1,
        publishedBody: null,
        lastReview: recentReview,
      });
    prisma.draft.update.mockResolvedValue({
      id: "d1",
      publishedAt: new Date(),
    });

    await service.publish("d1", "u1");

    const updateCalls = prisma.draft.update.mock.calls;
    // 第一次切 REVIEWING,第二次切 PUBLISHED + publishedBody
    expect(updateCalls[0][0]).toMatchObject({ data: { status: "REVIEWING" } });
    expect(updateCalls[1][0]).toMatchObject({
      data: expect.objectContaining({
        status: "PUBLISHED",
        publishedBody: { type: "doc" },
        publishedTitle: "T1",
        publishedVersion: 1,
      }),
    });
    // 首发不动 PostStat
    expect(prisma.postStat.updateMany).not.toHaveBeenCalled();
  });

  it("二发 + 默认 env(继承热度) → publishedBody 覆盖,PostStat 不动", async () => {
    prisma.draft.findUnique
      .mockResolvedValueOnce({ id: "d1", authorId: "u1", status: "DRAFT", version: 6 })
      .mockResolvedValueOnce({
        id: "d1",
        authorId: "u1",
        status: "DRAFT",
        title: "T2",
        body: { type: "doc", text: "v2" },
        version: 6,
        publishedBody: { type: "doc", text: "v1" }, // 二发标志
        lastReview: recentReview,
      });
    prisma.draft.update.mockResolvedValue({ id: "d1", publishedAt: new Date() });

    delete process.env.REPUBLISH_HOTNESS_INHERIT; // 默认继承
    await service.publish("d1", "u1");

    expect(prisma.postStat.updateMany).not.toHaveBeenCalled();
  });

  it("二发 + env=false → PostStat 清零", async () => {
    prisma.draft.findUnique
      .mockResolvedValueOnce({ id: "d1", authorId: "u1", status: "DRAFT", version: 6 })
      .mockResolvedValueOnce({
        id: "d1",
        authorId: "u1",
        status: "DRAFT",
        title: "T2",
        body: { type: "doc", text: "v2" },
        version: 6,
        publishedBody: { type: "doc", text: "v1" },
        lastReview: recentReview,
      });
    prisma.draft.update.mockResolvedValue({ id: "d1", publishedAt: new Date() });

    process.env.REPUBLISH_HOTNESS_INHERIT = "false";
    try {
      await service.publish("d1", "u1");
      expect(prisma.postStat.updateMany).toHaveBeenCalledWith({
        where: { draftId: "d1" },
        data: { impression: 0, click: 0, dwellUnit: 0, like: 0 },
      });
    } finally {
      delete process.env.REPUBLISH_HOTNESS_INHERIT;
    }
  });
});
```

- [ ] **Step 2: 跑测试,3 条新用例 fail**

Run: `pnpm --filter @bytedance-aigc/api test drafts.service.republish.spec`
Expected: 3 fail(publish 还没改:首发不写 publishedBody / 没 REVIEWING 中转 / 没 PostStat 重置)。

- [ ] **Step 3: 改 publish() 实现**

把 `apps/api/src/drafts/drafts.service.ts` 的 `publish` 替换为(替换 109-146 行):

```ts
/**
 * Phase 2.3 + 2.15 — 草稿发布。状态机:必须有最近一次 PREFLIGHT review,
 * 推荐值不能是 BLOCK,且 24h 内有效;否则 409 + code 区分原因。
 *
 * Phase 2.15 二发分支:
 * - publishedBody !== null 视为二发;事务内同步快照 publishedBody/Title/Version
 * - REVIEWING 仅事务内一闪(贴 PRD「Reviewing」语义,无作者侧 UX 暴露)
 * - 二发 + env REPUBLISH_HOTNESS_INHERIT="false" → PostStat 重置;默认继承
 */
async publish(id: string, authorId: string): Promise<{ id: string; publishedAt: Date }> {
  await this.assertAuthor(id, authorId);
  const draft = await this.prisma.draft.findUnique({
    where: { id },
    include: { lastReview: true },
  });
  if (!draft) {
    throw new NotFoundException(`Draft ${id} not found`);
  }
  const r = draft.lastReview;
  if (!r || r.stage !== "PREFLIGHT") {
    throw new ConflictException({ code: "PREFLIGHT_REQUIRED", message: "请先点预检" });
  }
  if (r.recommendation === "BLOCK") {
    throw new ConflictException({
      code: "PREFLIGHT_BLOCKED",
      message: "上次预检结果为 BLOCK,请修改后重试",
    });
  }
  if (Date.now() - r.createdAt.getTime() > 24 * 3600 * 1000) {
    throw new ConflictException({
      code: "PREFLIGHT_EXPIRED",
      message: "预检结果已过 24 小时,请重新预检",
    });
  }

  // 发布瞬间快照(失败不阻塞 — 同 update 钩子)
  try {
    await this.versions.snapshotPublished(id, draft.body);
  } catch (err) {
    this.logger.error(`snapshotPublished failed for draft ${id}`, err as Error);
  }

  const isRepublish = draft.publishedBody !== null;
  const inheritHotness = process.env.REPUBLISH_HOTNESS_INHERIT !== "false";

  const updated = await this.prisma.$transaction(async (tx) => {
    // REVIEWING 一闪 — 单事务内可见,DB 行最终落 PUBLISHED
    await tx.draft.update({
      where: { id },
      data: { status: "REVIEWING" },
    });

    if (isRepublish && !inheritHotness) {
      await tx.postStat.updateMany({
        where: { draftId: id },
        data: { impression: 0, click: 0, dwellUnit: 0, like: 0 },
      });
    }

    return tx.draft.update({
      where: { id },
      data: {
        status: "PUBLISHED",
        publishedAt: new Date(),
        publishedBody: draft.body as Prisma.InputJsonValue,
        publishedTitle: draft.title,
        publishedVersion: draft.version,
      },
    });
  });

  return { id: updated.id, publishedAt: updated.publishedAt as Date };
}
```

- [ ] **Step 4: 跑测试,3 条全 pass + 老的 publish e2e 不破**

Run: `pnpm --filter @bytedance-aigc/api test drafts.service.republish.spec`
Expected: 7/7 pass(4 + 3)。
Run: `pnpm --filter @bytedance-aigc/api test publish` (单测层)
Expected: 老用例不变。

- [ ] **Step 5: 提交**

```bash
unset NODE_OPTIONS && git add apps/api/src/drafts/
git commit -m "feat(api): Phase 2.15 publish() 二发分支 + REVIEWING 短瞬"
```

---

### Task 5: feed.service 读侧切到 publishedBody/Title

**Files:**

- Modify: `apps/api/src/feed/feed.service.ts`
- Modify: 已有 e2e 与单测中相关 fixture / 断言

- [ ] **Step 1: 改 toPostDto 取字段顺序**

`feed.service.ts:175-201` 把 `toPostDto` 的 draft 解构改为优先 publishedTitle/Body:

```ts
function toPostDto(
  draft: {
    id: string;
    title: string;
    publishedTitle: string | null;
    authorId: string;
    publishedAt: Date | null;
    updatedAt: Date;
    body: unknown;
    publishedBody: unknown;
    author: { id: string; handle: string };
    lastReview: { quality: unknown } | null;
  },
  hotnessRaw: number,
  hotnessPool: number[],
): PostDto {
  const hotnessMock = normalizeHotness(hotnessRaw, hotnessPool);
  return {
    id: draft.id,
    title: draft.publishedTitle ?? draft.title,
    authorId: draft.authorId,
    authorHandle: draft.author.handle,
    publishedAt: (draft.publishedAt ?? draft.updatedAt).toISOString(),
    qualityOverall: readQualityOverall(draft.lastReview?.quality),
    hotnessMock,
    coverIndex: pickCoverIndex(draft.id),
    excerpt: extractExcerpt(draft.publishedBody ?? draft.body),
  };
}
```

- [ ] **Step 2: 改 getFeed 的 prisma.findMany select 包含 publishedBody/Title**

`feed.service.ts:60-66` `findMany` 加 `select` 显式列出字段(原来用默认拿全列,现在为了清晰):

实际上 `findMany` 已经默认拿所有字段(`include` 只加 author / lastReview),所以无需 select。**确认 publishedBody 与 publishedTitle 已自动包含**(prisma 默认)。

- [ ] **Step 3: 改 getPostDetail 的 PUBLISHED + publishedBody 双校验**

`feed.service.ts:102-113`:

```ts
async getPostDetail(id: string) {
  const draft = await this.prisma.draft.findUnique({
    where: { id },
    include: {
      author: { select: { id: true, handle: true } },
      lastReview: { select: { quality: true, recommendation: true } },
    },
  });
  if (!draft || draft.status !== "PUBLISHED") return null;
  if (draft.lastReview?.recommendation === "BLOCK") return null;
  return draft;
}
```

无需改 — `status==="PUBLISHED"` 时迁移 backfill 保证 publishedBody 必有值;`toPostDto` 内 `?? body` 兜底现有 fixture。✓

- [ ] **Step 4: 改 getMyWorks 加 publishedBody select**

`feed.service.ts:138-153` `findMany.select` 内追加 `publishedBody: true, publishedTitle: true`。**注意:** MeWorksItem DTO 不暴露 publishedBody/Title(列表不显示原文),只是为了 excerpt 兜底——其实当前 me/works 不展示 excerpt。**保持原样不加 select**,`title` 字段在 me/works 是「最新编辑中标题」语义(作者关心),不切到 publishedTitle。✓

- [ ] **Step 5: 跑现有 feed/post-detail/me-works e2e**

Run: `pnpm db:up && pnpm --filter @bytedance-aigc/api test:e2e feed.e2e-spec post-detail.e2e-spec me-works.e2e-spec`
Expected: 全绿(数据迁移已 backfill 老 fixture,toPostDto 双 fallback)。

- [ ] **Step 6: 提交**

```bash
unset NODE_OPTIONS && git add apps/api/src/feed/feed.service.ts
git commit -m "feat(api): Phase 2.15 toPostDto 优先读 publishedBody/Title 兜底 body"
```

---

### Task 6: DraftsController findOne 返回追加 publishedBody/Title/Version/At

**Files:**

- Modify: `apps/api/src/drafts/drafts.controller.ts:59-62` 和上层 service `findOne`(返 Draft 全字段,Prisma 默认即返 publishedBody)

- [ ] **Step 1: 验证 findOne 已返新字段**

`drafts.service.ts:49-55` `findOne` 用 `prisma.draft.findUnique({ where: { id } })`,Prisma 默认拿所有字段 — `publishedBody/Title/Version` 已自动包含。

无需改 controller / service,只需在前端 DraftDetail interface 增加这几个字段(Task 8 处理)。

- [ ] **Step 2: 跑现有 drafts e2e 验证不破**

Run: `pnpm --filter @bytedance-aigc/api test:e2e drafts.e2e-spec`
Expected: 全绿。

- [ ] **Step 3: 无 commit(零改动 task,可直接进 Task 7)**

---

### Task 7: republish e2e — 完整二发链路

**Files:**

- Create: `apps/api/test/republish.e2e-spec.ts`

- [ ] **Step 1: 写 e2e 失败测试**

```ts
// apps/api/test/republish.e2e-spec.ts
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { App } from "supertest/types";

import { AppModule } from "./../src/app.module";
import { LlmClient } from "./../src/llm/llm.client";
import { PrismaService } from "./../src/prisma/prisma.service";
import { applyAllFixtures, cleanupAllFixtures } from "./../prisma/fixtures";
import { loginAsDemo } from "./helpers/auth";

const FIXTURE_DRAFT_ID = "demodraft0000000000000001"; // demo · 快速稿示例

async function seedAllowReview(prisma: PrismaService, draftId: string): Promise<void> {
  const review = await prisma.review.create({
    data: {
      draftId,
      stage: "PREFLIGHT",
      safety: { overall: 100, dimensions: [] },
      quality: { overall: 80, dimensions: [] },
      recommendation: "ALLOW",
      modelMeta: {},
    },
  });
  await prisma.draft.update({ where: { id: draftId }, data: { lastReviewId: review.id } });
}

describe("Phase 2.15 二次编辑链路 (e2e)", () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let token: string;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] })
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
    token = await loginAsDemo(app);
  });

  afterAll(async () => {
    await cleanupAllFixtures(prisma);
    await app.close();
  });

  beforeEach(async () => {
    // 复位 demo 草稿到首发态
    await prisma.draft.update({
      where: { id: FIXTURE_DRAFT_ID },
      data: {
        status: "DRAFT",
        publishedAt: null,
        publishedBody: null,
        publishedTitle: null,
        publishedVersion: null,
        title: "demo·快速稿示例",
        body: { type: "doc", content: [{ type: "paragraph", text: "v1" }] },
        lastReviewId: null,
      },
    });
    await prisma.review.deleteMany({ where: { draftId: FIXTURE_DRAFT_ID } });
  });

  it("PUBLISHED 状态 → /edit 切回 DRAFT,version+1", async () => {
    // 先发一发
    await seedAllowReview(prisma, FIXTURE_DRAFT_ID);
    await request(app.getHttpServer())
      .post(`/drafts/${FIXTURE_DRAFT_ID}/publish`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    const before = await prisma.draft.findUnique({ where: { id: FIXTURE_DRAFT_ID } });
    expect(before?.status).toBe("PUBLISHED");
    expect(before?.publishedBody).not.toBeNull();

    const res = await request(app.getHttpServer())
      .post(`/drafts/${FIXTURE_DRAFT_ID}/edit`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(res.body).toMatchObject({ status: "DRAFT" });

    const after = await prisma.draft.findUnique({ where: { id: FIXTURE_DRAFT_ID } });
    expect(after?.status).toBe("DRAFT");
    expect(after?.version).toBe((before?.version ?? 0) + 1);
    expect(after?.publishedBody).not.toBeNull(); // 仍保留老线上版
  });

  it("DRAFT 状态调 /edit → 409 EDIT_NOT_ALLOWED", async () => {
    const res = await request(app.getHttpServer())
      .post(`/drafts/${FIXTURE_DRAFT_ID}/edit`)
      .set("Authorization", `Bearer ${token}`)
      .expect(409);
    expect((res.body as { code?: string }).code).toBe("EDIT_NOT_ALLOWED");
  });

  it("二发完整链路:edit → 改 body → preflight → publish → publishedBody 覆盖,/post/:id 显新版", async () => {
    // 首发
    await seedAllowReview(prisma, FIXTURE_DRAFT_ID);
    await request(app.getHttpServer())
      .post(`/drafts/${FIXTURE_DRAFT_ID}/publish`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    const v1 = await prisma.draft.findUnique({ where: { id: FIXTURE_DRAFT_ID } });
    const v1PublishedBody = v1?.publishedBody;

    // 切回编辑
    await request(app.getHttpServer())
      .post(`/drafts/${FIXTURE_DRAFT_ID}/edit`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    // 改 body(模拟二发期间作者编辑)
    await prisma.draft.update({
      where: { id: FIXTURE_DRAFT_ID },
      data: {
        title: "v2 标题",
        body: { type: "doc", content: [{ type: "paragraph", text: "v2 正文" }] },
      },
    });

    // 此时 /post/:id 应返「老线上版」
    const postBefore = await request(app.getHttpServer())
      .get(`/post/${FIXTURE_DRAFT_ID}`)
      .expect(404);
    // 注:status 已切到 DRAFT,/post/:id 直接 404 — 这是预期(线上下线了)

    // 重新 preflight
    await seedAllowReview(prisma, FIXTURE_DRAFT_ID);

    // 二发
    await request(app.getHttpServer())
      .post(`/drafts/${FIXTURE_DRAFT_ID}/publish`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    const v2 = await prisma.draft.findUnique({ where: { id: FIXTURE_DRAFT_ID } });
    expect(v2?.status).toBe("PUBLISHED");
    expect(v2?.publishedTitle).toBe("v2 标题");
    expect(v2?.publishedBody).toMatchObject({ type: "doc" });
    expect(v2?.publishedBody).not.toEqual(v1PublishedBody); // 已覆盖

    // PUBLISHED 版本快照各 1 条(首发 + 二发)= 2 条 PUBLISHED kind
    const versions = await prisma.draftVersion.findMany({
      where: { draftId: FIXTURE_DRAFT_ID, kind: "PUBLISHED" },
    });
    expect(versions.length).toBe(2);
  });
});
```

**注意 spec 选型:** 上面 `expect(...).expect(404)` 这步 — 切回 DRAFT 后 `/post/:id` 就 404,因为 `getPostDetail` 校验 `status==="PUBLISHED"`。这是 PRD 与设计的一个小妥协:**二发期间线上是不可见的(404),不是「显示老版本」**。如果 spec 真要「显示老版本」,需把 getPostDetail 校验从 `status==="PUBLISHED"` 改为「`publishedBody !== null && status !== "OFFLINE"`」。

**这是关键设计点 — 控制器在写测试时需先确认。**

参见 spec §4.3 的「`status="PUBLISHED" AND publishedBody IS NOT NULL`」表述(spec 已明确双校验);这意味着二发期间 status=DRAFT 不显示,**也不显示老版** — 反而是「下线了」。**这与 spec §1 R2「线上版本仍保留原内容」存在歧义**。

**实施前需确认:** 控制器要选 A 还是 B(实施 plan 第 0 步必须先决断,否则 e2e 写错):

- A:DRAFT 期间 /post/:id 404(简单,但作者一进编辑,线上立刻下线)
- B:DRAFT + publishedBody!=null 期间 /post/:id 仍返老版(贴 PRD「线上版本仍保留」原话)

**plan 默认采 B**,把 `getPostDetail` 改为:

```ts
if (!draft) return null;
const isLive =
  draft.status === "PUBLISHED" || (draft.publishedBody !== null && draft.status !== "OFFLINE");
if (!isLive) return null;
```

并补一个返回 published 字段的 toPostDto 调整(已在 Task 5 处理)。

- [ ] **Step 2: 改 getPostDetail 走 B 路**

```ts
// apps/api/src/feed/feed.service.ts:102
async getPostDetail(id: string) {
  const draft = await this.prisma.draft.findUnique({
    where: { id },
    include: {
      author: { select: { id: true, handle: true } },
      lastReview: { select: { quality: true, recommendation: true } },
    },
  });
  if (!draft) return null;
  if (draft.status === "OFFLINE") return null;
  // PUBLISHED 直读;DRAFT/REVIEWING 但有 publishedBody 仍可见(二发期间老线上版保留)
  const isLive = draft.status === "PUBLISHED" || draft.publishedBody !== null;
  if (!isLive) return null;
  if (draft.lastReview?.recommendation === "BLOCK") return null;
  return draft;
}
```

类似地改 `getFeed` 的 where:

```ts
where: {
  OR: [
    { status: "PUBLISHED", publishedAt: { gte: since } },
    { status: { in: ["DRAFT", "REVIEWING"] }, publishedBody: { not: null }, publishedAt: { gte: since } },
  ],
}
```

`getAuthorPosts` 同上。

**WHY:** 这是 spec §1 R2 语义关键 — DRAFT 期间老线上版保留显示。

- [ ] **Step 3: 修正 e2e 测试中 404 期望为 200(老版本仍可见)**

把 `expect(404)` 改为:

```ts
const postBefore = await request(app.getHttpServer()).get(`/post/${FIXTURE_DRAFT_ID}`).expect(200);
expect(postBefore.body.title).toBe("demo·快速稿示例"); // 老版标题
expect(postBefore.body.excerpt).toContain("v1"); // 老版正文
```

- [ ] **Step 4: 跑 e2e**

Run: `pnpm db:up && pnpm --filter @bytedance-aigc/api test:e2e republish.e2e-spec`
Expected: 3 pass。

- [ ] **Step 5: 跑全部 api e2e 不破老用例**

Run: `pnpm --filter @bytedance-aigc/api test:e2e`
Expected: 全绿。

- [ ] **Step 6: 提交**

```bash
unset NODE_OPTIONS && git add apps/api/test/republish.e2e-spec.ts apps/api/src/feed/feed.service.ts
git commit -m "test(api): Phase 2.15 republish e2e + getPostDetail/getFeed 二发期老版可见"
```

---

### Task 8: 前端 RepublishBanner 组件 + 单测

**Files:**

- Create: `apps/web/src/components/republish-banner.tsx`
- Create: `apps/web/src/components/republish-banner.test.tsx`

- [ ] **Step 1: 写失败测试**

```tsx
// apps/web/src/components/republish-banner.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RepublishBanner } from "./republish-banner";

describe("RepublishBanner", () => {
  it("publishedAt 存在 → 显文案 + 查看线上链接", () => {
    render(<RepublishBanner publishedAt="2026-06-08T10:00:00Z" draftId="d1" />);
    expect(screen.getByTestId("republish-banner")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /查看线上/ })).toHaveAttribute("href", "/post/d1");
  });

  it("publishedAt 为 null 不渲染", () => {
    const { container } = render(<RepublishBanner publishedAt={null} draftId="d1" />);
    expect(container.firstChild).toBeNull();
  });
});
```

- [ ] **Step 2: 跑测试,fail**

Run: `pnpm --filter @bytedance-aigc/web test republish-banner`
Expected: 模块找不到 → fail。

- [ ] **Step 3: 实现组件**

```tsx
// apps/web/src/components/republish-banner.tsx
"use client";

import Link from "next/link";

interface Props {
  publishedAt: string | null | undefined;
  draftId: string;
}

export function RepublishBanner({ publishedAt, draftId }: Props) {
  if (!publishedAt) return null;
  return (
    <div
      data-testid="republish-banner"
      className="rounded border border-blue-300 bg-blue-50 px-3 py-2 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200 flex items-center justify-between gap-3"
    >
      <span>你正在编辑已发布版本。线上仍保留原版直到你重新发布通过审核。</span>
      <Link
        href={`/post/${draftId}`}
        target="_blank"
        rel="noopener noreferrer"
        className="underline hover:text-blue-900 shrink-0"
      >
        查看线上 →
      </Link>
    </div>
  );
}
```

- [ ] **Step 4: 测试通过**

Run: `pnpm --filter @bytedance-aigc/web test republish-banner`
Expected: 2 pass。

- [ ] **Step 5: 提交**

```bash
unset NODE_OPTIONS && git add apps/web/src/components/republish-banner.tsx apps/web/src/components/republish-banner.test.tsx
git commit -m "feat(web): Phase 2.15 RepublishBanner 组件"
```

---

### Task 9: DraftEditor 接入 RepublishBanner

**Files:**

- Modify: `apps/web/src/components/draft-editor.tsx:27-35` (DraftDetail interface) 与 `:402` (banner 渲染)

- [ ] **Step 1: 扩 DraftDetail interface**

```ts
interface DraftDetail {
  id: string;
  authorId: string;
  title: string;
  body: JSONContent;
  publishedBody: JSONContent | null;
  publishedTitle: string | null;
  publishedVersion: number | null;
  publishedAt: string | null;
  mode: "FAST" | "FINE";
  version: number;
  updatedAt: string;
}
```

- [ ] **Step 2: 渲染 banner**

在 `bannerSlot` 上方(line 392 之上)加新的逻辑(banner 优先级:Readonly > Offline > Conflict > Republish):

```tsx
const isRepublish = state.kind === "ready" && state.draft.publishedAt != null;

// bannerSlot 加 fallback:
const bannerSlot = isReadonly ? (
  <ReadonlyBanner visible={true} />
) : isOffline ? (
  <OfflineBanner visible={true} />
) : showConflictBanner ? (
  <ConflictBanner visible={true} onOpenVersionHistory={() => setVersionHistoryOpen(true)} />
) : isRepublish ? (
  <RepublishBanner publishedAt={state.draft.publishedAt} draftId={id} />
) : null;
```

加 import:

```ts
import { RepublishBanner } from "./republish-banner";
```

- [ ] **Step 3: typecheck + web vitest 不破**

Run: `pnpm --filter @bytedance-aigc/web typecheck && pnpm --filter @bytedance-aigc/web test`
Expected: 全绿。

- [ ] **Step 4: 提交**

```bash
unset NODE_OPTIONS && git add apps/web/src/components/draft-editor.tsx
git commit -m "feat(web): Phase 2.15 DraftEditor 接入 RepublishBanner"
```

---

### Task 10: /me/works PUBLISHED 双 Action

**Files:**

- Modify: `apps/web/src/app/me/works/page.tsx:122-138`

- [ ] **Step 1: 加 handleEdit 函数 + 改 Action 区块**

打开 `apps/web/src/app/me/works/page.tsx`,在组件内 `useEffect` 之上加:

```ts
async function handleEdit(id: string) {
  const res = await apiFetch(`/drafts/${id}/edit`, { method: "POST" });
  if (res.ok) {
    router.push(`/drafts/${id}`);
    return;
  }
  if (res.status === 409) {
    const body = (await res.json().catch(() => null)) as { code?: string; message?: string } | null;
    window.alert(body?.message ?? "无法进入编辑");
    return;
  }
  window.alert(`无法进入编辑(HTTP ${res.status})`);
}
```

把 line 122-138 的 Action 区块替换为:

```tsx
<div className="mt-3 flex items-center gap-2">
  {w.status === "PUBLISHED" && (
    <>
      <Link
        href={`/post/${w.id}`}
        className="inline-flex items-center rounded border border-zinc-200 dark:border-zinc-800 px-2.5 py-1 text-xs hover:bg-zinc-50 dark:hover:bg-zinc-900"
      >
        查看线上
      </Link>
      <button
        type="button"
        onClick={() => void handleEdit(w.id)}
        className="inline-flex items-center rounded border border-zinc-200 dark:border-zinc-800 px-2.5 py-1 text-xs hover:bg-zinc-50 dark:hover:bg-zinc-900"
      >
        继续编辑草稿
      </button>
    </>
  )}
  {w.status === "DRAFT" && (
    <Link
      href={`/drafts/${w.id}`}
      className="inline-flex items-center rounded border border-zinc-200 dark:border-zinc-800 px-2.5 py-1 text-xs hover:bg-zinc-50 dark:hover:bg-zinc-900"
    >
      继续编辑草稿
    </Link>
  )}
  {w.status === "REVIEWING" && (
    <span className="inline-flex items-center text-xs text-zinc-500 px-2.5 py-1">审核中…</span>
  )}
</div>
```

- [ ] **Step 2: typecheck + web vitest**

Run: `pnpm --filter @bytedance-aigc/web typecheck && pnpm --filter @bytedance-aigc/web test`
Expected: 全绿。

- [ ] **Step 3: 提交**

```bash
unset NODE_OPTIONS && git add apps/web/src/app/me/works/page.tsx
git commit -m "feat(web): Phase 2.15 /me/works PUBLISHED 双 Action 接入 /edit"
```

---

### Task 11: shared 类型补 REVIEWING

**Files:**

- Modify: `packages/shared/src/index.ts`(MeWorksItem.status 类型)

- [ ] **Step 1: 检查 MeWorksItem 类型定义**

```bash
grep -n "MeWorksItem\|status:" packages/shared/src/index.ts | head -20
```

如果 status 字面量为 `"DRAFT" | "PUBLISHED" | "OFFLINE"`,改为 `"DRAFT" | "REVIEWING" | "PUBLISHED" | "OFFLINE"`。

- [ ] **Step 2: 改完 typecheck 全包**

Run: `pnpm typecheck`(根目录)
Expected: 全包绿。

- [ ] **Step 3: 提交**

```bash
unset NODE_OPTIONS && git add packages/shared/src/
git commit -m "feat(shared): Phase 2.15 MeWorksItem.status 加 REVIEWING"
```

---

### Task 12: Playwright e2e 二发链路

**Files:**

- Create: `e2e/republish.spec.ts`

- [ ] **Step 1: 写 e2e**

```ts
// e2e/republish.spec.ts
import { test, expect, type Route } from "@playwright/test";

const DRAFT_ID = "draft-e2e-republish";

interface MockState {
  status: "DRAFT" | "REVIEWING" | "PUBLISHED";
  version: number;
  body: { type: "doc"; content: { type: string; text: string }[] };
  publishedBody: { type: "doc"; content: { type: string; text: string }[] } | null;
  publishedTitle: string | null;
  publishedAt: string | null;
}

async function seedAuth(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("bytedance-aigc.accessToken", "tok-e2e-1");
    window.localStorage.setItem(
      "bytedance-aigc.user",
      JSON.stringify({ id: "u1", handle: "demo-author" }),
    );
  });
}

async function mockRoutes(page: import("@playwright/test").Page, state: MockState) {
  await page.route(`**/drafts/${DRAFT_ID}`, async (route: Route) => {
    if (route.request().resourceType() === "document") return route.fallback();
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: DRAFT_ID,
          authorId: "u1",
          title: "二发示例",
          mode: "FAST",
          updatedAt: "2026-06-08T00:00:00Z",
          ...state,
        }),
      });
      return;
    }
    if (route.request().method() === "PATCH") {
      state.version += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: DRAFT_ID,
          version: state.version,
          updatedAt: new Date().toISOString(),
        }),
      });
      return;
    }
    return route.fallback();
  });

  await page.route(`**/drafts/${DRAFT_ID}/edit`, async (route: Route) => {
    if (route.request().resourceType() === "document") return route.fallback();
    state.status = "DRAFT";
    state.version += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ id: DRAFT_ID, status: "DRAFT", version: state.version }),
    });
  });

  await page.route("**/me/works**", async (route: Route) => {
    if (route.request().resourceType() === "document") return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: [
          {
            id: DRAFT_ID,
            title: "二发示例",
            status: state.status,
            mode: "FAST",
            publishedAt: state.publishedAt,
            updatedAt: "2026-06-08T00:00:00Z",
            qualityOverall: 80,
            recommendation: "ALLOW",
            offlineReason: null,
            offlineAt: null,
          },
        ],
      }),
    });
  });

  await page.route(`**/drafts/${DRAFT_ID}/versions`, async (route: Route) => {
    if (route.request().resourceType() === "document") return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items: [] }),
    });
  });
}

test.describe("Phase 2.15 二次编辑", () => {
  test("PUBLISHED 卡片双 Action → 点编辑切 DRAFT → 编辑器顶部 RepublishBanner", async ({
    page,
  }) => {
    await seedAuth(page);
    const state: MockState = {
      status: "PUBLISHED",
      version: 5,
      body: { type: "doc", content: [{ type: "paragraph", text: "v1" }] },
      publishedBody: { type: "doc", content: [{ type: "paragraph", text: "v1" }] },
      publishedTitle: "二发示例",
      publishedAt: "2026-06-08T10:00:00Z",
    };
    await mockRoutes(page, state);

    await page.goto("/me/works");
    await expect(page.getByText("二发示例")).toBeVisible();
    await expect(page.getByRole("link", { name: "查看线上" })).toHaveAttribute(
      "href",
      `/post/${DRAFT_ID}`,
    );
    await expect(page.getByRole("button", { name: "继续编辑草稿" })).toBeVisible();

    await page.getByRole("button", { name: "继续编辑草稿" }).click();

    // 状态切到 DRAFT(mock 内部 state.status 已变),路由跳到 /drafts/:id
    await page.waitForURL(`**/drafts/${DRAFT_ID}`);
    await expect(page.getByTestId("republish-banner")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole("link", { name: /查看线上/ })).toHaveAttribute(
      "href",
      `/post/${DRAFT_ID}`,
    );
  });
});
```

- [ ] **Step 2: 跑 e2e**

Run: `pnpm db:up && pnpm exec playwright test republish.spec`
Expected: 1 pass。

- [ ] **Step 3: 提交**

```bash
unset NODE_OPTIONS && git add e2e/republish.spec.ts
git commit -m "test(e2e): Phase 2.15 Playwright 二次编辑链路"
```

---

### Task 13: README 段落 + .env.example

**Files:**

- Modify: `README.md` — 在 Phase 2.14 段落之后插 Phase 2.15 段落
- Modify: `.env.example`

- [ ] **Step 1: README 加 Phase 2.15 段落**

在 `README.md` 的 `## 交付物清单` 标题之上,Phase 2.14 末尾之后,加:

```markdown
## Phase 2.15 — 发布后二次编辑

PRD §3.3.3。已发布稿点「编辑」回 DRAFT,但线上仍是老版本;新版本走完整 §4.1.4 PreflightDialog → publish 成功后 publishedBody 覆盖,旧版本入版本历史(VersionKind.PUBLISHED 永不删)。

- **数据模型**:Draft 双 body 字段 — `body`(编辑中) vs `publishedBody`(线上展示);新增 `publishedTitle` / `publishedVersion` 配套快照;`DraftStatus` 加 `REVIEWING`(仅 publish() 事务内一闪)
- **作者侧入口**:`POST /drafts/:id/edit` PUBLISHED→DRAFT,version+1;`/me/works` PUBLISHED 卡片双 Action「查看线上」「继续编辑草稿」;编辑器顶部 RepublishBanner
- **公开端读侧**:`/post/:id` `/feed` `/authors/:id/posts` 改读 `publishedBody/publishedTitle`,二发期间(status=DRAFT/REVIEWING + publishedBody 非空)老线上版仍可见
- **热度继承**:env `REPUBLISH_HOTNESS_INHERIT`(默认 `true`);设 `false` 则二发时 `PostStat.{impression,click,dwellUnit,like}` 清零
- **错误码**:`EDIT_NOT_ALLOWED`(非 PUBLISHED 状态调 /edit)
- **入口限制**:仅 PUBLISHED 可二发;OFFLINE 留 §3.3.4 处理
```

- [ ] **Step 2: .env.example 加注**

在 `.env.example` 末尾追加:

```
# Phase 2.15 — 二发热度继承开关(默认 true 继承,改 false 二发时清零 PostStat)
REPUBLISH_HOTNESS_INHERIT=true
```

- [ ] **Step 3: 提交**

```bash
unset NODE_OPTIONS && git add README.md .env.example
git commit -m "docs: Phase 2.15 README + .env.example"
```

---

### Task 14: 归档 spec + plan 到 shipped/

**Files:**

- Move: `docs/superpowers/specs/2026-06-09-phase-2-15-republish-design.md` → `docs/superpowers/specs/shipped/`
- Move: `docs/superpowers/plans/2026-06-09-phase-2-15-republish.md` → `docs/superpowers/plans/shipped/`

- [ ] **Step 1: git mv**

```bash
git mv docs/superpowers/specs/2026-06-09-phase-2-15-republish-design.md docs/superpowers/specs/shipped/
git mv docs/superpowers/plans/2026-06-09-phase-2-15-republish.md docs/superpowers/plans/shipped/
```

- [ ] **Step 2: 提交**

```bash
unset NODE_OPTIONS && git add -u && git commit -m "chore(docs): 归档 Phase 2.15 spec/plan 到 shipped/"
```

---

## 全量验证(全 Task 完成后)

- [ ] `pnpm typecheck`(全包)
- [ ] `pnpm lint`
- [ ] `pnpm --filter @bytedance-aigc/api test` (api 单测)
- [ ] `pnpm db:up && pnpm --filter @bytedance-aigc/api test:e2e` (api e2e 全套)
- [ ] `pnpm --filter @bytedance-aigc/web test` (web vitest)
- [ ] `pnpm exec playwright test` (e2e 全套)

**预期基线变化:**

- api 单测:+7(4 edit + 3 publish 二发)
- api e2e:+3(republish.e2e-spec)
- web vitest:+2(republish-banner)
- playwright:+1 文件 / 1 用例(republish.spec.ts)
