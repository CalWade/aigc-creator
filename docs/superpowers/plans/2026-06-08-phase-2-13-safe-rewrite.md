# Phase 2.13 一键生成合规替代 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落地 PRD §4.2 中危「一键生成合规替代」工具:在段落审核结果(severity=medium)与发布前安全分(medium 维度)上,提供「侧边对比卡 + 2 候选 SSE 流式生成 + 采纳替换」三态决策,补齐分级响应链路。

**Architecture:** 复用 §3.1.2 ToolCandidateCard 的「文本候选 + 采用/修改/关闭」UI 形态;新增 `POST /reviews/safe-rewrite`(SSE)端点,单连接同帧轨内 `idx: 0` / `idx: 1` 区分两路候选;后端把工具登记成新 DraftToolType `SAFE_REWRITE`,平台保留 Prompt(贴 §4.7),复用 LlmClient.chatStream(`temperature` 一项,错误以 `{error}` 帧而非 Observable.error 表达);前端在 `SectionReviewCard` 的 `severity==='medium'` 分支与 `ScorePanel` 的安全维度行,挂载 `SafeRewriteCard`。

**Tech Stack:** NestJS `@Sse` POST + rxjs Observable / Prisma Prompt + DraftToolUsage(可选记账) / TipTap `editor.commands.insertContentAt` / Vitest + e2e supertest+EventSource / Playwright(交给现有 Phase 2.12 e2e suite,不在本 plan 内新增)。

**Spec → 现实差异(本 plan 已就地修正,实施时严格按本 plan 走,不要回看 spec):**

1. LlmClient.chatStream 仅支持 `temperature`,不支持 `top_p`。两候选用 `temperature: 0.6` / `1.0` 区分。
2. chatStream 错误以 `{error: string}` 帧 + complete 表达,不是 Observable.error;Service 在 mergeMap 中检测 `frame.error` 并向外发 `event: error` 帧。
3. Prompt schema 无 `userPromptTemplate` 字段;user message 在 service 中直接拼,模板放进 `designNote`。
4. `SectionReviewResponse.hitCategories` 已是 `SensitiveCategory[]`(7 类),工具直接消费,不做 6→7 映射。
5. `ScorePanel` 入参 `safety.dimensions[].key` 是 `SafetyKey`(6 类,有 `false_advertising`,无 `fraud`/`medical`)。要从 ScorePanel 触发 SafeRewrite,需要 6→7 映射:`false_advertising → fraud`,其余同名直传。
6. `PromptsService.list` 当前只过滤 `["SAFETY_REVIEW","QUALITY_REVIEW"]`;`copyToPrivate` 同此。Phase 2.13 必须把 `SAFE_REWRITE` 也加进去(平台保留,不暴露 Prompts 列表、不允许复制为私版)。

**Spec 锚点:** `docs/superpowers/specs/2026-06-08-phase-2-13-safe-rewrite-design.md`

---

## File Structure

**Backend (apps/api):**

- Modify: `apps/api/prisma/schema.prisma:44-59` — `DraftToolType` 枚举追加 `SAFE_REWRITE`
- Create: `apps/api/prisma/migrations/<ts>_phase_2_13_safe_rewrite/migration.sql` — Prisma 自动生成
- Modify: `apps/api/prisma/fixtures/prompts.ts` — 追加一条 `SAFE_REWRITE` 平台 Prompt fixture
- Modify: `apps/api/src/prompts/prompts.service.ts` — `list` 与 `copyToPrivate` 把 SAFE_REWRITE 加入屏蔽列表
- Create: `apps/api/src/reviews/safe-rewrite.service.ts` — 单一职责:输入文本+hitCategories → Observable<SafeRewriteFrame>
- Create: `apps/api/src/reviews/safe-rewrite.controller.ts` — `@Sse('safe-rewrite') @Post()`
- Create: `apps/api/src/reviews/dto/safe-rewrite.dto.ts` — class-validator DTO
- Modify: `apps/api/src/reviews/reviews.module.ts` — 注册新 service+controller
- Create: `apps/api/test/safe-rewrite.e2e-spec.ts` — 5 个 e2e
- Create: `apps/api/src/reviews/safe-rewrite.service.spec.ts` — 4 个 unit

**Shared types (packages/shared):**

- Modify: `packages/shared/src/review.ts` — 追加 `SafeRewriteRequest` / `SafeRewriteFrame` 共享 schema
- Modify: `packages/shared/src/draft-tools.ts` — `DRAFT_TOOL_TYPES` 追加 `SAFE_REWRITE`(注:shared 9 项 vs prisma 14 项的偏差是历史既存,Phase 2.13 只在 shared 端补 1 项,不强制对齐 5 个 \*\_REVIEW 项)

**Frontend (apps/web):**

- Create: `apps/web/src/lib/safety-key-map.ts` — 6→7 类映射(false_advertising → fraud)
- Create: `apps/web/src/hooks/use-safe-rewrite.ts` — SSE 客户端 hook
- Create: `apps/web/src/app/drafts/[id]/_components/SafeRewriteCard.tsx` — 侧边对比卡 + 2 候选
- Create: `apps/web/src/app/drafts/[id]/_components/SafeRewriteCard.test.tsx` — 3 个 vitest
- Modify: `apps/web/src/app/drafts/[id]/_components/SectionReviewCard.tsx` — severity=medium 时「修改建议」按钮改为打开 SafeRewriteCard
- Modify: `apps/web/src/app/drafts/[id]/_components/SectionStream.tsx` — 把 SafeRewriteCard 接入 onApplySuggestion 路径
- Modify: `apps/web/src/app/drafts/[id]/_components/ScorePanel.tsx` — 安全维度 medium 行右侧加「合规替代」按钮(回调由父组件提供)
- Modify: `apps/web/src/app/drafts/[id]/_components/PreflightDialog.tsx` — 接住 ScorePanel 的 onSafeRewrite 回调,关闭弹窗 + 跳到工作台并打开横幅(localStorage 桥)
- Modify: `apps/web/src/app/(workspace)/page.tsx` 或对应工作台首页 — 读 localStorage 横幅
- Create: `apps/web/src/app/(workspace)/_components/SafeRewriteHintBanner.tsx` — 横幅
- Modify: `apps/web/README.md` — 静态五连(数据流图、SSE 帧表、UI 状态机、催收链、如何关闭工具)

**Docs:**

- Modify(归档): 完成后 `git mv` spec/plan 到 `docs/superpowers/{specs,plans}/shipped/`(由 T11 处理)

---

## Task 1: Prisma 枚举 + 迁移

**Files:**

- Modify: `apps/api/prisma/schema.prisma:44-59`
- Create: `apps/api/prisma/migrations/<auto-ts>_phase_2_13_safe_rewrite/migration.sql`

- [ ] **Step 1: 修改 schema**

在 `apps/api/prisma/schema.prisma` 第 58 行 `POST_PUBLISH_REVIEW` 之后新加一行:

```prisma
enum DraftToolType {
  REWRITE_FLUENT
  EXPAND
  TRANSFORM_STYLE
  HEADLINE_SUB
  HEADLINE_NEW
  REWRITE_OPENING
  ADD_FACTS
  ADD_TOPIC
  IMAGE_SUGGEST
  SAFETY_REVIEW
  QUALITY_REVIEW
  PROMPT_REVIEW
  SECTION_REVIEW
  POST_PUBLISH_REVIEW
  SAFE_REWRITE
}
```

- [ ] **Step 2: 生成迁移**

Run:

```bash
cd apps/api && pnpm prisma migrate dev --name phase_2_13_safe_rewrite
```

Expected: 在 `apps/api/prisma/migrations/<ts>_phase_2_13_safe_rewrite/migration.sql` 看到 `ALTER TYPE "DraftToolType" ADD VALUE 'SAFE_REWRITE';`,Prisma Client 重新生成,无报错。

- [ ] **Step 3: 启动 dev server 烟测**

Run:

```bash
pnpm --filter @bytedance-aigc/api dev &
sleep 5 && curl -s http://localhost:3001/health && kill %1
```

Expected: `{"status":"ok"}`,无 enum 值缺失错。

- [ ] **Step 4: 提交**

```bash
unset NODE_OPTIONS && git add apps/api/prisma/schema.prisma apps/api/prisma/migrations && git commit -m "feat(api): Phase 2.13 add SAFE_REWRITE DraftToolType + migration"
```

---

## Task 2: 共享 schema

**Files:**

- Modify: `packages/shared/src/draft-tools.ts:8-18`
- Modify: `packages/shared/src/review.ts`(尾部追加)

- [ ] **Step 1: draft-tools 枚举追加**

在 `packages/shared/src/draft-tools.ts` 的 `DRAFT_TOOL_TYPES` 末尾(`IMAGE_SUGGEST` 之后)新增 `"SAFE_REWRITE"`:

```typescript
export const DRAFT_TOOL_TYPES = [
  "REWRITE_FLUENT",
  "EXPAND",
  "TRANSFORM_STYLE",
  "REWRITE_OPENING",
  "HEADLINE_SUB",
  "HEADLINE_NEW",
  "ADD_FACTS",
  "ADD_TOPIC",
  "IMAGE_SUGGEST",
  "SAFE_REWRITE",
] as const;
```

- [ ] **Step 2: review.ts 追加 SafeRewrite schema**

在 `packages/shared/src/review.ts` 末尾追加:

```typescript
/**
 * Phase 2.13 — 一键生成合规替代(§4.2 medium)
 * 端点:POST /reviews/safe-rewrite (SSE)
 * 单连接两路候选,以 idx 区分
 */
export interface SafeRewriteRequest {
  draftId: string;
  text: string;
  hitCategories: SensitiveCategory[];
  message: string; // 段落审核或安全分给出的命中原因,塞 user prompt
}

export type SafeRewriteFrame =
  | { event: "start"; idx: 0 | 1 }
  | { event: "token"; idx: 0 | 1; delta: string }
  | { event: "end"; idx: 0 | 1 }
  | { event: "done" }
  | { event: "error"; idx?: 0 | 1; message: string };
```

- [ ] **Step 3: 构建验证**

Run:

```bash
pnpm --filter @bytedance-aigc/shared build
```

Expected: 输出 `dist/`,无 TS 错。

- [ ] **Step 4: 提交**

```bash
unset NODE_OPTIONS && git add packages/shared/src/draft-tools.ts packages/shared/src/review.ts && git commit -m "feat(shared): Phase 2.13 SafeRewrite request/frame types"
```

---

## Task 3: 平台 Prompt fixture

**Files:**

- Modify: `apps/api/prisma/fixtures/prompts.ts`

- [ ] **Step 1: 追加 SAFE_REWRITE fixture**

在 `apps/api/prisma/fixtures/prompts.ts` 现有数组末尾插入:

```typescript
{
  owner: "PLATFORM",
  tool: "SAFE_REWRITE",
  name: "合规替代生成器",
  systemPrompt: `你是一名内容合规改写助手。给定一段命中风险类目的中文文本,请在保留原作者表达意图的前提下,改写为不命中任何敏感类目的等价表达。

要求:
1. 不要回避主题,要正面改写,长度与原文相当(±20%)。
2. 严禁加入"以下是改写"等元说明,直接输出改写后的段落。
3. 不要使用"小编""个人观点不构成建议"等套话。
4. 输出纯文本,不带 markdown。`,
  params: { temperature: 0.6, topP: 0.9, maxTokens: 600 },
  fewShots: [
    {
      role: "user",
      content: "命中类目: medical\n命中原因: 含未经审批的医疗承诺\n原文: 服用本产品三天即可彻底根治高血压,无任何副作用。",
    },
    {
      role: "assistant",
      content: "本产品作为日常营养补充,不少使用者反馈坚持搭配作息调整后,血压管理更稳定。具体效果因人而异,有基础疾病请遵医嘱。",
    },
  ],
  designNote:
    "user message 模板:`命中类目: {hitCategories}\\n命中原因: {message}\\n原文: {text}`。两路候选靠 temperature=0.6/1.0 区分,平台保留,不进 PromptsService.list。",
  isStarter: true,
},
```

- [ ] **Step 2: 重新 seed**

Run:

```bash
cd apps/api && pnpm prisma db seed
```

Expected: 看到 `SAFE_REWRITE` Prompt 被 upsert,无错。

- [ ] **Step 3: 用 psql 校验**

Run:

```bash
psql "$DATABASE_URL" -c "select tool, name, owner from \"Prompt\" where tool='SAFE_REWRITE';"
```

Expected: 1 行,owner=PLATFORM,name=合规替代生成器。

- [ ] **Step 4: 提交**

```bash
unset NODE_OPTIONS && git add apps/api/prisma/fixtures/prompts.ts && git commit -m "feat(api): Phase 2.13 platform SAFE_REWRITE prompt fixture"
```

---

## Task 4: SafeRewriteService + 单元测试

**Files:**

- Create: `apps/api/src/reviews/safe-rewrite.service.ts`
- Create: `apps/api/src/reviews/safe-rewrite.service.spec.ts`

- [ ] **Step 1: 写 4 个失败测试**

创建 `apps/api/src/reviews/safe-rewrite.service.spec.ts`:

```typescript
import { Test } from "@nestjs/testing";
import { firstValueFrom, toArray } from "rxjs";
import { SafeRewriteService } from "./safe-rewrite.service";
import { LlmClient } from "../llm/llm.client";
import { PromptsService } from "../prompts/prompts.service";
import { of, Subject } from "rxjs";

describe("SafeRewriteService", () => {
  let svc: SafeRewriteService;
  let llm: { chatStream: jest.Mock };
  let prompts: { findDefaultByTool: jest.Mock };

  beforeEach(async () => {
    llm = { chatStream: jest.fn() };
    prompts = {
      findDefaultByTool: jest.fn().mockResolvedValue({
        systemPrompt: "你是合规改写助手",
        params: { temperature: 0.6, topP: 0.9, maxTokens: 600 },
        fewShots: [],
      }),
    };
    const mod = await Test.createTestingModule({
      providers: [
        SafeRewriteService,
        { provide: LlmClient, useValue: llm },
        { provide: PromptsService, useValue: prompts },
      ],
    }).compile();
    svc = mod.get(SafeRewriteService);
  });

  it("两路候选并发(temperature 0.6 / 1.0),按 idx 标注 token 帧", async () => {
    llm.chatStream
      .mockReturnValueOnce(of({ delta: "稳" }, { delta: "妥" }, { done: true }))
      .mockReturnValueOnce(of({ delta: "另" }, { delta: "案" }, { done: true }));
    const frames = await firstValueFrom(
      svc
        .stream({
          draftId: "d1",
          text: "原文",
          hitCategories: ["medical"],
          message: "命中医疗承诺",
        })
        .pipe(toArray()),
    );
    const tokens = frames.filter((f) => f.event === "token");
    expect(
      tokens
        .filter((t) => t.idx === 0)
        .map((t) => t.delta)
        .join(""),
    ).toBe("稳妥");
    expect(
      tokens
        .filter((t) => t.idx === 1)
        .map((t) => t.delta)
        .join(""),
    ).toBe("另案");
    expect(llm.chatStream.mock.calls[0][1]).toEqual({ temperature: 0.6 });
    expect(llm.chatStream.mock.calls[1][1]).toEqual({ temperature: 1.0 });
  });

  it("帧序:start×2 → token… → end×2 → done", async () => {
    llm.chatStream
      .mockReturnValueOnce(of({ delta: "A" }, { done: true }))
      .mockReturnValueOnce(of({ delta: "B" }, { done: true }));
    const frames = await firstValueFrom(
      svc
        .stream({ draftId: "d1", text: "x", hitCategories: ["fraud"], message: "m" })
        .pipe(toArray()),
    );
    const events = frames.map((f) => f.event);
    expect(events.filter((e) => e === "start")).toHaveLength(2);
    expect(events.filter((e) => e === "end")).toHaveLength(2);
    expect(events[events.length - 1]).toBe("done");
  });

  it("一路出错 → 发 error 帧,另一路继续完成,最后仍发 done", async () => {
    llm.chatStream
      .mockReturnValueOnce(of({ error: "rate_limited" }))
      .mockReturnValueOnce(of({ delta: "ok" }, { done: true }));
    const frames = await firstValueFrom(
      svc
        .stream({ draftId: "d1", text: "x", hitCategories: ["fraud"], message: "m" })
        .pipe(toArray()),
    );
    expect(frames.find((f) => f.event === "error" && f.idx === 0)?.message).toBe("rate_limited");
    expect(frames.filter((f) => f.event === "token" && f.idx === 1)).toHaveLength(1);
    expect(frames[frames.length - 1].event).toBe("done");
  });

  it("Prompt fixture 缺失 → 整体 error 帧 + done", async () => {
    prompts.findDefaultByTool.mockResolvedValueOnce(null);
    const frames = await firstValueFrom(
      svc
        .stream({ draftId: "d1", text: "x", hitCategories: ["fraud"], message: "m" })
        .pipe(toArray()),
    );
    expect(frames[0].event).toBe("error");
    expect(frames[frames.length - 1].event).toBe("done");
  });
});
```

- [ ] **Step 2: 运行测试,确认失败**

Run:

```bash
pnpm --filter @bytedance-aigc/api test -- safe-rewrite.service.spec
```

Expected: 4 个 FAIL,提示 `SafeRewriteService` 找不到。

- [ ] **Step 3: 实现 service**

创建 `apps/api/src/reviews/safe-rewrite.service.ts`:

```typescript
import { Injectable } from "@nestjs/common";
import { Observable, defer, from, merge, of, concat, mergeMap, map } from "rxjs";
import type { SensitiveCategory } from "@bytedance-aigc/shared";

import { LlmClient } from "../llm/llm.client";
import { PromptsService } from "../prompts/prompts.service";

interface StreamInput {
  draftId: string;
  text: string;
  hitCategories: SensitiveCategory[];
  message: string;
}

type Frame =
  | { event: "start"; idx: 0 | 1 }
  | { event: "token"; idx: 0 | 1; delta: string }
  | { event: "end"; idx: 0 | 1 }
  | { event: "done" }
  | { event: "error"; idx?: 0 | 1; message: string };

@Injectable()
export class SafeRewriteService {
  constructor(
    private readonly llm: LlmClient,
    private readonly prompts: PromptsService,
  ) {}

  stream(input: StreamInput): Observable<Frame> {
    return defer(() =>
      from(this.prompts.findDefaultByTool("SAFE_REWRITE")).pipe(
        mergeMap((prompt) => {
          if (!prompt) {
            return concat(
              of<Frame>({ event: "error", message: "SAFE_REWRITE prompt not configured" }),
              of<Frame>({ event: "done" }),
            );
          }
          const userMsg = `命中类目: ${input.hitCategories.join(",")}\n命中原因: ${input.message}\n原文: ${input.text}`;
          const messages = [
            { role: "system" as const, content: prompt.systemPrompt },
            ...((prompt.fewShots ?? []) as { role: "user" | "assistant"; content: string }[]),
            { role: "user" as const, content: userMsg },
          ];
          const route = (idx: 0 | 1, temperature: number): Observable<Frame> =>
            concat(
              of<Frame>({ event: "start", idx }),
              this.llm.chatStream(messages, { temperature }).pipe(
                map((f): Frame | null => {
                  if (f.error) return { event: "error", idx, message: f.error };
                  if (f.delta) return { event: "token", idx, delta: f.delta };
                  if (f.done) return { event: "end", idx };
                  return null;
                }),
                mergeMap((f) => (f ? of(f) : of())),
              ),
            );
          return concat(merge(route(0, 0.6), route(1, 1.0)), of<Frame>({ event: "done" }));
        }),
      ),
    );
  }
}
```

- [ ] **Step 4: 跑测试,确认通过**

Run:

```bash
pnpm --filter @bytedance-aigc/api test -- safe-rewrite.service.spec
```

Expected: 4 个 PASS。

- [ ] **Step 5: 提交**

```bash
unset NODE_OPTIONS && git add apps/api/src/reviews/safe-rewrite.service.ts apps/api/src/reviews/safe-rewrite.service.spec.ts && git commit -m "feat(api): Phase 2.13 SafeRewriteService + unit tests"
```

---

## Task 5: SafeRewriteController + DTO + e2e

**Files:**

- Create: `apps/api/src/reviews/dto/safe-rewrite.dto.ts`
- Create: `apps/api/src/reviews/safe-rewrite.controller.ts`
- Modify: `apps/api/src/reviews/reviews.module.ts`
- Create: `apps/api/test/safe-rewrite.e2e-spec.ts`

- [ ] **Step 1: 写 DTO**

创建 `apps/api/src/reviews/dto/safe-rewrite.dto.ts`:

```typescript
import { IsArray, IsIn, IsString, MaxLength, MinLength } from "class-validator";
import { SENSITIVE_CATEGORIES, type SensitiveCategory } from "@bytedance-aigc/shared";

export class SafeRewriteDto {
  @IsString()
  @MinLength(1)
  draftId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  text!: string;

  @IsArray()
  @IsIn(SENSITIVE_CATEGORIES, { each: true })
  hitCategories!: SensitiveCategory[];

  @IsString()
  @MaxLength(500)
  message!: string;
}
```

- [ ] **Step 2: 写 5 个 e2e**

创建 `apps/api/test/safe-rewrite.e2e-spec.ts`:

```typescript
import { Test } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { LlmClient } from "../src/llm/llm.client";
import { of } from "rxjs";

describe("/reviews/safe-rewrite (SSE)", () => {
  let app: INestApplication;
  let token: string;

  beforeAll(async () => {
    const llmMock = {
      chatStream: jest.fn(() => of({ delta: "改" }, { delta: "写" }, { done: true })),
    };
    const mod = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(LlmClient)
      .useValue(llmMock)
      .compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    // 复用现有 e2e helper 注入登录 token,这里假设有 helper:
    token = await getTestUserToken(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it("401 未登录", async () => {
    await request(app.getHttpServer())
      .post("/reviews/safe-rewrite")
      .send({ draftId: "d1", text: "x", hitCategories: ["fraud"], message: "m" })
      .expect(401);
  });

  it("400 hitCategories 含非法值", async () => {
    await request(app.getHttpServer())
      .post("/reviews/safe-rewrite")
      .set("Authorization", `Bearer ${token}`)
      .send({ draftId: "d1", text: "x", hitCategories: ["unknown"], message: "m" })
      .expect(400);
  });

  it("400 text 超长(>2000)", async () => {
    await request(app.getHttpServer())
      .post("/reviews/safe-rewrite")
      .set("Authorization", `Bearer ${token}`)
      .send({ draftId: "d1", text: "x".repeat(2001), hitCategories: ["fraud"], message: "m" })
      .expect(400);
  });

  it("200 SSE 头与帧序", async () => {
    const res = await request(app.getHttpServer())
      .post("/reviews/safe-rewrite")
      .set("Authorization", `Bearer ${token}`)
      .send({ draftId: "d1", text: "原文", hitCategories: ["fraud"], message: "命中欺诈" })
      .expect(200);
    expect(res.headers["content-type"]).toMatch(/text\/event-stream/);
    expect(res.text).toContain('"event":"start"');
    expect(res.text).toContain('"idx":0');
    expect(res.text).toContain('"idx":1');
    expect(res.text).toContain('"event":"done"');
  });

  it("200 不会写 Review 行(本端点不入库)", async () => {
    const before = await prismaCount(app, "Review");
    await request(app.getHttpServer())
      .post("/reviews/safe-rewrite")
      .set("Authorization", `Bearer ${token}`)
      .send({ draftId: "d1", text: "原文", hitCategories: ["fraud"], message: "m" })
      .expect(200);
    const after = await prismaCount(app, "Review");
    expect(after).toBe(before);
  });
});

// helper 占位:实际实现复用 apps/api/test/helpers.ts 的 getTestUserToken / prisma client
declare function getTestUserToken(app: INestApplication): Promise<string>;
declare function prismaCount(app: INestApplication, table: string): Promise<number>;
```

> 注:实际实现时把 `getTestUserToken` 和 `prismaCount` 替换成 `apps/api/test/` 下既有 helper(参考 `preflight.e2e-spec.ts` 的 setup)。

- [ ] **Step 3: 跑 e2e,确认失败**

Run:

```bash
pnpm --filter @bytedance-aigc/api test:e2e -- safe-rewrite
```

Expected: 5 个 FAIL,提示路由不存在。

- [ ] **Step 4: 写 controller**

创建 `apps/api/src/reviews/safe-rewrite.controller.ts`:

```typescript
import { Body, Controller, HttpCode, HttpStatus, Post, Sse, UseGuards } from "@nestjs/common";
import { Observable, map } from "rxjs";
import { UserGuard } from "../auth/user.guard";
import { SafeRewriteService } from "./safe-rewrite.service";
import { SafeRewriteDto } from "./dto/safe-rewrite.dto";

@Controller("reviews")
@UseGuards(UserGuard)
export class SafeRewriteController {
  constructor(private readonly svc: SafeRewriteService) {}

  @Post("safe-rewrite")
  @Sse()
  @HttpCode(HttpStatus.OK)
  stream(@Body() dto: SafeRewriteDto): Observable<{ data: string; event?: string }> {
    return this.svc.stream(dto).pipe(
      map((frame) => ({
        event: frame.event,
        data: JSON.stringify(frame),
      })),
    );
  }
}
```

> UserGuard 路径若与既有不一致,参考 `reviews-action.controller.ts` 的 import 即可。

- [ ] **Step 5: 注册到模块**

修改 `apps/api/src/reviews/reviews.module.ts`,在 `controllers` 数组追加 `SafeRewriteController`,在 `providers` 追加 `SafeRewriteService`。

- [ ] **Step 6: 跑 e2e,确认通过**

Run:

```bash
pnpm --filter @bytedance-aigc/api test:e2e -- safe-rewrite
```

Expected: 5 个 PASS。

- [ ] **Step 7: 提交**

```bash
unset NODE_OPTIONS && git add apps/api/src/reviews && git commit -m "feat(api): Phase 2.13 POST /reviews/safe-rewrite SSE endpoint + e2e"
```

---

## Task 6: SafeRewriteCard + 3 vitest

**Files:**

- Create: `apps/web/src/lib/safety-key-map.ts`
- Create: `apps/web/src/hooks/use-safe-rewrite.ts`
- Create: `apps/web/src/app/drafts/[id]/_components/SafeRewriteCard.tsx`
- Create: `apps/web/src/app/drafts/[id]/_components/SafeRewriteCard.test.tsx`

- [ ] **Step 1: 6→7 类映射**

创建 `apps/web/src/lib/safety-key-map.ts`:

```typescript
import type { SafetyKey, SensitiveCategory } from "@bytedance-aigc/shared";

/**
 * Phase 2.3 ScorePanel 的 6 类 SafetyKey ↔ Phase 2.5 段落审核的 7 类 SensitiveCategory。
 * 仅 false_advertising → fraud 不同名;其余同名直传。
 * 不存在反向(7→6)需求;若日后 medical 要在 ScorePanel 露出,再扩 SafetyKey。
 */
export function safetyKeyToSensitiveCategory(k: SafetyKey): SensitiveCategory {
  if (k === "false_advertising") return "fraud";
  return k as SensitiveCategory;
}
```

- [ ] **Step 2: SSE hook**

创建 `apps/web/src/hooks/use-safe-rewrite.ts`:

```typescript
"use client";

import { useCallback, useRef, useState } from "react";
import type { SafeRewriteFrame, SafeRewriteRequest } from "@bytedance-aigc/shared";
import { streamFetch } from "@/lib/sse";

export interface SafeRewriteState {
  candidates: [string, string]; // idx 0 / 1 累积文本
  status: ["pending" | "streaming" | "done" | "error", "pending" | "streaming" | "done" | "error"];
  error: string | null;
  start: (req: SafeRewriteRequest) => Promise<void>;
  abort: () => void;
}

export function useSafeRewrite(): SafeRewriteState {
  const [candidates, setCandidates] = useState<[string, string]>(["", ""]);
  const [status, setStatus] = useState<SafeRewriteState["status"]>(["pending", "pending"]);
  const [error, setError] = useState<string | null>(null);
  const ctrl = useRef<AbortController | null>(null);

  const start = useCallback(async (req: SafeRewriteRequest) => {
    setCandidates(["", ""]);
    setStatus(["streaming", "streaming"]);
    setError(null);
    ctrl.current = new AbortController();
    try {
      for await (const frame of streamFetch({
        path: "/reviews/safe-rewrite",
        body: req,
        signal: ctrl.current.signal,
      })) {
        const f = JSON.parse(frame.data) as SafeRewriteFrame;
        if (f.event === "token") {
          setCandidates((prev) => {
            const next: [string, string] = [prev[0], prev[1]];
            next[f.idx] = next[f.idx] + f.delta;
            return next;
          });
        } else if (f.event === "end") {
          setStatus((prev) => {
            const next: SafeRewriteState["status"] = [prev[0], prev[1]];
            next[f.idx] = "done";
            return next;
          });
        } else if (f.event === "error") {
          if (f.idx !== undefined) {
            setStatus((prev) => {
              const next: SafeRewriteState["status"] = [prev[0], prev[1]];
              next[f.idx as 0 | 1] = "error";
              return next;
            });
          } else {
            setError(f.message);
            setStatus(["error", "error"]);
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "stream failed");
      setStatus(["error", "error"]);
    }
  }, []);

  const abort = useCallback(() => {
    ctrl.current?.abort();
  }, []);

  return { candidates, status, error, start, abort };
}
```

- [ ] **Step 3: 写 3 个失败测试**

创建 `apps/web/src/app/drafts/[id]/_components/SafeRewriteCard.test.tsx`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SafeRewriteCard } from "./SafeRewriteCard";

vi.mock("@/hooks/use-safe-rewrite", () => ({
  useSafeRewrite: () => ({
    candidates: ["稳妥版本", "另一版本"],
    status: ["done", "done"],
    error: null,
    start: vi.fn(),
    abort: vi.fn(),
  }),
}));

describe("SafeRewriteCard", () => {
  const baseProps = {
    open: true,
    request: {
      draftId: "d1",
      text: "原文",
      hitCategories: ["fraud" as const],
      message: "命中欺诈",
    },
    onAdopt: vi.fn(),
    onClose: vi.fn(),
  };

  it("打开时渲染两路候选", () => {
    render(<SafeRewriteCard {...baseProps} />);
    expect(screen.getByText("稳妥版本")).toBeInTheDocument();
    expect(screen.getByText("另一版本")).toBeInTheDocument();
  });

  it("点击采用 → 触发 onAdopt(候选文本) 并 close", () => {
    const onAdopt = vi.fn();
    const onClose = vi.fn();
    render(<SafeRewriteCard {...baseProps} onAdopt={onAdopt} onClose={onClose} />);
    fireEvent.click(screen.getAllByRole("button", { name: "采用" })[0]);
    expect(onAdopt).toHaveBeenCalledWith("稳妥版本");
    expect(onClose).toHaveBeenCalled();
  });

  it("点击关闭 → onClose,不 onAdopt", () => {
    const onAdopt = vi.fn();
    const onClose = vi.fn();
    render(<SafeRewriteCard {...baseProps} onAdopt={onAdopt} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    expect(onClose).toHaveBeenCalled();
    expect(onAdopt).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: 跑测试确认失败**

Run:

```bash
pnpm --filter @bytedance-aigc/web test -- SafeRewriteCard
```

Expected: 3 个 FAIL(组件不存在)。

- [ ] **Step 5: 写组件**

创建 `apps/web/src/app/drafts/[id]/_components/SafeRewriteCard.tsx`:

```tsx
"use client";

import { useEffect } from "react";
import type { SafeRewriteRequest } from "@bytedance-aigc/shared";
import { useSafeRewrite } from "@/hooks/use-safe-rewrite";

interface Props {
  open: boolean;
  request: SafeRewriteRequest;
  onAdopt: (text: string) => void;
  onClose: () => void;
}

/**
 * Phase 2.13 一键合规替代:侧边对比卡 + 2 候选 SSE 流式。
 * 父组件控制 open;打开瞬间触发 start,关闭瞬间 abort。
 */
export function SafeRewriteCard({ open, request, onAdopt, onClose }: Props) {
  const { candidates, status, error, start, abort } = useSafeRewrite();

  useEffect(() => {
    if (!open) return;
    void start(request);
    return () => abort();
    // request 在父组件内随 medium 命中固定;依赖刻意省略让 effect 只跑一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/40 shadow-lg p-3 mt-2 max-w-md">
      <header className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold">合规替代候选</h3>
        <button type="button" onClick={onClose} className="text-xs text-zinc-500">
          关闭
        </button>
      </header>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <ul className="flex flex-col gap-2">
        {[0, 1].map((idx) => (
          <li
            key={idx}
            className="rounded border border-zinc-200 dark:border-zinc-800 p-2 flex flex-col gap-1.5 bg-white dark:bg-zinc-950"
          >
            <p className="text-sm whitespace-pre-wrap min-h-[2.5em]">
              {candidates[idx] || (status[idx] === "streaming" ? "生成中…" : "—")}
            </p>
            <div className="flex justify-end">
              <button
                type="button"
                disabled={status[idx] !== "done" || !candidates[idx]}
                onClick={() => {
                  onAdopt(candidates[idx]);
                  onClose();
                }}
                className="text-xs rounded bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 px-2 py-1 disabled:opacity-50"
              >
                采用
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 6: 跑测试,确认通过**

Run:

```bash
pnpm --filter @bytedance-aigc/web test -- SafeRewriteCard
```

Expected: 3 个 PASS。

- [ ] **Step 7: 提交**

```bash
unset NODE_OPTIONS && git add apps/web/src/lib/safety-key-map.ts apps/web/src/hooks/use-safe-rewrite.ts apps/web/src/app/drafts/\[id\]/_components/SafeRewriteCard.tsx apps/web/src/app/drafts/\[id\]/_components/SafeRewriteCard.test.tsx && git commit -m "feat(web): Phase 2.13 SafeRewriteCard + use-safe-rewrite hook"
```

---

## Task 7: SectionReviewCard 接入 SafeRewriteCard

**Files:**

- Modify: `apps/web/src/app/drafts/[id]/_components/SectionReviewCard.tsx`
- Modify: `apps/web/src/app/drafts/[id]/_components/SectionStream.tsx`

**目的:** medium 命中时,「修改建议」按钮改为切到 SafeRewriteCard 模式;high 命中时保持原行为。

- [ ] **Step 1: 改 SectionReviewCard**

修改 `apps/web/src/app/drafts/[id]/_components/SectionReviewCard.tsx`,把内部本地的 `useState` 加进来,severity=medium 时点「修改建议」切 SafeRewriteCard 视图:

```tsx
"use client";

import { useState } from "react";
import type { SectionReviewItem } from "@/hooks/use-section-review";
import { SafeRewriteCard } from "./SafeRewriteCard";

interface Props {
  item: SectionReviewItem;
  draftId: string;
  text: string; // 父组件给段落原文(范围内)
  onRegenerate: (heading: string) => void;
  onApplySuggestion: (heading: string, suggestion: string) => void;
  onKeep: (heading: string) => void;
}

export function SectionReviewCard({
  item,
  draftId,
  text,
  onRegenerate,
  onApplySuggestion,
  onKeep,
}: Props) {
  const [rewriteOpen, setRewriteOpen] = useState(false);
  const tone =
    item.result.severity === "high"
      ? "border-red-500 bg-red-50 dark:bg-red-950/40"
      : "border-amber-500 bg-amber-50 dark:bg-amber-950/40";

  const isMedium = item.result.severity === "medium";

  return (
    <div className={`mt-2 rounded border-l-4 px-3 py-2 text-sm ${tone}`}>
      <div className="font-medium">段落风险:{item.result.message}</div>
      {item.result.hitCategories.length > 0 && (
        <div className="text-xs opacity-75 mt-0.5">涉及:{item.result.hitCategories.join("、")}</div>
      )}
      <div className="mt-1 flex gap-2">
        <button
          type="button"
          className="text-xs rounded border border-current px-2 py-0.5"
          onClick={() => onRegenerate(item.heading)}
        >
          重新生成
        </button>
        <button
          type="button"
          className="text-xs rounded px-2 py-0.5"
          onClick={() => {
            if (isMedium) {
              setRewriteOpen(true);
            } else {
              onApplySuggestion(item.heading, item.result.message);
            }
          }}
        >
          {isMedium ? "合规替代" : "修改建议"}
        </button>
        <button
          type="button"
          className="text-xs rounded px-2 py-0.5 opacity-75"
          onClick={() => onKeep(item.heading)}
        >
          仍要保留
        </button>
      </div>
      <SafeRewriteCard
        open={rewriteOpen}
        request={{
          draftId,
          text,
          hitCategories: item.result.hitCategories,
          message: item.result.message,
        }}
        onAdopt={(t) => {
          onApplySuggestion(item.heading, t);
        }}
        onClose={() => setRewriteOpen(false)}
      />
    </div>
  );
}
```

- [ ] **Step 2: 改 SectionStream 调用方**

修改 `apps/web/src/app/drafts/[id]/_components/SectionStream.tsx` 第 142 行附近,把 `text` 和 `draftId` 传给 SectionReviewCard:

```tsx
{review.items.map((item, idx) => (
  <SectionReviewCard
    key={`${item.range.from}-${item.range.to}-${idx}`}
    item={item}
    draftId={draftId}
    text={editor?.state.doc.textBetween(item.range.from, item.range.to, "\n") ?? ""}
    onRegenerate={...}
    onApplySuggestion={...}
    onKeep={...}
  />
))}
```

- [ ] **Step 3: 跑既有 SectionReviewCard 测试,修复回归**

Run:

```bash
pnpm --filter @bytedance-aigc/web test -- SectionReviewCard
```

Expected: 既有 vitest 全过(可能需要在 mock 里补 `draftId` / `text` props)。

- [ ] **Step 4: 提交**

```bash
unset NODE_OPTIONS && git add apps/web/src/app/drafts/\[id\]/_components/SectionReviewCard.tsx apps/web/src/app/drafts/\[id\]/_components/SectionStream.tsx apps/web/src/app/drafts/\[id\]/_components/SectionReviewCard.test.tsx && git commit -m "feat(web): Phase 2.13 SectionReviewCard 接 SafeRewriteCard"
```

---

## Task 8: ScorePanel + PreflightDialog 集成

**Files:**

- Modify: `apps/web/src/app/drafts/[id]/_components/ScorePanel.tsx`
- Modify: `apps/web/src/app/drafts/[id]/_components/PreflightDialog.tsx`

**目的:** ScorePanel 的安全分维度行,severity=medium 时右侧加「合规替代」按钮;PreflightDialog 接住回调,关闭弹窗 + 写 localStorage 横幅 + 跳工作台。

- [ ] **Step 1: ScorePanel 加 onSafeRewrite 回调**

修改 `apps/web/src/app/drafts/[id]/_components/ScorePanel.tsx`,签名追加 `onSafeRewrite?: (key: SafetyKey) => void`,在 safety dimensions map 内 medium 行右边加按钮:

```tsx
{
  safety.dimensions.map((d) => (
    <li key={d.key} className="flex items-center justify-between">
      <span>
        {SAFETY_LABEL[d.key] ?? d.key} · {d.severity}
      </span>
      <span className="flex items-center gap-2">
        <span>{d.score}</span>
        {d.severity === "medium" && onSafeRewrite && (
          <button
            type="button"
            onClick={() => onSafeRewrite(d.key)}
            className="text-xs rounded border border-amber-500 text-amber-700 px-1.5 py-0.5"
          >
            合规替代
          </button>
        )}
      </span>
    </li>
  ));
}
```

- [ ] **Step 2: PreflightDialog 接住**

修改 `apps/web/src/app/drafts/[id]/_components/PreflightDialog.tsx`,给 ScorePanel 传 `onSafeRewrite`。回调动作:

1. 关闭 dialog
2. 写 `localStorage.setItem("safeRewriteHint", JSON.stringify({ draftId, key, ts: Date.now() }))`
3. `router.push('/')`(工作台)

```tsx
import { safetyKeyToSensitiveCategory } from "@/lib/safety-key-map";

// ... 在组件内:
<ScorePanel
  safety={data.review.safety}
  quality={data.review.quality}
  onQualityDimensionClick={(key) => {
    router.push(`/drafts/${draftId}?qualityDimension=${key}`);
    onClose();
  }}
  onSafeRewrite={(key) => {
    const cat = safetyKeyToSensitiveCategory(key);
    localStorage.setItem(
      "safeRewriteHint",
      JSON.stringify({ draftId, category: cat, ts: Date.now() }),
    );
    onClose();
    router.push("/");
  }}
/>;
```

- [ ] **Step 3: 跑构建,确认 TS 通过**

Run:

```bash
pnpm --filter @bytedance-aigc/web typecheck
```

Expected: 0 错。

- [ ] **Step 4: 提交**

```bash
unset NODE_OPTIONS && git add apps/web/src/app/drafts/\[id\]/_components/ScorePanel.tsx apps/web/src/app/drafts/\[id\]/_components/PreflightDialog.tsx && git commit -m "feat(web): Phase 2.13 ScorePanel medium → 触发 SafeRewrite + localStorage 横幅"
```

---

## Task 9: 工作台横幅

**Files:**

- Create: `apps/web/src/app/(workspace)/_components/SafeRewriteHintBanner.tsx`
- Modify: 工作台首页(读 localStorage 并渲染横幅);具体路径以 `apps/web/src/app/page.tsx` 或 `(workspace)/page.tsx` 为准,实施时先 `Glob "apps/web/src/app/**/page.tsx"` 找第一屏

- [ ] **Step 1: 写横幅组件**

创建 `apps/web/src/app/(workspace)/_components/SafeRewriteHintBanner.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Hint {
  draftId: string;
  category: string;
  ts: number;
}

export function SafeRewriteHintBanner() {
  const [hint, setHint] = useState<Hint | null>(null);

  useEffect(() => {
    const raw = localStorage.getItem("safeRewriteHint");
    if (!raw) return;
    try {
      const h = JSON.parse(raw) as Hint;
      // 30 分钟内有效
      if (Date.now() - h.ts < 30 * 60 * 1000) setHint(h);
    } catch {
      /* noop */
    }
  }, []);

  if (!hint) return null;

  const dismiss = () => {
    localStorage.removeItem("safeRewriteHint");
    setHint(null);
  };

  return (
    <div className="rounded border border-amber-400 bg-amber-50 px-3 py-2 mb-4 flex items-center justify-between text-sm">
      <span>
        发布前审核检测到「{hint.category}」类风险,可在草稿内段落使用「合规替代」工具改写。
      </span>
      <span className="flex gap-2">
        <Link
          href={`/drafts/${hint.draftId}`}
          className="rounded bg-amber-600 text-white text-xs px-2 py-1"
          onClick={dismiss}
        >
          回到草稿
        </Link>
        <button type="button" onClick={dismiss} className="text-xs text-zinc-500">
          关闭
        </button>
      </span>
    </div>
  );
}
```

- [ ] **Step 2: 挂到工作台首屏**

定位首屏文件:

```bash
find apps/web/src/app -maxdepth 4 -name "page.tsx" | head -10
```

在工作台首屏 `<main>` 顶部插入 `<SafeRewriteHintBanner />`。

- [ ] **Step 3: 手测 e2e 链路**

Run dev:

```bash
pnpm dev
```

手动:进入草稿 → 触发预检(造一段含 medium 命中的文本)→ 点 medium 维度行的「合规替代」 → 应跳到工作台并显示横幅 → 点「回到草稿」回到草稿。

- [ ] **Step 4: 提交**

```bash
unset NODE_OPTIONS && git add apps/web/src/app && git commit -m "feat(web): Phase 2.13 工作台 SafeRewriteHintBanner 接住预检触发"
```

---

## Task 10: PromptsService 屏蔽 + README 静态五连

**Files:**

- Modify: `apps/api/src/prompts/prompts.service.ts:23` 和 `:97`(具体行号实施时确认)
- Modify: `apps/web/README.md`

- [ ] **Step 1: 屏蔽 SAFE_REWRITE**

修改 `apps/api/src/prompts/prompts.service.ts`,把 `["SAFETY_REVIEW", "QUALITY_REVIEW"]` 全部替换为 `["SAFETY_REVIEW", "QUALITY_REVIEW", "PROMPT_REVIEW", "SECTION_REVIEW", "POST_PUBLISH_REVIEW", "SAFE_REWRITE"]`(平台保留型工具一律不进 list、不允许 copyToPrivate)。

> 说明:既有代码只屏蔽了 2 项,Phase 2.13 顺便把所有平台保留 _\_REVIEW 也一并屏蔽,符合 §4.7 平台保留 Prompt 的设计意图。如不希望牵连其他 _\_REVIEW 项,只在数组里加 `"SAFE_REWRITE"`。**默认按最小变更走,只加 SAFE_REWRITE。** 如发现既有 e2e 已经依赖 \*\_REVIEW 不被屏蔽,严格只加 SAFE_REWRITE。

实施时:

```bash
grep -n "SAFETY_REVIEW.*QUALITY_REVIEW" apps/api/src/prompts/prompts.service.ts
```

拿到精确行号,把 `["SAFETY_REVIEW", "QUALITY_REVIEW"]` 改成 `["SAFETY_REVIEW", "QUALITY_REVIEW", "SAFE_REWRITE"]`。两处都改。

- [ ] **Step 2: 跑既有 prompts e2e**

Run:

```bash
pnpm --filter @bytedance-aigc/api test:e2e -- prompts
```

Expected: 既有 PASS,新增对 SAFE_REWRITE 的屏蔽不破坏现有断言。如有 PromptsService 自带 unit test,补一条:

```typescript
it("list 不返回 SAFE_REWRITE", async () => {
  const all = await svc.list({ owner: "PLATFORM" });
  expect(all.find((p) => p.tool === "SAFE_REWRITE")).toBeUndefined();
});
```

- [ ] **Step 3: 写 README 五连**

在 `apps/web/README.md` 找到 Phase 2.x 一节,追加 Phase 2.13 章节。**五连必含:**

1. **数据流图**:`SectionReviewCard(medium) | ScorePanel(medium dim) → POST /reviews/safe-rewrite (SSE) → SafeRewriteService.stream → LlmClient.chatStream ×2 (T=0.6/1.0) → 帧 idx 0|1 合并 → SafeRewriteCard 累积渲染 → onAdopt → editor.insertContentAt`
2. **SSE 帧表**:列 start / token / end / done / error 五种 + idx 字段含义
3. **UI 状态机**:候选行 `pending → streaming → done | error`,采用按钮 `disabled` 直到 `done && candidate.length > 0`
4. **催收链**:段落审核(SectionStream)medium → 段内浮卡;预检(PreflightDialog)medium → localStorage 横幅 → 工作台 → 回草稿;两条催收路径共用 SafeRewriteCard
5. **如何关闭工具**:删 fixture 中 SAFE_REWRITE Prompt → service 端发 `event:error message:"SAFE_REWRITE prompt not configured"` → 前端横幅红字,但页面其他流程不挂

- [ ] **Step 4: 提交**

```bash
unset NODE_OPTIONS && git add apps/api/src/prompts apps/web/README.md && git commit -m "feat(api,web): Phase 2.13 屏蔽 SAFE_REWRITE Prompt + README 静态五连"
```

---

## Task 11: 归档 spec/plan

**Files:**

- Move: `docs/superpowers/specs/2026-06-08-phase-2-13-safe-rewrite-design.md` → `docs/superpowers/specs/shipped/`
- Move: `docs/superpowers/plans/2026-06-08-phase-2-13-safe-rewrite.md` → `docs/superpowers/plans/shipped/`

- [ ] **Step 1: git mv 归档**

```bash
git mv docs/superpowers/specs/2026-06-08-phase-2-13-safe-rewrite-design.md docs/superpowers/specs/shipped/
git mv docs/superpowers/plans/2026-06-08-phase-2-13-safe-rewrite.md docs/superpowers/plans/shipped/
```

- [ ] **Step 2: 跑全量 typecheck + lint + test**

Run:

```bash
pnpm typecheck && pnpm lint && pnpm --filter @bytedance-aigc/api test && pnpm --filter @bytedance-aigc/web test
```

Expected: 全绿。

- [ ] **Step 3: 提交**

```bash
unset NODE_OPTIONS && git add -A && git commit -m "chore(docs): 归档 Phase 2.13 spec/plan 到 shipped/"
```

---

## Self-Review

**1. Spec coverage:**

- §4.2 medium 一键合规替代 → T1-T8 ✅
- 段落审核 + 发布前审核两处接入 → T7 / T8 ✅
- 侧边对比卡 + 2 候选 → T6 SafeRewriteCard ✅
- 流式 SSE → T4-T5 service+controller ✅
- 平台保留 Prompt → T3 fixture + T10 屏蔽 ✅
- 触发由 severity=medium → T7 / T8 ✅

**2. Placeholder scan:** 检查每一步都给出了实际代码或精确命令,helper 占位(getTestUserToken)已显式说明用既有 test/helpers,不算 TODO;workspace 首屏路径让实施者实施时 Glob 定位,代价小但避免猜路径出错。✅

**3. Type consistency:**

- `SafeRewriteFrame.idx` 在 shared / service / hook / card 全部一致是 `0 | 1` ✅
- `hitCategories: SensitiveCategory[]` 全链路一致(请求→service→llm prompt→渲染),不混 SafetyKey ✅
- `safetyKeyToSensitiveCategory` 仅在 PreflightDialog→localStorage 一处用,SafeRewriteCard 入参直接是 SensitiveCategory[],无来回转换 ✅
- chatStream 仅 `temperature`(0.6 / 1.0),无 top_p ✅
- 错误以 `{error}` 帧 → `event: error` 帧,无 Observable.error ✅

**4. 已知风险/留白:**

- `apps/api/test/safe-rewrite.e2e-spec.ts` 中的 helper 占位需要替换为既有 `apps/api/test/helpers.ts` 真实导出。实施时第一步先 Glob 确认 helper 文件名/导出名。
- T9 工作台首屏路径未硬编码,实施时 Glob 定位。

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-06-08-phase-2-13-safe-rewrite.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — 每个 Task 派一名新 subagent,task 之间过两阶段 review,迭代快、上下文独立。

**2. Inline Execution** — 在本会话用 executing-plans 直接执行,checkpoint 多但占主上下文。

**Which approach?**
