# Phase 2.17 — §3.5 「恢复默认」+ 3 快照版本管理 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 补齐 PRD §3.5.3 极简版本管理 — 私人 Prompt PATCH 自动入快照(上限 3,事务内裁剪),作者可一键恢复使用平台默认款,可点击回滚到任一历史快照。

**Architecture:** 新增 `PromptSnapshot` 表 1:N 挂 Prompt;`PromptsService.update` 与新增 `restoreSnapshot` 共用私有 `writeWithSnapshot(tx, current, data)` 方法在事务内 INSERT snapshot + 裁剪 + UPDATE prompt;PromptDrawer 我的 tab 加「恢复默认」纯前端切 active + 「历史 ▾」展开 + 单条「回滚」调后端。

**Tech Stack:** NestJS + Prisma + PostgreSQL(api),Next.js + React + Vitest(web)。

Spec: `docs/superpowers/specs/2026-06-09-phase-2-17-prompt-restore-and-snapshots-design.md`

---

## 文件总览

**API**

- 新建 `apps/api/prisma/migrations/<timestamp>_add_prompt_snapshots/migration.sql`(Prisma generate)
- 修改 `apps/api/prisma/schema.prisma`(加 PromptSnapshot 模型 + Prompt.snapshots 反向关系)
- 修改 `apps/api/src/prompts/prompts.service.ts`(改造 update + 新增 listSnapshots/restoreSnapshot/writeWithSnapshot,assertOwnPrivate 接受可选事务客户端)
- 修改 `apps/api/src/prompts/prompts-private.controller.ts`(挂两端点)
- 修改 `apps/api/src/prompts/prompts.service.spec.ts`(新单测用例 8 项)
- 新建 `apps/api/test/prompts-snapshots.e2e-spec.ts`

**Web**

- 修改 `apps/web/src/app/drafts/[id]/_components/PromptDrawer.tsx`(MyPromptItem 加按钮 + 历史展开)
- 新建/修改 `apps/web/src/app/drafts/[id]/_components/PromptDrawer.test.tsx`(若已存在则扩展;不存在则创建)

**Docs**

- 修改 `README.md`(Phase 2.17 段落)

---

## Task 1: Prisma schema + migration

**Files:**

- Modify: `apps/api/prisma/schema.prisma`(line 166-188 区间附近)
- Create: `apps/api/prisma/migrations/<timestamp>_add_prompt_snapshots/migration.sql`(由 prisma migrate dev 自动生成)

- [ ] **Step 1: 在 schema.prisma Prompt 模型尾部加反向关系**

修改 `apps/api/prisma/schema.prisma` 的 Prompt 模型,在 `copies Prompt[] @relation("PromptCopy")` 行下方加一行:

```prisma
  snapshots PromptSnapshot[]
```

- [ ] **Step 2: 在 schema.prisma 末尾(在 model Review 之前)新增 PromptSnapshot 模型**

```prisma
model PromptSnapshot {
  id           String   @id @default(cuid())
  promptId     String
  systemPrompt String   @db.Text
  params       Json
  fewShots     Json
  designNote   String?  @db.Text
  createdAt    DateTime @default(now())

  prompt Prompt @relation(fields: [promptId], references: [id], onDelete: Cascade)

  @@index([promptId, createdAt])
  @@map("prompt_snapshots")
}
```

- [ ] **Step 3: 启动数据库 + 跑 migration**

```bash
pnpm db:up
cd apps/api && npx prisma migrate dev --name add_prompt_snapshots
```

Expected: 输出 `Applied migration ... add_prompt_snapshots`,新建 `apps/api/prisma/migrations/<timestamp>_add_prompt_snapshots/migration.sql` 含 `CREATE TABLE "prompt_snapshots"`。

- [ ] **Step 4: 跑 prisma generate**

```bash
cd apps/api && npx prisma generate
```

Expected: `✔ Generated Prisma Client`。

- [ ] **Step 5: typecheck 通过**

```bash
pnpm --filter @bytedance-aigc/api typecheck
```

Expected: 0 error。

- [ ] **Step 6: Commit**

```bash
unset NODE_OPTIONS && git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/ && git commit -m "feat(prompt): 新增 PromptSnapshot 表(Phase 2.17 Task 1)

Co-Authored-By: claude-opus-4-7 <noreply@anthropic.com>"
```

---

## Task 2: 重命名 assertOwnPrivate → assertOwn,加事务客户端参数

**Files:**

- Modify: `apps/api/src/prompts/prompts.service.ts:144-151`

> 这是纯重构(签名改造),不改语义。先改这一步保证后续 update / restoreSnapshot 能在同事务里复用它。

- [ ] **Step 1: 修改 prompts.service.ts 的 assertOwnPrivate 签名**

把原 `private async assertOwnPrivate(id: string, userSub: string): Promise<Prompt>` 改造为接受可选的 prisma 客户端参数。替换 `apps/api/src/prompts/prompts.service.ts:143-151` 整段为:

```ts
  /** 仅自己的 PRIVATE 才能改/删/列快照/回滚;PLATFORM 一律 403,别人 PRIVATE 也 403。 */
  private async assertOwnPrivate(
    id: string,
    userSub: string,
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<Prompt> {
    const prompt = await db.prompt.findUnique({ where: { id } });
    if (!prompt) throw new NotFoundException(`Prompt ${id} not found`);
    if (prompt.owner !== "PRIVATE" || prompt.authorId !== userSub) {
      throw new ForbiddenException("Prompt not editable");
    }
    return prompt;
  }
```

- [ ] **Step 2: 跑现有单测验证语义不变**

```bash
pnpm --filter @bytedance-aigc/api test -- prompts.service.spec
```

Expected: 现有所有用例 PASS,无新增失败。

- [ ] **Step 3: typecheck**

```bash
pnpm --filter @bytedance-aigc/api typecheck
```

Expected: 0 error。

- [ ] **Step 4: Commit**

```bash
unset NODE_OPTIONS && git add apps/api/src/prompts/prompts.service.ts && git commit -m "refactor(prompt): assertOwnPrivate 接受可选事务客户端(Phase 2.17 Task 2)

Co-Authored-By: claude-opus-4-7 <noreply@anthropic.com>"
```

---

## Task 3: writeWithSnapshot 共享方法 + update 改造

**Files:**

- Modify: `apps/api/src/prompts/prompts.service.ts`(改 update,加 writeWithSnapshot)
- Modify: `apps/api/src/prompts/prompts.service.spec.ts`(加 update 写快照 + 裁剪测试)

- [ ] **Step 1: 写失败测 — update 写一条 snapshot**

在 `apps/api/src/prompts/prompts.service.spec.ts` 文件末尾的最后一个 describe 块内,或新建一个 describe `Phase 2.17 snapshot`,加用例:

```ts
describe("Phase 2.17 snapshot", () => {
  let userId: string;
  let promptId: string;

  beforeEach(async () => {
    const user = await prisma.user.create({
      data: { phone: `139${Date.now()}`.slice(0, 11), name: "P217 User" },
    });
    userId = user.id;
    const platform = await prisma.prompt.findFirst({
      where: { owner: "PLATFORM", tool: "REWRITE_FLUENT", isStarter: true },
    });
    if (!platform) throw new Error("seed missing");
    const copy = await service.copyToPrivate(platform.id, userId);
    promptId = copy.id;
  });

  it("update 把更新前的内容写入一条 snapshot", async () => {
    const before = await prisma.prompt.findUniqueOrThrow({ where: { id: promptId } });
    await service.update(promptId, userId, { systemPrompt: "改后内容 v1" });
    const snaps = await prisma.promptSnapshot.findMany({ where: { promptId } });
    expect(snaps).toHaveLength(1);
    expect(snaps[0].systemPrompt).toBe(before.systemPrompt);
  });
});
```

- [ ] **Step 2: 跑测试验证它失败**

```bash
pnpm --filter @bytedance-aigc/api test -- prompts.service.spec
```

Expected: 新用例 FAIL(snaps 长度 0 != 1)。

- [ ] **Step 3: 实现 writeWithSnapshot + 改造 update**

修改 `apps/api/src/prompts/prompts.service.ts`,把 import 行加上 `Prompt` 已有,确认 `Prisma` 已 import(line 7 `import { DraftToolType, Prisma, Prompt } from "@prisma/client";` 已有)。

替换 `update(id, userSub, dto)` 整个方法体(原 line 123-136),并在 `assertOwnPrivate` 上方加新私有方法:

```ts
  async update(id: string, userSub: string, dto: UpdatePromptDto): Promise<Prompt> {
    return this.prisma.$transaction(async (tx) => {
      const current = await this.assertOwnPrivate(id, userSub, tx);
      return this.writeWithSnapshot(tx, current, {
        ...(dto.systemPrompt !== undefined ? { systemPrompt: dto.systemPrompt } : {}),
        ...(dto.params !== undefined ? { params: dto.params as Prisma.InputJsonValue } : {}),
        ...(dto.fewShots !== undefined
          ? { fewShots: dto.fewShots as unknown as Prisma.InputJsonValue }
          : {}),
        ...(dto.designNote !== undefined ? { designNote: dto.designNote } : {}),
      });
    });
  }

  /**
   * Phase 2.17:在事务内
   *  1) 把 current 写一条 snapshot
   *  2) 裁剪 snapshot 到最近 3 条
   *  3) 用 patch 更新 prompt
   * update 与 restoreSnapshot 共用此方法,避免事务嵌套。
   */
  private async writeWithSnapshot(
    tx: Prisma.TransactionClient,
    current: Prompt,
    patch: Prisma.PromptUpdateInput,
  ): Promise<Prompt> {
    await tx.promptSnapshot.create({
      data: {
        promptId: current.id,
        systemPrompt: current.systemPrompt,
        params: current.params as Prisma.InputJsonValue,
        fewShots: current.fewShots as Prisma.InputJsonValue,
        designNote: current.designNote,
      },
    });
    // 裁剪到 3:删第 4 旧及以后(理论 update 前 ≤3,新插入后 ≤4,overflow 至多 1)
    const overflow = await tx.promptSnapshot.findMany({
      where: { promptId: current.id },
      orderBy: { createdAt: "asc" },
      skip: 3,
      select: { id: true },
    });
    if (overflow.length > 0) {
      await tx.promptSnapshot.deleteMany({
        where: { id: { in: overflow.map((s) => s.id) } },
      });
    }
    return tx.prompt.update({ where: { id: current.id }, data: patch });
  }
```

- [ ] **Step 4: 跑测试验证 PASS**

```bash
pnpm --filter @bytedance-aigc/api test -- prompts.service.spec
```

Expected: 全 PASS,新用例绿。

- [ ] **Step 5: 加裁剪到 3 测试**

在同一个 describe 内追加:

```ts
it("PATCH 第 4 次后 snapshot 表只剩 3 条(最旧被裁剪)", async () => {
  for (let i = 0; i < 4; i++) {
    await service.update(promptId, userId, { systemPrompt: `v${i}` });
  }
  const snaps = await prisma.promptSnapshot.findMany({
    where: { promptId },
    orderBy: { createdAt: "asc" },
  });
  expect(snaps).toHaveLength(3);
});
```

- [ ] **Step 6: 跑测试验证 PASS**

```bash
pnpm --filter @bytedance-aigc/api test -- prompts.service.spec
```

Expected: 全 PASS。

- [ ] **Step 7: typecheck + lint**

```bash
pnpm --filter @bytedance-aigc/api typecheck && pnpm --filter @bytedance-aigc/api lint
```

Expected: 0 error。

- [ ] **Step 8: Commit**

```bash
unset NODE_OPTIONS && git add apps/api/src/prompts/prompts.service.ts apps/api/src/prompts/prompts.service.spec.ts && git commit -m "feat(prompt): update 改事务 + 写快照 + 裁剪到 3(Phase 2.17 Task 3)

Co-Authored-By: claude-opus-4-7 <noreply@anthropic.com>"
```

---

## Task 4: listSnapshots + restoreSnapshot

**Files:**

- Modify: `apps/api/src/prompts/prompts.service.ts`(加两个 public 方法)
- Modify: `apps/api/src/prompts/prompts.service.spec.ts`(加 5 用例)

- [ ] **Step 1: 写 listSnapshots 失败测**

在 `Phase 2.17 snapshot` describe 内追加:

```ts
it("listSnapshots 仅返回最多 3 条 desc by createdAt", async () => {
  for (let i = 0; i < 4; i++) {
    await service.update(promptId, userId, { systemPrompt: `v${i}` });
  }
  const snaps = await service.listSnapshots(promptId, userId);
  expect(snaps).toHaveLength(3);
  for (let i = 0; i + 1 < snaps.length; i++) {
    expect(snaps[i].createdAt.getTime()).toBeGreaterThanOrEqual(snaps[i + 1].createdAt.getTime());
  }
});

it("listSnapshots 非作者 → Forbidden", async () => {
  const other = await prisma.user.create({
    data: { phone: `138${Date.now()}`.slice(0, 11), name: "Other" },
  });
  await service.update(promptId, userId, { systemPrompt: "v1" });
  await expect(service.listSnapshots(promptId, other.id)).rejects.toThrow(/forbidden|editable/i);
});
```

- [ ] **Step 2: 跑测试验证失败**

```bash
pnpm --filter @bytedance-aigc/api test -- prompts.service.spec
```

Expected: 2 个新用例 FAIL(`service.listSnapshots is not a function`)。

- [ ] **Step 3: 实现 listSnapshots**

在 prompts.service.ts 的 `assertOwnPrivate` 上方加:

```ts
  /** Phase 2.17:列最近 3 条快照(desc by createdAt)。仅作者本人可调。 */
  async listSnapshots(promptId: string, userSub: string): Promise<PromptSnapshot[]> {
    await this.assertOwnPrivate(promptId, userSub);
    return this.prisma.promptSnapshot.findMany({
      where: { promptId },
      orderBy: { createdAt: "desc" },
      take: 3,
    });
  }
```

并在 import 里把 `PromptSnapshot` 从 `@prisma/client` 加进来:

```ts
import { DraftToolType, Prisma, Prompt, PromptSnapshot } from "@prisma/client";
```

- [ ] **Step 4: 跑测试验证 PASS**

```bash
pnpm --filter @bytedance-aigc/api test -- prompts.service.spec
```

Expected: 全 PASS。

- [ ] **Step 5: 写 restoreSnapshot 失败测**

追加:

```ts
it("restoreSnapshot 把 prompt 内容覆盖为 snapshot 内容", async () => {
  const beforeFirst = (await prisma.prompt.findUniqueOrThrow({ where: { id: promptId } }))
    .systemPrompt;
  await service.update(promptId, userId, { systemPrompt: "vNEW" });
  const snaps = await service.listSnapshots(promptId, userId);
  expect(snaps[0].systemPrompt).toBe(beforeFirst);

  await service.restoreSnapshot(promptId, snaps[0].id, userId);

  const after = await prisma.prompt.findUniqueOrThrow({ where: { id: promptId } });
  expect(after.systemPrompt).toBe(beforeFirst);
});

it("restoreSnapshot snapId 不属于该 prompt → NotFound", async () => {
  await service.update(promptId, userId, { systemPrompt: "v1" });
  await expect(service.restoreSnapshot(promptId, "nonexistent-id", userId)).rejects.toThrow(
    /not found/i,
  );
});

it("restoreSnapshot 非作者 → Forbidden", async () => {
  await service.update(promptId, userId, { systemPrompt: "v1" });
  const snaps = await service.listSnapshots(promptId, userId);
  const other = await prisma.user.create({
    data: { phone: `137${Date.now()}`.slice(0, 11), name: "Other2" },
  });
  await expect(service.restoreSnapshot(promptId, snaps[0].id, other.id)).rejects.toThrow(
    /forbidden|editable/i,
  );
});
```

- [ ] **Step 6: 跑测试验证失败**

```bash
pnpm --filter @bytedance-aigc/api test -- prompts.service.spec
```

Expected: 3 用例 FAIL。

- [ ] **Step 7: 实现 restoreSnapshot**

在 prompts.service.ts 的 listSnapshots 下方加:

```ts
  /** Phase 2.17:用快照内容走 update 路径 — 当前状态自然入新快照。 */
  async restoreSnapshot(promptId: string, snapId: string, userSub: string): Promise<Prompt> {
    return this.prisma.$transaction(async (tx) => {
      const current = await this.assertOwnPrivate(promptId, userSub, tx);
      const snap = await tx.promptSnapshot.findFirst({
        where: { id: snapId, promptId },
      });
      if (!snap) {
        throw new NotFoundException(`Snapshot ${snapId} not found for prompt ${promptId}`);
      }
      return this.writeWithSnapshot(tx, current, {
        systemPrompt: snap.systemPrompt,
        params: snap.params as Prisma.InputJsonValue,
        fewShots: snap.fewShots as Prisma.InputJsonValue,
        designNote: snap.designNote,
      });
    });
  }
```

- [ ] **Step 8: 跑测试验证 PASS**

```bash
pnpm --filter @bytedance-aigc/api test -- prompts.service.spec
```

Expected: 全 PASS,5 个新用例绿。

- [ ] **Step 9: typecheck + lint**

```bash
pnpm --filter @bytedance-aigc/api typecheck && pnpm --filter @bytedance-aigc/api lint
```

Expected: 0 error。

- [ ] **Step 10: Commit**

```bash
unset NODE_OPTIONS && git add apps/api/src/prompts/prompts.service.ts apps/api/src/prompts/prompts.service.spec.ts && git commit -m "feat(prompt): listSnapshots + restoreSnapshot 服务层(Phase 2.17 Task 4)

Co-Authored-By: claude-opus-4-7 <noreply@anthropic.com>"
```

---

## Task 5: 控制器端点

**Files:**

- Modify: `apps/api/src/prompts/prompts-private.controller.ts`

- [ ] **Step 1: 加 GET /prompts/:id/snapshots**

替换 `apps/api/src/prompts/prompts-private.controller.ts` 整个文件为:

```ts
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { Prompt, PromptSnapshot } from "@prisma/client";

import { CurrentUser } from "../auth/current-user.decorator";
import type { JwtPayload } from "../auth/jwt-payload.interface";
import { UserGuard } from "../auth/user.guard";
import { PromptsService } from "./prompts.service";
import { UpdatePromptDto } from "./dto/update-prompt.dto";

/**
 * Phase 2.2 Task 8 — 私有 Prompt 写端点(基础 CRUD)。
 * Phase 2.17 — 快照列表 + 回滚两端点扩展。
 *
 * 与 PromptsController 同挂 `/prompts`,本控制器走 UserGuard,路由签名不重叠:
 *   GET    /prompts/private                              → 自己的私有
 *   POST   /prompts/:platformId/copy                     → 平台 → 私人副本
 *   PATCH  /prompts/:id                                  → 改自己的私人 prompt
 *   DELETE /prompts/:id                                  → 删自己的私人 prompt
 *   GET    /prompts/:id/snapshots                        → 列最近 3 条快照
 *   POST   /prompts/:id/snapshots/:snapId/restore        → 回滚到快照
 */
@Controller("prompts")
@UseGuards(UserGuard)
export class PromptsPrivateController {
  constructor(private readonly prompts: PromptsService) {}

  @Get("private")
  listPrivate(@CurrentUser() user: JwtPayload): Promise<Prompt[]> {
    return this.prompts.listPrivate(user.sub);
  }

  @Post(":platformId/copy")
  @HttpCode(HttpStatus.CREATED)
  copy(@Param("platformId") platformId: string, @CurrentUser() user: JwtPayload): Promise<Prompt> {
    return this.prompts.copyToPrivate(platformId, user.sub);
  }

  @Patch(":id")
  update(
    @Param("id") id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdatePromptDto,
  ): Promise<Prompt> {
    return this.prompts.update(id, user.sub, dto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@Param("id") id: string, @CurrentUser() user: JwtPayload): Promise<void> {
    return this.prompts.deleteOne(id, user.sub);
  }

  @Get(":id/snapshots")
  listSnapshots(
    @Param("id") id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<PromptSnapshot[]> {
    return this.prompts.listSnapshots(id, user.sub);
  }

  @Post(":id/snapshots/:snapId/restore")
  @HttpCode(HttpStatus.OK)
  restore(
    @Param("id") id: string,
    @Param("snapId") snapId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<Prompt> {
    return this.prompts.restoreSnapshot(id, snapId, user.sub);
  }
}
```

- [ ] **Step 2: typecheck**

```bash
pnpm --filter @bytedance-aigc/api typecheck
```

Expected: 0 error。

- [ ] **Step 3: lint**

```bash
pnpm --filter @bytedance-aigc/api lint
```

Expected: 0 error。

- [ ] **Step 4: 跑全量单测确保旧 e2e/单测未坏**

```bash
pnpm --filter @bytedance-aigc/api test
```

Expected: 全 PASS。

- [ ] **Step 5: Commit**

```bash
unset NODE_OPTIONS && git add apps/api/src/prompts/prompts-private.controller.ts && git commit -m "feat(prompt): 控制器加 snapshots + restore 端点(Phase 2.17 Task 5)

Co-Authored-By: claude-opus-4-7 <noreply@anthropic.com>"
```

---

## Task 6: e2e 流程测试

**Files:**

- Create: `apps/api/test/prompts-snapshots.e2e-spec.ts`

- [ ] **Step 1: 写 e2e**

参考现有 `apps/api/test/prompts-write.e2e-spec.ts` 的注册 + JWT 头组织方式,创建 `apps/api/test/prompts-snapshots.e2e-spec.ts`:

```ts
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import * as request from "supertest";

import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";

describe("Prompts snapshots (e2e, Phase 2.17)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let copyId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await prisma.promptSnapshot.deleteMany();
    await prisma.prompt.deleteMany({ where: { owner: "PRIVATE" } });
    await prisma.user.deleteMany({ where: { phone: { startsWith: "139002" } } });

    const phone = `139002${Date.now().toString().slice(-5)}`;
    const otpRes = await request(app.getHttpServer()).post("/auth/otp").send({ phone });
    expect(otpRes.status).toBe(201);
    const code = otpRes.body.code as string;

    const loginRes = await request(app.getHttpServer()).post("/auth/login").send({ phone, code });
    expect(loginRes.status).toBe(201);
    token = loginRes.body.token as string;

    const platform = await prisma.prompt.findFirstOrThrow({
      where: { owner: "PLATFORM", tool: "REWRITE_FLUENT", isStarter: true },
    });
    const copyRes = await request(app.getHttpServer())
      .post(`/prompts/${platform.id}/copy`)
      .set("Authorization", `Bearer ${token}`)
      .send();
    expect(copyRes.status).toBe(201);
    copyId = copyRes.body.id as string;
  });

  it("PATCH x4 → list 仅 3 条 → restore 第 2 条 → prompt 内容变,新快照在最前", async () => {
    for (let i = 0; i < 4; i++) {
      const res = await request(app.getHttpServer())
        .patch(`/prompts/${copyId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ systemPrompt: `v${i}` });
      expect(res.status).toBe(200);
    }

    const listRes = await request(app.getHttpServer())
      .get(`/prompts/${copyId}/snapshots`)
      .set("Authorization", `Bearer ${token}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body).toHaveLength(3);

    const second = listRes.body[1];
    const restoreRes = await request(app.getHttpServer())
      .post(`/prompts/${copyId}/snapshots/${second.id}/restore`)
      .set("Authorization", `Bearer ${token}`)
      .send();
    expect(restoreRes.status).toBe(200);
    expect(restoreRes.body.systemPrompt).toBe(second.systemPrompt);

    const after = await request(app.getHttpServer())
      .get(`/prompts/${copyId}/snapshots`)
      .set("Authorization", `Bearer ${token}`);
    expect(after.status).toBe(200);
    expect(after.body).toHaveLength(3);
    // 最新一条 = 被回滚前的(也就是最后一次 PATCH 的 v3)
    expect(after.body[0].systemPrompt).toBe("v3");
  });

  it("非作者 GET snapshots → 403", async () => {
    const phone2 = `139002${(Date.now() + 1).toString().slice(-5)}`;
    const otp = await request(app.getHttpServer()).post("/auth/otp").send({ phone: phone2 });
    const code2 = otp.body.code as string;
    const loginRes = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ phone: phone2, code: code2 });
    const token2 = loginRes.body.token as string;

    const res = await request(app.getHttpServer())
      .get(`/prompts/${copyId}/snapshots`)
      .set("Authorization", `Bearer ${token2}`);
    expect(res.status).toBe(403);
  });

  it("restore snapId 不属于该 prompt → 404", async () => {
    await request(app.getHttpServer())
      .patch(`/prompts/${copyId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ systemPrompt: "v1" });
    const res = await request(app.getHttpServer())
      .post(`/prompts/${copyId}/snapshots/cl_xxx_not_exist/restore`)
      .set("Authorization", `Bearer ${token}`)
      .send();
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: 跑 e2e**

```bash
pnpm --filter @bytedance-aigc/api test:e2e -- prompts-snapshots
```

Expected: 3 用例 PASS。

- [ ] **Step 3: 跑全量 e2e 确保未误伤**

```bash
pnpm --filter @bytedance-aigc/api test:e2e
```

Expected: 全 PASS。

- [ ] **Step 4: Commit**

```bash
unset NODE_OPTIONS && git add apps/api/test/prompts-snapshots.e2e-spec.ts && git commit -m "test(prompt): snapshots + restore e2e(Phase 2.17 Task 6)

Co-Authored-By: claude-opus-4-7 <noreply@anthropic.com>"
```

---

## Task 7: PromptDrawer UI — 「恢复默认」+ 「历史 ▾」

**Files:**

- Modify: `apps/web/src/app/drafts/[id]/_components/PromptDrawer.tsx`

- [ ] **Step 1: 加 PromptSnapshot 类型 + 在 PromptDrawer 顶层暴露 reload 给 MyPromptItem**

修改 `PromptDrawer.tsx`,在 `PromptItem` 接口下方加:

```ts
interface PromptSnapshot {
  id: string;
  systemPrompt: string;
  designNote: string | null;
  createdAt: string;
}
```

- [ ] **Step 2: 把 platform 数组传给 MyPromptItem 用于「恢复默认」**

修改 `PromptDrawer` 组件内的 `MyPromptItem` 调用处(line 158-165),并修改 `MyPromptItem` 函数签名加两个 prop:

```ts
{tab === "mine" &&
  minePerTool.map((p) => (
    <MyPromptItem
      key={p.id}
      prompt={p}
      tool={tool}
      isActive={activeId === p.id}
      platformDefault={platform.find((pp) => pp.tool === tool && pp.isStarter) ?? null}
      onActivate={() => setPromptId(p.id)}
      onRestoreDefault={(id) => setPromptId(id)}
      onDelete={() => void remove(p.id)}
      onSave={(patch) => void updateField(p.id, patch)}
    />
  ))}
```

并修改 `MyPromptItem` 签名(原 line 175-186):

```ts
function MyPromptItem({
  prompt,
  tool: _tool,
  isActive,
  platformDefault,
  onActivate,
  onRestoreDefault,
  onDelete,
  onSave,
}: {
  prompt: PromptItem;
  tool: DraftToolType;
  isActive: boolean;
  platformDefault: PromptItem | null;
  onActivate: () => void;
  onRestoreDefault: (platformId: string) => void;
  onDelete: () => void;
  onSave: (patch: { systemPrompt?: string; designNote?: string }) => void;
}) {
```

- [ ] **Step 3: 在 MyPromptItem 内加历史状态 + 按钮**

在 `MyPromptItem` 函数体内,在现有 `useState` 下方加:

```ts
const [historyOpen, setHistoryOpen] = useState(false);
const [snapshots, setSnapshots] = useState<PromptSnapshot[]>([]);
const loadHistory = async (): Promise<void> => {
  const res = await apiFetch(`/prompts/${prompt.id}/snapshots`);
  if (res.ok) setSnapshots((await res.json()) as PromptSnapshot[]);
};
useEffect(() => {
  if (historyOpen) void loadHistory();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [historyOpen]);

const onRestore = async (snapId: string): Promise<void> => {
  const res = await apiFetch(`/prompts/${prompt.id}/snapshots/${snapId}/restore`, {
    method: "POST",
    body: "{}",
  });
  if (res.ok) {
    onSave({}); // 触发父级 reload
    await loadHistory();
  }
};

const fmtRel = (iso: string): string => {
  const ms = Date.now() - new Date(iso).getTime();
  const sec = Math.round(ms / 1000);
  const fmt = new Intl.RelativeTimeFormat("zh-CN", { numeric: "auto" });
  if (sec < 60) return fmt.format(-sec, "second");
  const min = Math.round(sec / 60);
  if (min < 60) return fmt.format(-min, "minute");
  const hr = Math.round(min / 60);
  if (hr < 24) return fmt.format(-hr, "hour");
  return fmt.format(-Math.round(hr / 24), "day");
};
```

并在文件顶部 import 加 `useEffect`:

```ts
import { useEffect, useState } from "react";
```

- [ ] **Step 4: 改 onSave 签名为可空 patch,触发父级 reload**

注意:Step 3 里 `onRestore` 调 `onSave({})` 触发父级 reload。但当前 `onSave` 调用 `updateField(id, patch)` 会发 PATCH 空 body —— 这会再写一条 snapshot 把 prompt 内容改成"啥都没改"。改思路:不调 onSave,改成传一个新的 `onAfterMutation` prop。

修改父级 PromptDrawer 内 `MyPromptItem` 调用,添加:

```tsx
onAfterMutation={() => void reload()}
```

修改 MyPromptItem 签名加上:

```ts
  onAfterMutation: () => void;
```

并把 Step 3 内的 `onSave({})` 改为 `onAfterMutation()`。

- [ ] **Step 5: 在 MyPromptItem JSX 卡片底部加按钮区**

在 `<div className="flex justify-end">` 那块(原"设为当前生效"按钮所在 div)替换为:

```tsx
<div className="flex flex-col gap-2 border-t border-zinc-100 dark:border-zinc-800 pt-2">
  <div className="flex justify-end gap-2">
    <button
      type="button"
      onClick={() => platformDefault && onRestoreDefault(platformDefault.id)}
      disabled={!platformDefault}
      title={platformDefault ? "切回平台默认款" : "该工具暂无平台默认款"}
      className="text-xs rounded border border-zinc-300 dark:border-zinc-700 px-2 py-1 disabled:opacity-40"
    >
      恢复默认
    </button>
    <button
      type="button"
      onClick={() => setHistoryOpen((v) => !v)}
      className="text-xs rounded border border-zinc-300 dark:border-zinc-700 px-2 py-1"
    >
      {historyOpen ? "历史 ▴" : "历史 ▾"}
    </button>
    <button
      type="button"
      onClick={onActivate}
      className={`rounded px-2 py-1 text-xs ${
        isActive ? "bg-emerald-600 text-white" : "border border-zinc-300 dark:border-zinc-700"
      }`}
    >
      {isActive ? "当前生效" : "设为当前生效"}
    </button>
  </div>
  {historyOpen && (
    <ul className="flex flex-col gap-1 text-xs">
      {snapshots.length === 0 && <li className="text-zinc-500">暂无历史快照(下次保存后产生)</li>}
      {snapshots.map((s) => (
        <li
          key={s.id}
          className="flex items-center justify-between gap-2 rounded border border-zinc-200 dark:border-zinc-800 px-2 py-1"
        >
          <span className="flex-1 truncate text-zinc-500">
            {fmtRel(s.createdAt)} · {s.systemPrompt.slice(0, 30)}
            {s.systemPrompt.length > 30 ? "…" : ""}
          </span>
          <button
            type="button"
            onClick={() => void onRestore(s.id)}
            className="text-emerald-600 hover:underline"
          >
            回滚
          </button>
        </li>
      ))}
    </ul>
  )}
</div>
```

- [ ] **Step 6: typecheck + lint**

```bash
pnpm --filter @bytedance-aigc/web typecheck && pnpm --filter @bytedance-aigc/web lint
```

Expected: 0 error。

- [ ] **Step 7: Commit**

```bash
unset NODE_OPTIONS && git add apps/web/src/app/drafts/[id]/_components/PromptDrawer.tsx && git commit -m "feat(web): PromptDrawer 加恢复默认 + 历史 ▾ + 回滚(Phase 2.17 Task 7)

Co-Authored-By: claude-opus-4-7 <noreply@anthropic.com>"
```

---

## Task 8: web vitest

**Files:**

- Create: `apps/web/src/app/drafts/[id]/_components/PromptDrawer.test.tsx`(若存在则扩展;不存在则新建)

- [ ] **Step 1: 看是否已有 PromptDrawer.test.tsx**

```bash
ls apps/web/src/app/drafts/[id]/_components/PromptDrawer.test.tsx 2>&1
```

Expected: 不存在(若存在则把下面的内容并入)。

- [ ] **Step 2: 写 5 个用例**

创建 `apps/web/src/app/drafts/[id]/_components/PromptDrawer.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { PromptDrawer } from "./PromptDrawer";

// 模块级 mocks
vi.mock("@/lib/auth", () => ({
  apiFetch: vi.fn(),
}));

const setPromptIdMock = vi.fn();
vi.mock("@/hooks/use-active-prompt-id", () => ({
  useActivePromptId: () => ({ promptId: null, setPromptId: setPromptIdMock }),
}));

import { apiFetch } from "@/lib/auth";

const platformPrompt = {
  id: "plat-1",
  owner: "PLATFORM",
  authorId: null,
  tool: "REWRITE_FLUENT",
  name: "默认款",
  systemPrompt: "你是一个流畅化助手",
  designNote: null,
  isStarter: true,
  sourcePromptId: null,
};

const myPrompt = {
  id: "mine-1",
  owner: "PRIVATE",
  authorId: "u1",
  tool: "REWRITE_FLUENT",
  name: "我的副本",
  systemPrompt: "改后内容",
  designNote: null,
  isStarter: false,
  sourcePromptId: "plat-1",
};

const setupFetch = (responders: Record<string, unknown>) => {
  (apiFetch as unknown as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
    const body = responders[url];
    return Promise.resolve({
      ok: body !== undefined,
      json: async () => body,
    });
  });
};

describe("PromptDrawer Phase 2.17", () => {
  beforeEach(() => {
    setPromptIdMock.mockClear();
    (apiFetch as unknown as ReturnType<typeof vi.fn>).mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("点「恢复默认」调 setPromptId(平台 isStarter id)", async () => {
    setupFetch({
      "/prompts?tool=REWRITE_FLUENT": [platformPrompt],
      "/prompts/private": [myPrompt],
    });
    render(<PromptDrawer open={true} onClose={() => {}} />);
    fireEvent.click(screen.getByText("我的"));
    await waitFor(() => screen.getByText("我的副本"));
    fireEvent.click(screen.getByText("恢复默认"));
    expect(setPromptIdMock).toHaveBeenCalledWith("plat-1");
  });

  it("平台无 isStarter → 「恢复默认」 disabled", async () => {
    setupFetch({
      "/prompts?tool=REWRITE_FLUENT": [{ ...platformPrompt, isStarter: false }],
      "/prompts/private": [myPrompt],
    });
    render(<PromptDrawer open={true} onClose={() => {}} />);
    fireEvent.click(screen.getByText("我的"));
    await waitFor(() => screen.getByText("我的副本"));
    expect(screen.getByText("恢复默认")).toBeDisabled();
  });

  it("点「历史 ▾」 拉 snapshots 端点", async () => {
    const snap = {
      id: "s1",
      systemPrompt: "上一版内容",
      designNote: null,
      createdAt: new Date(Date.now() - 60_000).toISOString(),
    };
    setupFetch({
      "/prompts?tool=REWRITE_FLUENT": [platformPrompt],
      "/prompts/private": [myPrompt],
      "/prompts/mine-1/snapshots": [snap],
    });
    render(<PromptDrawer open={true} onClose={() => {}} />);
    fireEvent.click(screen.getByText("我的"));
    await waitFor(() => screen.getByText("我的副本"));
    fireEvent.click(screen.getByText("历史 ▾"));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/prompts/mine-1/snapshots"));
    await waitFor(() => screen.getByText(/上一版内容/));
  });

  it("点「回滚」调 restore 端点", async () => {
    const snap = {
      id: "s1",
      systemPrompt: "上一版内容",
      designNote: null,
      createdAt: new Date(Date.now() - 60_000).toISOString(),
    };
    setupFetch({
      "/prompts?tool=REWRITE_FLUENT": [platformPrompt],
      "/prompts/private": [myPrompt],
      "/prompts/mine-1/snapshots": [snap],
    });
    render(<PromptDrawer open={true} onClose={() => {}} />);
    fireEvent.click(screen.getByText("我的"));
    await waitFor(() => screen.getByText("我的副本"));
    fireEvent.click(screen.getByText("历史 ▾"));
    await waitFor(() => screen.getByText("回滚"));
    fireEvent.click(screen.getByText("回滚"));
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/prompts/mine-1/snapshots/s1/restore", {
        method: "POST",
        body: "{}",
      }),
    );
  });

  it("历史展开后无快照 → 显示空文案", async () => {
    setupFetch({
      "/prompts?tool=REWRITE_FLUENT": [platformPrompt],
      "/prompts/private": [myPrompt],
      "/prompts/mine-1/snapshots": [],
    });
    render(<PromptDrawer open={true} onClose={() => {}} />);
    fireEvent.click(screen.getByText("我的"));
    await waitFor(() => screen.getByText("我的副本"));
    fireEvent.click(screen.getByText("历史 ▾"));
    await waitFor(() => screen.getByText(/暂无历史快照/));
  });
});
```

- [ ] **Step 3: 跑 vitest**

```bash
pnpm --filter @bytedance-aigc/web test -- PromptDrawer
```

Expected: 5 用例 PASS。

- [ ] **Step 4: 跑全量 vitest 确保未误伤**

```bash
pnpm --filter @bytedance-aigc/web test
```

Expected: 全 PASS。

- [ ] **Step 5: Commit**

```bash
unset NODE_OPTIONS && git add apps/web/src/app/drafts/[id]/_components/PromptDrawer.test.tsx && git commit -m "test(web): PromptDrawer 恢复默认 + 历史 + 回滚 5 用例(Phase 2.17 Task 8)

Co-Authored-By: claude-opus-4-7 <noreply@anthropic.com>"
```

---

## Task 9: README 段落 + 归档

**Files:**

- Modify: `README.md`(在 Phase 2.16 段落后添加)
- Move: spec/plan 进 shipped/

- [ ] **Step 1: 看 Phase 2.16 段落锚点**

```bash
grep -n "Phase 2.16" README.md
```

记下 Phase 2.16 段落结尾行号。

- [ ] **Step 2: 在 Phase 2.16 段落后追加 Phase 2.17 段落**

在 `## Phase 2.16` 段落结尾(下一个 `##` 之前)插入:

```markdown
## Phase 2.17 — 作者私人 Prompt「恢复默认」+ 3 快照版本管理

补齐 PRD §3.5.3 极简版本管理:

- 私人 Prompt 每次 PATCH 在事务内自动写一条 snapshot,上限 3 条(超出最旧裁剪)
- 「恢复默认」按钮把当前工具的 active 切回平台 `isStarter` 默认款,不删私人副本
- 「历史 ▾」展开列出最近 3 条快照,每条点「回滚」用快照内容覆盖当前 Prompt(同时把"被回滚前"的状态自动记入新快照)
- 严格不做沙盒、不做 A/B 对照(PRD 明文,复杂能力留给 §4.7.3 平台 Prompt 实验室)

文档:[spec](./docs/superpowers/specs/shipped/2026-06-09-phase-2-17-prompt-restore-and-snapshots-design.md) · [plan](./docs/superpowers/plans/shipped/2026-06-09-phase-2-17-prompt-restore-and-snapshots.md)
```

- [ ] **Step 3: 归档 spec/plan**

```bash
git mv docs/superpowers/specs/2026-06-09-phase-2-17-prompt-restore-and-snapshots-design.md docs/superpowers/specs/shipped/
git mv docs/superpowers/plans/2026-06-09-phase-2-17-prompt-restore-and-snapshots.md docs/superpowers/plans/shipped/
```

- [ ] **Step 4: Commit**

```bash
unset NODE_OPTIONS && git add README.md docs/ && git commit -m "docs: Phase 2.17 README + 归档 spec/plan

Co-Authored-By: claude-opus-4-7 <noreply@anthropic.com>"
```

- [ ] **Step 5: 全量回归**

```bash
pnpm --filter @bytedance-aigc/api typecheck && \
pnpm --filter @bytedance-aigc/api lint && \
pnpm --filter @bytedance-aigc/api test && \
pnpm --filter @bytedance-aigc/api test:e2e && \
pnpm --filter @bytedance-aigc/web typecheck && \
pnpm --filter @bytedance-aigc/web lint && \
pnpm --filter @bytedance-aigc/web test
```

Expected: 全 PASS。
