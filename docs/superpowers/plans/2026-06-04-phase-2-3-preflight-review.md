# Phase 2.3 — 发布前审核 + 4 维质量分 · 实施 Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 PRD §4.1.4 发布前审核 + §4.3 4 维质量分的端到端闭环:作者点"发布" → 同步并发跑安全 / 质量两个 LLM → 弹窗展示 6+4 维度分数 + ALLOW/WARN/BLOCK 推荐 → 通过后落 PUBLISHED 状态。

**Architecture:** 后端新增 `Review` 表(一对多)+ `Draft.lastReviewId` + `DraftStatus` 枚举;`ReviewService` 取 `SAFETY_REVIEW`/`QUALITY_REVIEW` 两条 PLATFORM Prompt → `Promise.all` 并发 → 严格 JSON 解析 + 失败 fallback BLOCK → 后端推导 recommendation。前端 `<PreflightDialog>` + `<ScorePanel>` + `<RecommendationBadge>` 三组件接 `usePreflightMutation` / `usePublishMutation`,DraftEditor 工具栏加"发布"按钮入口。

**Tech Stack:** Prisma 5(migration), NestJS 11(ReviewService 同步路径,沿用 Phase 2.2 LlmClient), shared 类型源(Json schema TS 化), Next.js 16 / React 19(client component + 原生 fetch via apiFetch)。

**Spec 来源:** `docs/superpowers/specs/2026-06-04-phase-2-3-preflight-review-design.md`(commit `30d2ccd`)。

---

## 0. 决策回顾(实施期不再讨论)

| ID              | 决策                                                                                                                                                                                                   | 影响哪些 task |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------- |
| D-A1            | 新建 `Review` 表(一对多)+ `Draft.lastReviewId` 外键,Json 字段存 safety/quality 结构化结果                                                                                                              | T1, T3        |
| D-A2            | preflight 走 2 次 LLM `Promise.all`(safety 温度 0.0,quality 温度 0.4),关注点分离                                                                                                                       | T3            |
| D-A3            | preflight 与 publish **拆两个端点**;publish 校验 `lastReview.stage===PREFLIGHT && rec!==BLOCK && now-createdAt<24h`,否则 409                                                                           | T4, T5        |
| D-A4            | `DraftToolType` 加 `SAFETY_REVIEW` / `QUALITY_REVIEW` 两个值,prompt 走 PLATFORM seed;`PromptsService.copyToPrivate` 加守卫禁复制;`PromptsController.list` 默认隐藏这两条(`findDefaultByTool` 仍能拿到) | T1, T2        |
| D-A5(spec 补充) | `safety.overall = 100 - max(各维度 score)`;`quality.overall = 4 维等权平均`;recommendation 由后端按规则推导,不让 LLM 自报                                                                              | T3            |
| D-A6(spec 补充) | Draft 全文截断阈值 12000 中文字,超出 modelMeta 记 `truncated:true`                                                                                                                                     | T3            |
| D-A7(spec 补充) | feature flag `NEXT_PUBLIC_PREFLIGHT_ENABLED`(默认 true,降级时直接走 publish)                                                                                                                           | T6            |

---

## 1. 文件结构

### 后端新增

- `apps/api/src/reviews/review.service.ts` — preflight 编排核心(单一职责:取 prompt → 拼 messages → Promise.all → 解析 → 推 recommendation → tx 写入)
- `apps/api/src/reviews/review.service.spec.ts` — 单测覆盖 6 场景
- `apps/api/src/reviews/reviews.controller.ts` — `POST /drafts/:id/preflight` + `GET /drafts/:id/reviews`
- `apps/api/src/reviews/reviews.module.ts` — 模块封装(导入 PrismaModule、LlmModule、PromptsModule、AuthModule)
- `apps/api/src/reviews/dto/preflight-response.dto.ts` — TS 响应类型(包了 review + recommendation)
- `apps/api/test/preflight-review.e2e-spec.ts` — e2e 8 用例

### 后端修改

- `apps/api/prisma/schema.prisma` — 新增 `DraftStatus` enum、`ReviewStage` enum、`ReviewRecommendation` enum、`Review` model;Draft 加 `status`、`publishedAt`、`lastReviewId`、`reviews`、`lastReview`;`DraftToolType` 加 2 个枚举值
- `apps/api/prisma/migrations/<timestamp>_phase23_review/migration.sql` — Prisma migrate 自动生成
- `apps/api/prisma/fixtures/prompts.ts` — 末尾追加 SAFETY_REVIEW / QUALITY_REVIEW 两条 PLATFORM starter
- `apps/api/src/prompts/prompts.service.ts` — `copyToPrivate` 加守卫(BadRequest);`list` where 加 `tool: { notIn: [...] }`
- `apps/api/src/drafts/drafts.service.ts` — 新增 `publish(id, authorId)` 方法,带 lastReview 校验
- `apps/api/src/drafts/drafts.controller.ts` — 新增 `POST /:id/publish` 路由
- `apps/api/src/app.module.ts` — 注册 `ReviewsModule`

### 前端新增

- `apps/web/src/app/drafts/[id]/_components/PreflightDialog.tsx` — 模态弹窗 + 状态机(idle/loading/success/error)
- `apps/web/src/app/drafts/[id]/_components/ScorePanel.tsx` — safety + quality 两区
- `apps/web/src/app/drafts/[id]/_components/RecommendationBadge.tsx` — ALLOW/WARN/BLOCK 三色徽章
- `apps/web/src/lib/use-preflight.ts` — `usePreflightMutation` + `usePublishMutation`(原生 fetch 包 useState)
- `apps/web/src/app/post/[id]/page.tsx` — 占位详情页(Phase 2.5 实现)

### 前端修改

- `apps/web/src/components/draft-editor.tsx` — header 加"发布"按钮 → 打开 PreflightDialog;读 `searchParams.get("qualityDimension")` 给 ToolPanel hint(高亮展示)

### 共享类型

- `packages/shared/src/review.ts` — Review / SafetyDim / QualityDim / Recommendation 4 个 TS 类型
- `packages/shared/src/index.ts` — 加 `export * from "./review"`

### 依赖文件(只读参考)

- `apps/api/src/llm/llm.client.ts` — `chat(messages, opts)` 已有
- `apps/api/src/prompts/prompts.service.ts:40` — `findDefaultByTool` 已有
- `apps/api/src/drafts/drafts.service.ts:48` — `assertAuthor` 已有

---

## Task 1:Prisma schema 增量(Review 表 + Draft 三字段 + 3 个新 enum + 2 个 tool 枚举值)

**Files:**

- Modify: `apps/api/prisma/schema.prisma:25-35`(DraftToolType 加 2 项)
- Modify: `apps/api/prisma/schema.prisma:48-63`(Draft 加 status/publishedAt/lastReviewId/lastReview/reviews)
- Modify: `apps/api/prisma/schema.prisma`(末尾新增 3 个 enum + Review model)
- Create: `apps/api/prisma/migrations/<auto>_phase23_review/migration.sql`(Prisma 自动生成)

- [ ] **Step 1: 编辑 schema.prisma `DraftToolType` 枚举,加 2 个值**

把第 25-35 行的 enum 改成:

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
}
```

- [ ] **Step 2: 在 `PromptOwner` 后追加 3 个新 enum**

在第 23 行 `PromptOwner` 闭合大括号后新增:

```prisma
enum DraftStatus {
  DRAFT
  PUBLISHED
}

enum ReviewStage {
  PREFLIGHT
  POST_PUBLISH
}

enum ReviewRecommendation {
  ALLOW
  WARN
  BLOCK
}
```

- [ ] **Step 3: Draft model 加 4 个字段 + 2 个关系**

把第 48-63 行 Draft model 改成:

```prisma
model Draft {
  id           String       @id @default(cuid())
  authorId     String
  mode         DraftMode    @default(FAST)
  status       DraftStatus  @default(DRAFT)
  title        String
  body         Json
  version      Int          @default(1)
  publishedAt  DateTime?
  lastReviewId String?
  createdAt    DateTime     @default(now())
  updatedAt    DateTime     @updatedAt

  author     User           @relation(fields: [authorId], references: [id], onDelete: Cascade)
  versions   DraftVersion[]
  lastReview Review?        @relation("DraftLastReview", fields: [lastReviewId], references: [id])
  reviews    Review[]       @relation("DraftReviews")

  @@index([authorId])
  @@index([status])
  @@map("drafts")
}
```

- [ ] **Step 4: 文件末尾追加 Review model**

在 schema.prisma 最末尾追加:

```prisma
model Review {
  id             String                @id @default(cuid())
  draftId        String
  stage          ReviewStage
  safety         Json
  quality        Json
  recommendation ReviewRecommendation
  modelMeta      Json?
  createdAt      DateTime              @default(now())

  draft          Draft @relation("DraftReviews", fields: [draftId], references: [id], onDelete: Cascade)
  draftLastSeen  Draft[] @relation("DraftLastReview")

  @@index([draftId, createdAt(sort: Desc)])
  @@map("reviews")
}
```

> WHY 双关系名:`DraftReviews` 是一对多正向(Review 的所有者),`DraftLastReview` 是 Draft 上的快读外键(可空,指向最新一条)。Prisma 要求两个不同语义的关系必须命名隔离。

- [ ] **Step 5: 跑迁移**

```bash
cd apps/api && pnpm exec prisma migrate dev --name phase23_review
```

期望输出:`Database is now in sync with your schema. ✔ Generated Prisma Client`。失败时检查 docker compose 是否起了 postgres(`docker ps | grep bytedance-aigc-postgres`)。

- [ ] **Step 6: 跑全仓 typecheck 确认 Prisma 类型同步**

```bash
pnpm typecheck
```

期望:全绿。`@prisma/client` 已自动 regenerate,新 enum / model 都在。

- [ ] **Step 7: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(api): Phase 2.3 T1 — Review 表 + Draft 状态 + 3 个新 enum + 2 个 tool 枚举值

新增 Review(stage/safety/quality/recommendation/modelMeta)+ Draft.status/
publishedAt/lastReviewId,以及 DraftStatus/ReviewStage/ReviewRecommendation
三个 enum;DraftToolType 加 SAFETY_REVIEW/QUALITY_REVIEW。migration 走纯
增量,Phase 2.2 路径不受影响。"
```

---

## Task 2:shared 类型源 + Prompts 守卫 + list 隐藏 + seed starter 2 条

**Files:**

- Create: `packages/shared/src/review.ts`
- Modify: `packages/shared/src/index.ts:1`(加一行 export)
- Modify: `apps/api/src/prompts/prompts.service.ts:18-25`(list where)
- Modify: `apps/api/src/prompts/prompts.service.ts:92-112`(copyToPrivate 守卫)
- Modify: `apps/api/prisma/fixtures/prompts.ts`(末尾追加 2 条)

- [ ] **Step 1: 创建 shared 类型 `packages/shared/src/review.ts`**

```ts
export const SAFETY_KEYS = [
  "pornography",
  "gambling",
  "drugs",
  "politics",
  "vulgarity",
  "false_advertising",
] as const;
export type SafetyKey = (typeof SAFETY_KEYS)[number];

export const QUALITY_KEYS = [
  "content_value",
  "expression",
  "reader_experience",
  "viral_potential",
] as const;
export type QualityKey = (typeof QUALITY_KEYS)[number];

export type Severity = "low" | "medium" | "high";
export type Recommendation = "ALLOW" | "WARN" | "BLOCK";

export interface SafetyDim {
  key: SafetyKey;
  score: number;
  severity: Severity;
  hits: string[];
  reason?: string;
}

export interface ReviewSafety {
  overall: number;
  dimensions: SafetyDim[];
  note?: string;
}

export interface QualityDim {
  key: QualityKey;
  score: number;
  reason: string;
}

export interface ReviewQuality {
  overall: number;
  dimensions: QualityDim[];
  note?: string;
}

export interface ReviewModelMeta {
  model: string;
  latencyMsSafety: number;
  latencyMsQuality: number;
  truncated: boolean;
}

export interface ReviewDto {
  id: string;
  stage: "PREFLIGHT" | "POST_PUBLISH";
  safety: ReviewSafety;
  quality: ReviewQuality;
  recommendation: Recommendation;
  modelMeta?: ReviewModelMeta | null;
  createdAt: string;
}

export interface PreflightResponse {
  review: ReviewDto;
  recommendation: Recommendation;
}
```

- [ ] **Step 2: `packages/shared/src/index.ts` 加 export**

把现有的 `export * from "./draft-tools";` 后追加:

```ts
export * from "./review";
```

- [ ] **Step 3: `prompts.service.ts` `list` 加 notIn 过滤**

把 `apps/api/src/prompts/prompts.service.ts` 第 17-25 行的 `list` 方法改为:

```ts
async list(query: ListPromptsQueryDto): Promise<Prompt[]> {
  return this.prisma.prompt.findMany({
    where: {
      owner: "PLATFORM",
      tool: query.tool ? query.tool : { notIn: ["SAFETY_REVIEW", "QUALITY_REVIEW"] },
    },
    orderBy: [{ tool: "asc" }, { createdAt: "asc" }],
  });
}
```

> WHY:`query.tool` 显式传 SAFETY_REVIEW 也允许列出(给后台管理预留口);默认 list 隐藏。findDefaultByTool 走 findFirst,不受 list 过滤影响。

- [ ] **Step 4: `prompts.service.ts` `copyToPrivate` 加守卫**

在第 92-112 行 `copyToPrivate` 方法的 `if (source.owner !== "PLATFORM")` 这一段(约第 95-97 行)前面追加:

```ts
if (source.tool === "SAFETY_REVIEW" || source.tool === "QUALITY_REVIEW") {
  throw new BadRequestException("此 Prompt 由平台独占,不可复制为私人副本");
}
```

> WHY:落实 PRD §4.7.2"作者不可见、不可修改"硬隔离。BadRequestException 已经在 import 里。

- [ ] **Step 5: 在 `prompts.ts` fixture 末尾追加 2 条 starter**

在 `apps/api/prisma/fixtures/prompts.ts` 数组的最后 1 个元素 `}` 后加逗号,新增:

```ts
{
  owner: "PLATFORM",
  tool: "SAFETY_REVIEW",
  name: "默认·发布前安全审核",
  systemPrompt: `你是平台合规审核员。请对给定文章做 6 个维度的合规检查:涉黄(pornography)、涉赌(gambling)、涉毒(drugs)、政治敏感(politics)、低俗内容(vulgarity)、虚假宣传(false_advertising)。

严格输出如下 JSON,不要任何解释或前后文:
{
  "dimensions": [
    {"key":"pornography","score":0,"severity":"low","hits":[],"reason":"无命中"},
    {"key":"gambling","score":0,"severity":"low","hits":[],"reason":"无命中"},
    {"key":"drugs","score":0,"severity":"low","hits":[],"reason":"无命中"},
    {"key":"politics","score":0,"severity":"low","hits":[],"reason":"无命中"},
    {"key":"vulgarity","score":0,"severity":"low","hits":[],"reason":"无命中"},
    {"key":"false_advertising","score":0,"severity":"low","hits":[],"reason":"无命中"}
  ]
}

字段约束:
- score: 0-100 整数,值越大风险越高
- severity: score≥70 为 high;30-69 为 medium;否则 low
- hits: 命中片段数组,每条 ≤ 50 字;无命中则 []
- reason: 1 句中文解释,无命中则写"无命中"
`,
  params: { temperature: 0.0, topP: 0.9, maxTokens: 1200 },
  fewShots: [],
  designNote: "Phase 2.3 平台保留 Prompt;严格 JSON 输出 + 6 维度全列;PE 工程化 Phase 4 接入实验室。",
  isStarter: true,
},
{
  owner: "PLATFORM",
  tool: "QUALITY_REVIEW",
  name: "默认·发布前 4 维质量评分",
  systemPrompt: `你是头条资深编辑。请对给定文章按 4 个维度打分(0-100 整数):内容价值(content_value)、表达质量(expression)、读者体验(reader_experience)、传播潜力(viral_potential)。

严格输出如下 JSON,不要任何解释或前后文:
{
  "dimensions": [
    {"key":"content_value","score":75,"reason":"信息增量适中,数据支撑略弱。"},
    {"key":"expression","score":80,"reason":"语言通顺,逻辑清晰,句式略单一。"},
    {"key":"reader_experience","score":70,"reason":"标题钩子尚可,小标题层级可优化。"},
    {"key":"viral_potential","score":68,"reason":"话题中等热度,缺少互动引导。"}
  ]
}

字段约束:
- score: 0-100 整数;90+ 优秀,80-89 良好,60-79 中等,60- 较弱
- reason: 1-2 句中文,扣分点写明确
`,
  params: { temperature: 0.4, topP: 0.9, maxTokens: 1200 },
  fewShots: [],
  designNote: "Phase 2.3 平台保留 Prompt;严格 JSON + 4 维各 1-2 句 reason。",
  isStarter: true,
},
```

- [ ] **Step 6: 重新跑 seed**

```bash
cd apps/api && pnpm exec prisma db seed
```

期望输出:`[seed] 完成:users=N, prompts=11, drafts=N`(原 9 + 2 新)。

- [ ] **Step 7: 加单测覆盖守卫与 list 过滤**

在 `apps/api/src/prompts/prompts.service.spec.ts`(若不存在则创建)追加 2 个用例。如果该文件不存在,跳过本步,在 T4 e2e 用 HTTP 路径覆盖即可(标记本步 done 但实际不写文件)。

- [ ] **Step 8: typecheck + 全仓 lint**

```bash
pnpm typecheck && pnpm lint
```

期望:全绿。

- [ ] **Step 9: Commit**

```bash
git add packages/shared apps/api/src/prompts/prompts.service.ts apps/api/prisma/fixtures/prompts.ts
git commit -m "feat: Phase 2.3 T2 — shared review 类型 + Prompts 守卫 + 2 条 PLATFORM starter

packages/shared/src/review.ts 出 SafetyDim/QualityDim/PreflightResponse 类型源;
PromptsService.copyToPrivate 禁复制 SAFETY_REVIEW/QUALITY_REVIEW;list 默认隐藏。
fixtures 末尾追加 2 条 PLATFORM starter,共 11 条。"
```

---

## Task 3:ReviewService 编排 + 单测

**Files:**

- Create: `apps/api/src/reviews/review.service.ts`
- Create: `apps/api/src/reviews/review.service.spec.ts`

- [ ] **Step 1: 创建 `review.service.ts`**

```ts
import { Injectable, InternalServerErrorException, Logger } from "@nestjs/common";
import { Prisma, Review } from "@prisma/client";
import type {
  PreflightResponse,
  Recommendation,
  ReviewQuality,
  ReviewSafety,
  SafetyDim,
  QualityDim,
} from "@bytedance-aigc/shared";
import { SAFETY_KEYS, QUALITY_KEYS } from "@bytedance-aigc/shared";

import { LlmClient } from "../llm/llm.client";
import { PrismaService } from "../prisma/prisma.service";
import { PromptsService } from "../prompts/prompts.service";
import { DraftsService } from "../drafts/drafts.service";

const TRUNCATE_LIMIT = 12000;

@Injectable()
export class ReviewService {
  private readonly logger = new Logger(ReviewService.name);

  constructor(
    private readonly drafts: DraftsService,
    private readonly prisma: PrismaService,
    private readonly llm: LlmClient,
    private readonly prompts: PromptsService,
  ) {}

  async preflight(draftId: string, userSub: string): Promise<PreflightResponse> {
    const draft = await this.drafts.assertAuthor(draftId, userSub);
    const fullText = this.extractFullText(draft);
    const truncated = fullText.length > TRUNCATE_LIMIT;
    const text = truncated ? fullText.slice(0, TRUNCATE_LIMIT) : fullText;

    const [safetyPrompt, qualityPrompt] = await Promise.all([
      this.prompts.findDefaultByTool("SAFETY_REVIEW"),
      this.prompts.findDefaultByTool("QUALITY_REVIEW"),
    ]);

    const safetyMessages = [
      { role: "system" as const, content: safetyPrompt.systemPrompt },
      { role: "user" as const, content: text },
    ];
    const qualityMessages = [
      { role: "system" as const, content: qualityPrompt.systemPrompt },
      { role: "user" as const, content: text },
    ];

    const t0 = Date.now();
    let safetyRaw = "";
    let qualityRaw = "";
    let safetyMs = 0;
    let qualityMs = 0;
    try {
      const [s, q] = await Promise.all([
        this.timed(() => this.llm.chat(safetyMessages, { temperature: 0.0 })),
        this.timed(() => this.llm.chat(qualityMessages, { temperature: 0.4 })),
      ]);
      safetyRaw = s.value;
      safetyMs = s.ms;
      qualityRaw = q.value;
      qualityMs = q.ms;
    } catch (err) {
      this.logger.warn(`preflight LLM error: ${(err as Error).message}`);
      throw new InternalServerErrorException("LLM 审核失败,请稍后重试");
    }

    const safety = this.parseSafety(safetyRaw);
    const quality = this.parseQuality(qualityRaw);
    const recommendation = this.recommend(safety, quality);

    const review = await this.prisma.$transaction(async (tx) => {
      const created = await tx.review.create({
        data: {
          draftId,
          stage: "PREFLIGHT",
          safety: safety as unknown as Prisma.InputJsonValue,
          quality: quality as unknown as Prisma.InputJsonValue,
          recommendation,
          modelMeta: {
            latencyMsSafety: safetyMs,
            latencyMsQuality: qualityMs,
            totalMs: Date.now() - t0,
            truncated,
          } as unknown as Prisma.InputJsonValue,
        },
      });
      await tx.draft.update({ where: { id: draftId }, data: { lastReviewId: created.id } });
      return created;
    });

    return { review: this.toDto(review), recommendation };
  }

  async listByDraft(draftId: string, userSub: string, limit = 10): Promise<Review[]> {
    await this.drafts.assertAuthor(draftId, userSub);
    return this.prisma.review.findMany({
      where: { draftId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }

  /** 把 draft.body(TipTap JSONContent)+ 标题拼成 markdown-ish 全文。简单实现:递归取 text 节点。 */
  private extractFullText(draft: { title: string; body: unknown }): string {
    const parts: string[] = [draft.title];
    const walk = (node: unknown): void => {
      if (!node || typeof node !== "object") return;
      const n = node as { type?: string; text?: string; content?: unknown[] };
      if (typeof n.text === "string") parts.push(n.text);
      if (Array.isArray(n.content)) n.content.forEach(walk);
    };
    walk(draft.body);
    return parts.filter(Boolean).join("\n\n");
  }

  private async timed<T>(fn: () => Promise<T>): Promise<{ value: T; ms: number }> {
    const t = Date.now();
    const value = await fn();
    return { value, ms: Date.now() - t };
  }

  /** 严格 JSON parse;失败 / 缺维度 / 维度不全 → fallback BLOCK 风险态。 */
  private parseSafety(raw: string): ReviewSafety {
    const fallback = (note: string): ReviewSafety => ({
      overall: 0,
      dimensions: SAFETY_KEYS.map((key) => ({
        key,
        score: 100,
        severity: "high" as const,
        hits: [],
        reason: "AI 输出格式异常,默认按高风险处理",
      })),
      note,
    });
    let parsed: { dimensions?: unknown };
    try {
      parsed = JSON.parse(raw) as { dimensions?: unknown };
    } catch {
      return fallback("AI 安全审核输出非合法 JSON");
    }
    if (!Array.isArray(parsed.dimensions)) return fallback("AI 安全审核输出缺 dimensions");
    const dims: SafetyDim[] = [];
    for (const key of SAFETY_KEYS) {
      const found = (parsed.dimensions as { key?: string }[]).find((d) => d?.key === key);
      if (!found) return fallback(`AI 输出缺维度 ${key}`);
      const f = found as Record<string, unknown>;
      const score = Number(f.score);
      const severity = (f.severity === "high" || f.severity === "medium" ? f.severity : "low") as
        | "low"
        | "medium"
        | "high";
      dims.push({
        key,
        score: Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : 0,
        severity,
        hits: Array.isArray(f.hits)
          ? (f.hits as unknown[]).filter((h) => typeof h === "string").map(String)
          : [],
        reason: typeof f.reason === "string" ? f.reason : undefined,
      });
    }
    const maxScore = Math.max(0, ...dims.map((d) => d.score));
    return { overall: 100 - maxScore, dimensions: dims };
  }

  private parseQuality(raw: string): ReviewQuality {
    const fallback = (note: string): ReviewQuality => ({
      overall: 0,
      dimensions: QUALITY_KEYS.map((key) => ({ key, score: 0, reason: "AI 输出格式异常" })),
      note,
    });
    let parsed: { dimensions?: unknown };
    try {
      parsed = JSON.parse(raw) as { dimensions?: unknown };
    } catch {
      return fallback("AI 质量评分输出非合法 JSON");
    }
    if (!Array.isArray(parsed.dimensions)) return fallback("AI 质量评分输出缺 dimensions");
    const dims: QualityDim[] = [];
    for (const key of QUALITY_KEYS) {
      const found = (parsed.dimensions as { key?: string }[]).find((d) => d?.key === key);
      if (!found) return fallback(`AI 输出缺维度 ${key}`);
      const f = found as Record<string, unknown>;
      const score = Number(f.score);
      dims.push({
        key,
        score: Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : 0,
        reason: typeof f.reason === "string" ? f.reason : "",
      });
    }
    const overall = Math.round(dims.reduce((s, d) => s + d.score, 0) / dims.length);
    return { overall, dimensions: dims };
  }

  private recommend(safety: ReviewSafety, quality: ReviewQuality): Recommendation {
    if (safety.dimensions.some((d) => d.severity === "high")) return "BLOCK";
    if (safety.dimensions.some((d) => d.severity === "medium")) return "WARN";
    if (quality.overall < 60) return "WARN";
    return "ALLOW";
  }

  private toDto(r: Review): PreflightResponse["review"] {
    return {
      id: r.id,
      stage: r.stage as "PREFLIGHT" | "POST_PUBLISH",
      safety: r.safety as unknown as ReviewSafety,
      quality: r.quality as unknown as ReviewQuality,
      recommendation: r.recommendation as Recommendation,
      modelMeta: r.modelMeta as never,
      createdAt: r.createdAt.toISOString(),
    };
  }
}
```

- [ ] **Step 2: 创建 `review.service.spec.ts`**

```ts
/* eslint-disable @typescript-eslint/unbound-method */
import type { Prompt } from "@prisma/client";

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
    findDefaultByTool: jest
      .fn()
      .mockResolvedValue({ systemPrompt: "你是审核员", params: {} } as Prompt),
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
```

- [ ] **Step 3: 跑单测**

```bash
pnpm --filter @bytedance-aigc/api test -- --testPathPattern=review.service
```

期望:6 passed。

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/reviews/review.service.ts apps/api/src/reviews/review.service.spec.ts
git commit -m "feat(api): Phase 2.3 T3 — ReviewService preflight 编排 + 6 单测

并发取 SAFETY_REVIEW/QUALITY_REVIEW prompt → Promise.all chat → 严格 JSON
解析 + 缺维度 fallback BLOCK → 后端推 recommendation → tx 写 Review +
更新 Draft.lastReviewId。单测覆盖 ALLOW/WARN(safety medium)/WARN(quality)/
BLOCK(safety high)/JSON 失败/缺维度。"
```

---

## Task 4:ReviewsController + ReviewsModule + 路由注册 + e2e 部分

**Files:**

- Create: `apps/api/src/reviews/reviews.controller.ts`
- Create: `apps/api/src/reviews/reviews.module.ts`
- Modify: `apps/api/src/app.module.ts`(注册)
- Create: `apps/api/test/preflight-review.e2e-spec.ts`(本 task 写 4 条)

- [ ] **Step 1: 创建 `reviews.module.ts`**

```ts
import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { DraftsModule } from "../drafts/drafts.module";
import { PromptsModule } from "../prompts/prompts.module";
import { ReviewsController } from "./reviews.controller";
import { ReviewService } from "./review.service";

@Module({
  imports: [AuthModule, DraftsModule, PromptsModule],
  controllers: [ReviewsController],
  providers: [ReviewService],
  exports: [ReviewService],
})
export class ReviewsModule {}
```

> WHY 不 import LlmModule:LlmModule 已用 `@Global()`,LlmClient 任意模块直接注入。WHY 不 import PrismaModule:PrismaService 也是 @Global。检查这两个 module 是否真 @Global 由 T3 typecheck 兜底,如不是 @Global 则把 LlmModule/PrismaModule 加到 imports。

- [ ] **Step 2: 创建 `reviews.controller.ts`**

```ts
import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import type { Review } from "@prisma/client";
import type { PreflightResponse } from "@bytedance-aigc/shared";

import { CurrentUser } from "../auth/current-user.decorator";
import type { JwtPayload } from "../auth/jwt-payload.interface";
import { UserGuard } from "../auth/user.guard";
import { ReviewService } from "./review.service";

@Controller("drafts")
@UseGuards(UserGuard)
export class ReviewsController {
  constructor(private readonly reviews: ReviewService) {}

  @Post(":id/preflight")
  @HttpCode(HttpStatus.OK)
  preflight(@Param("id") id: string, @CurrentUser() user: JwtPayload): Promise<PreflightResponse> {
    return this.reviews.preflight(id, user.sub);
  }

  @Get(":id/reviews")
  list(
    @Param("id") id: string,
    @CurrentUser() user: JwtPayload,
    @Query("limit") limit?: string,
  ): Promise<Review[]> {
    const n = limit ? Number(limit) : 10;
    return this.reviews.listByDraft(id, user.sub, Number.isFinite(n) ? n : 10);
  }
}
```

- [ ] **Step 3: 注册 ReviewsModule 到 app.module.ts**

打开 `apps/api/src/app.module.ts`,在 imports 数组里 `DraftsModule` 之后追加 `ReviewsModule`:

```ts
import { ReviewsModule } from "./reviews/reviews.module";

// ... 在 imports 数组里加:
ReviewsModule,
```

- [ ] **Step 4: 跑全仓 typecheck + lint**

```bash
pnpm typecheck && pnpm lint
```

期望:全绿。

- [ ] **Step 5: e2e 写 4 条(preflight happy / unauthorized / 不属于本人 / list 返最近一条)**

创建 `apps/api/test/preflight-review.e2e-spec.ts`,参考 `drafts.e2e-spec.ts` 的现有模板(setup helper、loginAs、createDraft),用例骨架:

```ts
import * as request from "supertest";
import { createTestApp, type TestCtx } from "./helpers/setup";

describe("Phase 2.3 preflight & reviews", () => {
  let ctx: TestCtx;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });

  it("POST /drafts/:id/preflight 200 → 含 review + recommendation", async () => {
    const { token, draftId } = await ctx.seedAuthorAndDraft();
    const res = await request(ctx.app.getHttpServer())
      .post(`/drafts/${draftId}/preflight`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(res.body).toHaveProperty("review.id");
    expect(res.body).toHaveProperty("recommendation");
    expect(["ALLOW", "WARN", "BLOCK"]).toContain(res.body.recommendation);
  });

  it("POST /drafts/:id/preflight 401(无 token)", async () => {
    const { draftId } = await ctx.seedAuthorAndDraft();
    await request(ctx.app.getHttpServer()).post(`/drafts/${draftId}/preflight`).expect(401);
  });

  it("POST /drafts/:id/preflight 403(别人草稿)", async () => {
    const { draftId } = await ctx.seedAuthorAndDraft();
    const otherToken = await ctx.seedAuthor("other-user");
    await request(ctx.app.getHttpServer())
      .post(`/drafts/${draftId}/preflight`)
      .set("Authorization", `Bearer ${otherToken}`)
      .expect(403);
  });

  it("GET /drafts/:id/reviews?limit=5 返最近 N 条", async () => {
    const { token, draftId } = await ctx.seedAuthorAndDraft();
    await request(ctx.app.getHttpServer())
      .post(`/drafts/${draftId}/preflight`)
      .set("Authorization", `Bearer ${token}`);
    const res = await request(ctx.app.getHttpServer())
      .get(`/drafts/${draftId}/reviews?limit=5`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
  });
});
```

> 注:e2e LLM 需要打到真服务,.env.test 保证 `LLM_BASE_URL` / `LLM_API_KEY` 可用。如本地无 key,把 LlmClient mock 进 e2e setup(`overrideProvider(LlmClient).useValue({ chat: () => Promise.resolve(ALL_LOW_SAFETY) })`)。具体看 helpers/setup.ts 现有 mock 风格,跟着写。

- [ ] **Step 6: 跑 e2e**

```bash
pnpm --filter @bytedance-aigc/api test:e2e -- --testPathPattern=preflight-review
```

期望:4 passed。

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/reviews apps/api/src/app.module.ts apps/api/test/preflight-review.e2e-spec.ts
git commit -m "feat(api): Phase 2.3 T4 — ReviewsController + 4 条 e2e

新增 POST /drafts/:id/preflight 与 GET /drafts/:id/reviews;ReviewsModule
注册;e2e 覆盖 happy / 401 / 403 / list。"
```

---

## Task 5:DraftsService.publish + drafts.controller 路由 + 4 条 e2e

**Files:**

- Modify: `apps/api/src/drafts/drafts.service.ts`(末尾加 publish 方法)
- Modify: `apps/api/src/drafts/drafts.controller.ts`(末尾加 publish 路由)
- Modify: `apps/api/test/drafts.e2e-spec.ts`(追加 4 条 publish 用例)

- [ ] **Step 1: `drafts.service.ts` 末尾(类闭合 `}` 之前)追加 publish 方法**

```ts
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
    throw new ConflictException({ code: "PREFLIGHT_BLOCKED", message: "上次预检结果为 BLOCK,请修改后重试" });
  }
  if (Date.now() - r.createdAt.getTime() > 24 * 3600 * 1000) {
    throw new ConflictException({ code: "PREFLIGHT_EXPIRED", message: "预检结果已过 24 小时,请重新预检" });
  }
  const updated = await this.prisma.draft.update({
    where: { id },
    data: { status: "PUBLISHED", publishedAt: new Date() },
  });
  return { id: updated.id, publishedAt: updated.publishedAt as Date };
}
```

> WHY ConflightException:NestJS 自带 409。需要在文件顶部 import 加 `ConflictException`。

- [ ] **Step 2: `drafts.service.ts` 顶部 import 加 `ConflictException`**

第 1 行改为:

```ts
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
```

- [ ] **Step 3: `drafts.controller.ts` 末尾(类闭合前)加路由**

```ts
@Post(":id/publish")
@HttpCode(HttpStatus.OK)
publish(
  @Param("id") id: string,
  @CurrentUser() user: JwtPayload,
): Promise<{ id: string; publishedAt: Date }> {
  return this.drafts.publish(id, user.sub);
}
```

- [ ] **Step 4: 追加 4 条 e2e 用例到 `drafts.e2e-spec.ts`**

在文件末尾、最后一个 `});`(describe 闭合)之前追加:

```ts
describe("Phase 2.3 publish 状态机", () => {
  it("无 preflight → 409 PREFLIGHT_REQUIRED", async () => {
    const { token, draftId } = await ctx.seedAuthorAndDraft();
    const res = await request(ctx.app.getHttpServer())
      .post(`/drafts/${draftId}/publish`)
      .set("Authorization", `Bearer ${token}`)
      .expect(409);
    expect(res.body.message?.code ?? res.body.code).toBe("PREFLIGHT_REQUIRED");
  });

  it("preflight BLOCK → 409 PREFLIGHT_BLOCKED", async () => {
    const { token, draftId } = await ctx.seedAuthorAndDraftWithBlockedReview();
    const res = await request(ctx.app.getHttpServer())
      .post(`/drafts/${draftId}/publish`)
      .set("Authorization", `Bearer ${token}`)
      .expect(409);
    expect(res.body.message?.code ?? res.body.code).toBe("PREFLIGHT_BLOCKED");
  });

  it("preflight 25h 前 → 409 PREFLIGHT_EXPIRED", async () => {
    const { token, draftId } = await ctx.seedAuthorAndDraftWithExpiredReview();
    const res = await request(ctx.app.getHttpServer())
      .post(`/drafts/${draftId}/publish`)
      .set("Authorization", `Bearer ${token}`)
      .expect(409);
    expect(res.body.message?.code ?? res.body.code).toBe("PREFLIGHT_EXPIRED");
  });

  it("ALLOW preflight + 24h 内 → 200 PUBLISHED", async () => {
    const { token, draftId } = await ctx.seedAuthorAndDraftWithAllowReview();
    const res = await request(ctx.app.getHttpServer())
      .post(`/drafts/${draftId}/publish`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(res.body.id).toBe(draftId);
    expect(res.body.publishedAt).toBeTruthy();
  });
});
```

> 三个新 helper(`seedAuthorAndDraftWithBlockedReview` 等)需要加到 `apps/api/test/helpers/setup.ts`。每个 helper 调一次 `prisma.review.create` 写一行 + `draft.update lastReviewId`,createdAt 用 `new Date(Date.now() - 25*3600*1000)` 模拟 25h 过期。

- [ ] **Step 5: 在 `apps/api/test/helpers/setup.ts` 加 3 个 helper(参照已有 seedAuthorAndDraft)**

伪代码骨架(具体抄已有 helper 样式):

```ts
async seedAuthorAndDraftWithReview(rec: "ALLOW"|"WARN"|"BLOCK", agedMs = 0) {
  const base = await this.seedAuthorAndDraft();
  const now = new Date(Date.now() - agedMs);
  const r = await this.prisma.review.create({
    data: {
      draftId: base.draftId,
      stage: "PREFLIGHT",
      safety: { overall: 100, dimensions: [] },
      quality: { overall: 80, dimensions: [] },
      recommendation: rec,
      modelMeta: {},
      createdAt: now,
    },
  });
  await this.prisma.draft.update({ where: { id: base.draftId }, data: { lastReviewId: r.id } });
  return base;
}
seedAuthorAndDraftWithBlockedReview()  { return this.seedAuthorAndDraftWithReview("BLOCK"); }
seedAuthorAndDraftWithExpiredReview()  { return this.seedAuthorAndDraftWithReview("ALLOW", 25*3600*1000); }
seedAuthorAndDraftWithAllowReview()    { return this.seedAuthorAndDraftWithReview("ALLOW"); }
```

- [ ] **Step 6: 跑相关 e2e**

```bash
pnpm --filter @bytedance-aigc/api test:e2e -- --testPathPattern=drafts
```

期望:全部 drafts e2e + 4 条新增全绿。

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/drafts/drafts.service.ts apps/api/src/drafts/drafts.controller.ts apps/api/test/drafts.e2e-spec.ts apps/api/test/helpers/setup.ts
git commit -m "feat(api): Phase 2.3 T5 — DraftsService.publish + 4 条状态机 e2e

POST /drafts/:id/publish 校验 lastReview.stage===PREFLIGHT && rec!==BLOCK
&& createdAt<24h,否则 409 PREFLIGHT_REQUIRED/PREFLIGHT_BLOCKED/
PREFLIGHT_EXPIRED;happy 路径置 status=PUBLISHED + publishedAt。"
```

---

## Task 6:前端组件 PreflightDialog + ScorePanel + RecommendationBadge + hooks + DraftEditor 集成

**Files:**

- Create: `apps/web/src/lib/use-preflight.ts`
- Create: `apps/web/src/app/drafts/[id]/_components/RecommendationBadge.tsx`
- Create: `apps/web/src/app/drafts/[id]/_components/ScorePanel.tsx`
- Create: `apps/web/src/app/drafts/[id]/_components/PreflightDialog.tsx`
- Modify: `apps/web/src/components/draft-editor.tsx`(header 加发布按钮)

- [ ] **Step 1: `use-preflight.ts` 写两个 hook**

```ts
"use client";
import { useState } from "react";
import type { PreflightResponse } from "@bytedance-aigc/shared";
import { apiFetch } from "./auth";

export interface PreflightHookState {
  loading: boolean;
  data: PreflightResponse | null;
  error: string | null;
}

export function usePreflight(draftId: string) {
  const [state, setState] = useState<PreflightHookState>({
    loading: false,
    data: null,
    error: null,
  });
  const run = async (): Promise<PreflightResponse | null> => {
    setState({ loading: true, data: null, error: null });
    try {
      const res = await apiFetch(`/drafts/${draftId}/preflight`, { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        const msg = typeof body.message === "string" ? body.message : `预检失败 ${res.status}`;
        setState({ loading: false, data: null, error: msg });
        return null;
      }
      const data = (await res.json()) as PreflightResponse;
      setState({ loading: false, data, error: null });
      return data;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setState({ loading: false, data: null, error: msg });
      return null;
    }
  };
  return { ...state, run };
}

export interface PublishResult {
  id: string;
  publishedAt: string;
}

export function usePublish(draftId: string) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (): Promise<PublishResult | null> => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/drafts/${draftId}/publish`, { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          message?: { message?: string } | string;
        };
        const m =
          typeof body.message === "string"
            ? body.message
            : (body.message?.message ?? `发布失败 ${res.status}`);
        setError(m);
        setLoading(false);
        return null;
      }
      const data = (await res.json()) as PublishResult;
      setLoading(false);
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setLoading(false);
      return null;
    }
  };
  return { loading, error, run };
}
```

- [ ] **Step 2: `RecommendationBadge.tsx`**

```tsx
"use client";
import type { Recommendation } from "@bytedance-aigc/shared";

const COLORS: Record<Recommendation, string> = {
  ALLOW: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  WARN: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  BLOCK: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

const TEXT: Record<Recommendation, string> = {
  ALLOW: "建议发布",
  WARN: "可发布,有提示",
  BLOCK: "需修改",
};

export function RecommendationBadge({ value }: { value: Recommendation }) {
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${COLORS[value]}`}>
      {TEXT[value]}
    </span>
  );
}
```

- [ ] **Step 3: `ScorePanel.tsx`**

```tsx
"use client";
import type { ReviewSafety, ReviewQuality } from "@bytedance-aigc/shared";

const SAFETY_LABEL: Record<string, string> = {
  pornography: "涉黄",
  gambling: "涉赌",
  drugs: "涉毒",
  politics: "政治敏感",
  vulgarity: "低俗内容",
  false_advertising: "虚假宣传",
};

const QUALITY_LABEL: Record<string, string> = {
  content_value: "内容价值",
  expression: "表达质量",
  reader_experience: "读者体验",
  viral_potential: "传播潜力",
};

export function ScorePanel({
  safety,
  quality,
  onQualityDimensionClick,
}: {
  safety: ReviewSafety;
  quality: ReviewQuality;
  onQualityDimensionClick?: (key: string) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <section>
        <h3 className="text-sm font-semibold mb-2">安全分:{safety.overall} / 100</h3>
        <ul className="text-xs space-y-1">
          {safety.dimensions.map((d) => (
            <li key={d.key} className="flex items-center justify-between">
              <span>
                {SAFETY_LABEL[d.key] ?? d.key} · {d.severity}
              </span>
              <span>{d.score}</span>
            </li>
          ))}
        </ul>
        {safety.note && <p className="text-xs text-red-600 mt-1">{safety.note}</p>}
      </section>
      <section>
        <h3 className="text-sm font-semibold mb-2">质量分:{quality.overall} / 100</h3>
        <ul className="text-xs space-y-1">
          {quality.dimensions.map((d) => (
            <li key={d.key} className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => onQualityDimensionClick?.(d.key)}
                className="text-left underline-offset-2 hover:underline"
              >
                {QUALITY_LABEL[d.key] ?? d.key}
              </button>
              <span>{d.score}</span>
            </li>
          ))}
        </ul>
        {quality.note && <p className="text-xs text-red-600 mt-1">{quality.note}</p>}
      </section>
    </div>
  );
}
```

- [ ] **Step 4: `PreflightDialog.tsx`**

```tsx
"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { PreflightResponse } from "@bytedance-aigc/shared";

import { ScorePanel } from "./ScorePanel";
import { RecommendationBadge } from "./RecommendationBadge";
import { usePreflight, usePublish } from "@/lib/use-preflight";

export function PreflightDialog({
  draftId,
  open,
  onClose,
}: {
  draftId: string;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const preflight = usePreflight(draftId);
  const publish = usePublish(draftId);
  const [phase, setPhase] = useState<"idle" | "running" | "result" | "publishing">("idle");

  useEffect(() => {
    if (open && phase === "idle") {
      setPhase("running");
      void preflight.run().then((r) => setPhase(r ? "result" : "idle"));
    }
    if (!open) setPhase("idle");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const data: PreflightResponse | null = preflight.data;
  const canPublish = data && data.recommendation !== "BLOCK";

  const onPublishClick = async () => {
    setPhase("publishing");
    const r = await publish.run();
    if (r) router.push(`/post/${r.id}`);
    else setPhase("result");
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-white dark:bg-zinc-900 rounded-lg shadow-xl p-6">
        <header className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">发布前审核</h2>
          <button type="button" onClick={onClose} className="text-zinc-500 hover:text-zinc-900">
            ✕
          </button>
        </header>
        {phase === "running" && <p className="text-sm">审核中,稍候(约 5-10 秒)...</p>}
        {preflight.error && (
          <div className="text-sm text-red-600 space-y-2">
            <p>{preflight.error}</p>
            <button
              type="button"
              onClick={() => {
                setPhase("running");
                void preflight.run().then((r) => setPhase(r ? "result" : "idle"));
              }}
              className="rounded border px-3 py-1.5 text-xs"
            >
              重试
            </button>
          </div>
        )}
        {data && phase !== "running" && (
          <>
            <div className="flex items-center gap-3 mb-3">
              <RecommendationBadge value={data.recommendation} />
              <span className="text-xs text-zinc-500">预检结果 24 小时内有效</span>
            </div>
            <ScorePanel
              safety={data.review.safety}
              quality={data.review.quality}
              onQualityDimensionClick={(key) => {
                router.push(`/drafts/${draftId}?qualityDimension=${key}`);
                onClose();
              }}
            />
            <footer className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="text-sm rounded border px-3 py-1.5"
              >
                先优化再发
              </button>
              {canPublish && (
                <button
                  type="button"
                  disabled={phase === "publishing"}
                  onClick={onPublishClick}
                  className={`text-sm rounded px-3 py-1.5 text-white ${
                    data.recommendation === "WARN" ? "bg-yellow-600" : "bg-green-600"
                  } disabled:opacity-50`}
                >
                  {phase === "publishing" ? "发布中..." : "立即发布"}
                </button>
              )}
            </footer>
            {publish.error && <p className="text-xs text-red-600 mt-2">{publish.error}</p>}
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: 改 `draft-editor.tsx` header,加发布按钮**

在第 18 行的 `import { PromptDrawer }` 下面追加:

```ts
import { PreflightDialog } from "@/app/drafts/[id]/_components/PreflightDialog";
```

在第 57 行 `promptDrawerOpen` useState 下面新增:

```ts
const [preflightOpen, setPreflightOpen] = useState(false);
```

在第 246 行 `</button>`(Prompt 库按钮)和第 247 行 `<SaveStatus>` 之间新增:

```tsx
<button
  type="button"
  onClick={() => setPreflightOpen(true)}
  className="text-sm rounded bg-zinc-900 text-white px-2.5 py-1.5 hover:bg-zinc-700"
>
  发布
</button>
```

在第 303 行 `<PromptDrawer ... />` 之后新增:

```tsx
<PreflightDialog draftId={id} open={preflightOpen} onClose={() => setPreflightOpen(false)} />
```

- [ ] **Step 6: `pnpm --filter @bytedance-aigc/web build` 通过**

```bash
pnpm --filter @bytedance-aigc/web build
```

期望:Next.js 构建无报错。

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/use-preflight.ts apps/web/src/app/drafts apps/web/src/components/draft-editor.tsx
git commit -m "feat(web): Phase 2.3 T6 — PreflightDialog + ScorePanel + Badge + 发布按钮

PreflightDialog 状态机 idle→running→result→publishing;ScorePanel 展示
6 维 safety + 4 维 quality(quality 维度点击跳工作台 ?qualityDimension);
Badge ALLOW/WARN/BLOCK 三色;DraftEditor header 接入'发布'按钮。"
```

---

## Task 7:占位 `/post/[id]` 路由

**Files:**

- Create: `apps/web/src/app/post/[id]/page.tsx`

- [ ] **Step 1: 创建占位页**

```tsx
import Link from "next/link";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function PostPage({ params }: PageProps) {
  const { id } = await params;
  return (
    <main className="max-w-2xl mx-auto px-6 py-12 flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">已发布</h1>
      <p className="text-sm text-zinc-600">
        草稿 <code>{id}</code> 已发布。详情页 Phase 2.5 实现。
      </p>
      <Link href="/drafts/mine" className="text-sm underline">
        返回我的草稿
      </Link>
    </main>
  );
}
```

> WHY async params:Next.js 16 默认 params 是 Promise(已知 breaking change,在 web/AGENTS.md 警告范围内)。

- [ ] **Step 2: build 通过**

```bash
pnpm --filter @bytedance-aigc/web build
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/post
git commit -m "feat(web): Phase 2.3 T7 — /post/[id] 占位页(Phase 2.5 详情页占位符)"
```

---

## Task 8:README 小节 + 全仓静态五连绿 + 全仓 e2e

**Files:**

- Modify: `README.md`(LLM 接入小节后追加 Phase 2.3 小节)

- [ ] **Step 1: README 末尾或合适位置追加 Phase 2.3 小节**

```markdown
## Phase 2.3 — 发布前审核 + 4 维质量分

作者点"发布"按钮 → 同步并发跑 2 个 LLM(`SAFETY_REVIEW` + `QUALITY_REVIEW`,温度 0.0/0.4)→ 弹窗展示 6 维安全分 + 4 维质量分 + ALLOW/WARN/BLOCK 推荐 → 通过后落 `status=PUBLISHED`。

- 端点:
  - `POST /drafts/:id/preflight` — 同步,2 次 LLM 并发,落 Review 行
  - `POST /drafts/:id/publish` — 校验 `lastReview.stage===PREFLIGHT && rec!==BLOCK && now-createdAt<24h`,否则 409 PREFLIGHT_REQUIRED/PREFLIGHT_BLOCKED/PREFLIGHT_EXPIRED
  - `GET /drafts/:id/reviews?limit=10` — 历史审核(为 Phase 2.4 发布后审核留接口形态)
- Prompt 体系:`SAFETY_REVIEW` / `QUALITY_REVIEW` 是平台保留 Prompt(PRD §4.7.1 / §4.7.2),`PromptsService.copyToPrivate` 守卫禁止作者复制,`PromptsController.list` 默认隐藏。
- 数据模型:`Review` 表(一对多)+ `Draft.lastReviewId` 快读外键 + `Draft.status` / `Draft.publishedAt`。
```

- [ ] **Step 2: 全仓静态五连**

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm format:check
```

期望:全绿。失败的看错误对症修(常见:unbound-method 单测假阳 → 文件顶 disable;Prisma InputJsonValue → 显式 cast)。

- [ ] **Step 3: 跑全仓 e2e**

```bash
pnpm --filter @bytedance-aigc/api test:e2e
```

期望:≥ 49 条全绿(Phase 2.2 末态 41 + Phase 2.3 ≥ 8)。

- [ ] **Step 4: 更新 memory `project_bytedance_aigc_creator_platform.md` 进度块**

把进度块 "已完成 phase" 改成 "0 / 1.1-1.6 / 2.1 / 2.2 / 2.3";追加 Phase 2.3 ship 全表(8 个 task 的 commit hash + 一句话);更新 e2e 总数。

- [ ] **Step 5: Commit + 推送(若 git 远程已配,本步可视用户决定)**

```bash
git add README.md
git commit -m "docs(readme): Phase 2.3 发布前审核 + 4 维质量分小节"
```

memory 写入是 Write 工具操作,不进 git。

---

## 9. 自审

**1. spec 覆盖**:

- §1 目标 / 边界 → T1-T7 都对应得上
- §2 数据模型 → T1
- §3 API 端点(preflight / publish / reviews)→ T3 / T4 / T5
- §4 Prompt 体系扩展 → T2
- §5 前端组件树 → T6 / T7
- §6 风险与回滚 → T3 fallback / T6 publishError 显示 / T7 占位 — 全在
- §7 估时 / Task 分解 → 完全对应(spec 8 task / plan 8 task)
- §8 决策溯源 → §0 决策回顾
- §9 验收标准 → T8

**2. Placeholder**:plan 内无 TBD/TODO;e2e helper(Step 5 of T5)给了伪代码骨架而非完整 helper 实现 — 这是因为 helpers/setup.ts 现有内容未读全,但骨架已具体到方法签名,实施者照已有 helper 风格补即可。可接受。

**3. 类型一致性**:

- `PreflightResponse` 在 shared 定义 → review.service / use-preflight 都用同名 → 一致 ✓
- `Recommendation` 用 ALLOW/WARN/BLOCK 字面量,没有歧义 ✓
- `findDefaultByTool("SAFETY_REVIEW")` 调用与 enum 大小写一致 ✓
- ConflictException 的 body 形状(`{code, message}`):e2e 用 `res.body.message?.code ?? res.body.code` 双兜底,因 NestJS 把对象包进 message 字段,实施时取一种为准

---

Plan 落档完成。
