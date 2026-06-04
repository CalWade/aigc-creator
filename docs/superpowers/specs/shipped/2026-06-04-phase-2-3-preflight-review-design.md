# Phase 2.3 — 发布前审核 + 4 维质量分 · 设计稿 v1

> 2026-06-04 拍板,对应 PRD §4.1.4 / §4.3 / §4.7.1 / §3.3。决策细节见 memory `project_phase2_3_decisions.md`。

## §1 目标与边界

### 目标

作者在工作台点"发布"按钮 → 弹模态窗 →(异步)展示 6 维安全分 + 4 维质量分 + 推荐动作(ALLOW / WARN / BLOCK) → 作者选"立即发布"或"先优化再发"。

- 命中 BLOCK:不展示"立即发布",只能"修改后重提" — 落实 PRD §4.2 高危强制拦截
- WARN:可发布,但"立即发布"按钮置黄 + 提示
- ALLOW:可直接发布

### Phase 2.3 边界(放进来 / 推出去)

**放进来**:

- 发布前审核 1 个端点 `POST /drafts/:id/preflight` + 2 次 LLM 并发(安全 + 质量)
- 发布端点 `POST /drafts/:id/publish` + 状态机校验
- 历史审核查询 `GET /drafts/:id/reviews`(为 Phase 2.4 留接口形态)
- 前端 `<PreflightDialog>` + `<ScorePanel>` + `<RecommendationBadge>`
- Prompt 表新增 SAFETY_REVIEW / QUALITY_REVIEW 两条 PLATFORM starter
- 质量闭环 v0:点 quality 维度跳工作台 `?qualityDimension=xxx`,工作台读 query 高亮对应工具卡(不做"主动调用工具")

**推出去**:

- §4.1.5 发布后审核(用户举报 / 平台抽样 / 规则更新批量复审) → Phase 2.4
- §4.4 审核规则库 + 300 条标注测试集 + 准确率 ≥ 90% [硬指标] → Phase 2.4
- §4.7.3 Prompt 实验室(批量评估 / 版本对比 / 一键回滚 UI) → Phase 4
- §4.3.1 评分稳定性离线评测脚本 → Phase 4
- §3.3 完整 8 状态机(REVIEWING / REJECTED / OFFLINE / ROLLEDBACK) → Phase 2.4 起逐步加,Phase 2.3 只用 DRAFT / PUBLISHED 二态

## §2 数据模型

### Prisma schema 增量

```prisma
enum ReviewStage          { PREFLIGHT POST_PUBLISH }
enum ReviewRecommendation { ALLOW WARN BLOCK }

// 新增 enum 值
enum DraftToolType {
  // ... 现有 9 个
  SAFETY_REVIEW
  QUALITY_REVIEW
}

model Review {
  id             String                @id @default(cuid())
  draftId        String
  draft          Draft                 @relation(fields: [draftId], references: [id], onDelete: Cascade)
  stage          ReviewStage
  safety         Json                  // 见下文 schema
  quality        Json                  // 见下文 schema
  recommendation ReviewRecommendation
  modelMeta      Json?
  createdAt      DateTime              @default(now())

  @@index([draftId, createdAt(sort: Desc)])
}

model Draft {
  // ... 现有字段
  lastReviewId String?
  lastReview   Review?                 @relation("DraftLastReview", fields: [lastReviewId], references: [id])
  reviews      Review[]                // 反向关系
}
```

### Json 结构(packages/shared/src/review.ts 出 TS 类型源)

```ts
export interface ReviewSafety {
  overall: number; // 0-100,= 100 - max(各维度 score)
  dimensions: SafetyDim[];
  note?: string; // AI 输出异常时填
}
export interface SafetyDim {
  key: "pornography" | "gambling" | "drugs" | "politics" | "vulgarity" | "false_advertising";
  score: number; // 0-100,值越大风险越高
  severity: "low" | "medium" | "high";
  hits: string[]; // 命中片段(可空)
  reason?: string;
}
export interface ReviewQuality {
  overall: number; // 0-100,= 4 维加权平均(等权 25%)
  dimensions: QualityDim[];
  note?: string;
}
export interface QualityDim {
  key: "content_value" | "expression" | "reader_experience" | "viral_potential";
  score: number; // 0-100
  reason: string; // 1-2 句解释 (PRD §4.3.1 要求)
}
```

### Recommendation 推导(后端算,不让 LLM 自报)

- 任一 `safety.dimensions[].severity === "high"` → **BLOCK**
- 否则,任一 `severity === "medium"` 或 `quality.overall < 60` → **WARN**
- 否则 → **ALLOW**

理由:LLM 自报 recommendation 不稳定,后端基于结构化字段算才一致;同时方便后续 Phase 2.4 改规则不动 prompt。

## §3 API 端点

### POST `/drafts/:id/preflight` — 发布前预检(同步)

**Auth**: assertAuthor。
**Request body**: 空(从 draft 取全文)。
**Response 200**:

```ts
{
  review: { id, stage:"PREFLIGHT", safety, quality, recommendation, createdAt };
  recommendation: "ALLOW" | "WARN" | "BLOCK";
}
```

**编排**:

1. assertAuthor + 取 draft(含 sections,按 order 拼成 markdown 全文)
2. `findDefaultByTool("SAFETY_REVIEW")` + `findDefaultByTool("QUALITY_REVIEW")`,各自拿 systemPrompt + params
3. `Promise.all([llm.chat(safetyMsgs, {temperature: 0.0}), llm.chat(qualityMsgs, {temperature: 0.4})])`
4. 严格 JSON.parse,失败 → fallback:`{recommendation:"BLOCK", safety:{overall:0, dimensions:[], note:"AI 安全审核输出格式异常,请重试"}, quality:{...类似}}`
5. recommendation 推导(本 spec §2)
6. Prisma `$transaction([review.create, draft.update({lastReviewId})])`
7. 返 `{review, recommendation}`

**错误码**:401 / 403 / 404 / 502(LLM 抛错沿用 Phase 2.2 D6 默认 ExceptionFilter)。

### POST `/drafts/:id/publish` — 发布(同步)

**Auth**: assertAuthor。
**Response 200**: `{id, publishedAt}`。
**Response 409**:

- `{code: "PREFLIGHT_REQUIRED", message: "请先点预检"}`
- `{code: "PREFLIGHT_BLOCKED", message: "上次预检结果为 BLOCK,请修改后重试"}`
- `{code: "PREFLIGHT_EXPIRED", message: "预检结果已过 24 小时,请重新预检"}`

**校验**:

```ts
const r = draft.lastReview;
if (!r || r.stage !== "PREFLIGHT") throw 409 PREFLIGHT_REQUIRED;
if (r.recommendation === "BLOCK")  throw 409 PREFLIGHT_BLOCKED;
if (Date.now() - r.createdAt.getTime() > 24*3600*1000) throw 409 PREFLIGHT_EXPIRED;
// pass → update status=PUBLISHED, publishedAt=now()
```

### GET `/drafts/:id/reviews?limit=10&stage=PREFLIGHT` — 历史审核

**Auth**: assertAuthor。**Response**: `Review[]`,desc by createdAt。Phase 2.3 前端只用 lastReview,这个端点先做出来给 Phase 2.4 用。

## §4 Prompt 体系扩展

### 数据库

- enum `DraftToolType` 加 `SAFETY_REVIEW` / `QUALITY_REVIEW`(Prisma migration:`prisma migrate dev`,会自动 alter type)
- seed 脚本加 2 条 starter:
  - SAFETY_REVIEW:systemPrompt 强约束输出 JSON `{dimensions: [{key, score, severity, hits, reason}]}`,要求逐维度独立判断,温度 0.0
  - QUALITY_REVIEW:systemPrompt 强约束输出 JSON `{dimensions: [{key, score, reason}]}`,4 维各 1-2 句 reason,温度 0.4

### 服务层守卫

`PromptsService.copyToPrivate`:

```ts
if ([DraftToolType.SAFETY_REVIEW, DraftToolType.QUALITY_REVIEW].includes(source.tool)) {
  throw new BadRequestException("此 Prompt 由平台独占,不可复制为私人副本");
}
```

落实 PRD §4.7.2"作者**不可见、不可修改**"硬隔离。

`ToolsService.invoke` 不动 — SAFETY_REVIEW / QUALITY_REVIEW 不走 `/tools/invoke` 路径,只被 `ReviewService` 内部 `findDefaultByTool` 用。

### `PromptsController.list` 过滤

平台 prompt 列表 API 默认隐藏 SAFETY_REVIEW / QUALITY_REVIEW(作者 UI 看不到):`where: { owner: "PLATFORM", tool: { notIn: [SAFETY_REVIEW, QUALITY_REVIEW] } }`。这个过滤只在 list 端点,findDefaultByTool 仍能拿到。

## §5 前端组件树

### 新增组件

- `apps/web/src/app/drafts/[id]/_components/PreflightDialog.tsx`
  - props: `{ draftId, open, onClose, onPublished }`
  - 状态机:`idle` →(点"开始预检")→ `loading` → `success(review)` 或 `error(message)`
  - success 状态下点"立即发布" → `usePublishMutation` → 成功跳 `/post/:id`(Phase 2.5 实现详情页,Phase 2.3 占位 404 页)
- `apps/web/src/app/drafts/[id]/_components/ScorePanel.tsx`
  - props: `{ safety: ReviewSafety, quality: ReviewQuality }`
  - 上下两块,每块标题 + overall 大数字 + 维度列表;quality 维度点击 `router.push(`/drafts/${id}?qualityDimension=${key}`)`(由 DraftEditor 读 query 高亮 9 工具卡中的对应一张)
- `apps/web/src/app/drafts/[id]/_components/RecommendationBadge.tsx`
  - ALLOW 绿底"建议发布",WARN 黄底"可发布,有提示",BLOCK 红底"需修改"

### 改动现有组件

- `DraftEditor`:工具栏新增"发布"按钮(替换或补充现有"保存"按钮位),点击 `setPreflightOpen(true)`;读 `searchParams.get("qualityDimension")` → 给 ToolPanel 一个高亮 hint
- `ToolPanel`(若已存在):接受 `highlightedToolKey` prop;Phase 2.3 仅做 CSS 高亮边框,不做"自动 invoke"

### React Query

- `usePreflightMutation(draftId)` → POST /drafts/:id/preflight
- `usePublishMutation(draftId)` → POST /drafts/:id/publish
- 不缓存(每次都新算)

## §6 风险与回滚

| 风险                                   | 概率 | 影响           | 应对                                                                                                                                                                                     |
| -------------------------------------- | ---- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LLM 输出非合法 JSON                    | 中   | preflight 失败 | systemPrompt 强约束 + JSON.parse try/catch + fallback {recommendation:BLOCK, note:"格式异常"} + 前端显示"重试"按钮                                                                       |
| 评分稳定性差(同篇多次方差大)           | 中   | 评委质疑       | Phase 2.3 不做强制评测;memory + spec 显式记 §4.7.3 在 Phase 4 落地;Phase 2.3 提供 modelMeta 字段为后续评测留埋点                                                                         |
| 24h 窗口割裂体验                       | 低   | 改完必须重审   | UI 在 PreflightDialog 头部明示"预检结果 24h 内有效";过期时 publish 409 错误码 PREFLIGHT_EXPIRED 前端友好提示自动重新打开预检                                                             |
| LLM 502 / 超时                         | 中   | preflight 失败 | LlmClient.chat 已 502(Phase 2.2 D6);ReviewService 整体 try/catch 视作 BLOCK,绝不静默放行                                                                                                 |
| Prompt 体系泄露(SAFETY/QUALITY 被复制) | 低   | 安全公信力受损 | copyToPrivate 守卫 + PromptsController.list 过滤双重防御;e2e 用例覆盖"作者尝试复制 SAFETY_REVIEW → 400"                                                                                  |
| Draft 全文过长(超 LLM context)         | 中   | 截断           | Phase 2.3 简单截断:取前 12000 中文字(约 6000 token,留足 prompt + 输出 budget,适配 8K context 的廉价模型);超出部分丢弃,在 modelMeta 里记 `truncated:true`;Phase 2.4 改成 chunked + reduce |

### 回滚

- Schema 改动是纯增量(新表 + 新可空列 + 新 enum 值),Phase 2.2 现有路径完全不受影响
- 服务层 ReviewService 是新模块,出问题 git revert 不影响其他 service
- 前端 PreflightDialog 是新组件,不接入路由根节点,出问题"发布"按钮可以临时降级回直接 publish(Phase 2.3 实施时给一个 feature flag `NEXT_PUBLIC_PREFLIGHT_ENABLED` 兜底,默认 true)

## §7 估时与 Task 分解

| #   | Task                                      | 主要产出                                                                                                                                                 | 估时 |
| --- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| T1  | Prisma schema 增量                        | Review 表 + Draft.lastReviewId + 2 个 enum + migration                                                                                                   | 0.5d |
| T2  | shared 类型 + Prompts 守卫 + seed         | review.ts 类型源、copyToPrivate 守卫、SAFETY/QUALITY starter 2 条、PromptsController.list 过滤                                                           | 0.5d |
| T3  | ReviewService 编排 + 单测                 | findDefaultByTool 取 prompt → Promise.all → 解析 → 推 recommendation → tx 写入;单测 happy / JSON 失败 / high → BLOCK / medium → WARN / quality<60 → WARN | 0.5d |
| T4  | ReviewsController + e2e                   | POST /drafts/:id/preflight、GET /drafts/:id/reviews;e2e 4 条                                                                                             | 0.5d |
| T5  | DraftsService.publish 状态机 + e2e        | publish 加 lastReview 校验;e2e 4 条(无 preflight / BLOCK / EXPIRED / happy)                                                                              | 0.5d |
| T6  | 前端 PreflightDialog + ScorePanel + Badge | 3 组件 + 2 mutations + DraftEditor 集成"发布"按钮 + qualityDimension 高亮 hint                                                                           | 1d   |
| T7  | 占位 /post/[id] 路由                      | Phase 2.5 实详情;Phase 2.3 仅一个 "已发布,详情页 Phase 2.5 实现" 占位                                                                                    | 0.2d |
| T8  | README 小节 + 全仓静态五连绿              | "Phase 2.3 发布前审核"小节 + lint/typecheck/test/build/format 全绿 + e2e ≥ 49 条                                                                         | 0.3d |

**总计**: ~ 4d 实施 + 0.5d 评审/手测,符合 roadmap 中 2-3 天的偏紧估算(主要因 Schema 改动比预期更稳)。

## §8 决策溯源

四条核心决策见 memory `project_phase2_3_decisions.md`,本 spec 不重复理由,只引用结论:

- D-A1:Review 表(一对多)→ 本 spec §2
- D-A2:2 次 LLM 并发 → 本 spec §3 preflight 编排第 3 步
- D-A3:preflight/publish 拆 + 24h 窗口 → 本 spec §3 publish 校验
- D-A4:Prompt 表 PLATFORM owner + 2 个新 tool 枚举 + copyToPrivate 守卫 → 本 spec §4

## §9 验收标准

- [ ] `pnpm lint` / `pnpm typecheck` / `pnpm test` / `pnpm build` / `pnpm format:check` 全绿
- [ ] e2e ≥ 49 条全绿(Phase 2.2 末态 41 + Phase 2.3 ≥ 8)
- [ ] 浏览器手测 8 步:登录 → 进草稿 → 写少量内容 → 点发布 → 弹窗出分 → 切到"读者体验 65"跳工作台高亮 → 改完回来重新预检 → 点立即发布 → 跳占位 /post/:id
- [ ] memory 更新:`project_bytedance_aigc_creator_platform.md` 进度块加 Phase 2.3 ship 记录
- [ ] git:Conventional Commits / PR-per-task / squash-and-merge / commitlint body-max-line-length 100
