# Phase 2.6 — 发布后审核 + 闭环 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Phase 2.5 三阶段审核之上,接通发布后举报闭环(用户举报 → LLM 推荐 → admin 处置 OFFLINE/WARN/DISMISS),并把 Phase 2.5 SectionReviewCard 留下的 3 个 placeholder 按钮真正接通(重新生成 / 修改建议 / 仍要保留)。

**Architecture:** 新增 `Report` 表(@@unique 防灌水)+ `DraftStatus.OFFLINE` 三态 + 独立 admin 用户(`handle=admin`)+ AdminGuard 走 env `ADMIN_HANDLES` 白名单;LLM 复审走 fire-and-forget 不阻塞举报端点;复用既有 `/sections/stream` 加可选 `headings?: string[]` 字段做局部重生。

**Tech Stack:** Prisma 5 / NestJS 11 / class-validator / shared 类型 workspace `:*` / Next.js 16 App Router / TipTap 3 / 既有 `loginAsDemo` 模式扩 `loginAsAdmin` / fire-and-forget LLM 副作用。

**关键 spec 引用:** `docs/superpowers/specs/2026-06-07-phase-2-6-post-publish-review-design.md`(608 行,verifier 三轮收敛,R2/R4 已自洽)。

**Phase 2.5 对比基线:** e2e 71 / 单测 94(api 63 + web 31)/ 静态五连全绿。Phase 2.6 完工目标:e2e ≥ 80(本 phase ~10)、单测 ≥ 110(api ~75 + web ~35)。

---

## File Structure(决策锁定)

### 后端新建

- `apps/api/src/reports/reports.module.ts`
- `apps/api/src/reports/reports.controller.ts`(`/posts/:id/reports`、`/me/reports`)
- `apps/api/src/reports/admin-reports.controller.ts`(`/admin/reports*`)
- `apps/api/src/reports/reports.service.ts`
- `apps/api/src/reports/admin.guard.ts` + `admin.guard.spec.ts`
- `apps/api/src/reports/dto/create-report.dto.ts`
- `apps/api/src/reports/dto/resolve-report.dto.ts`
- `apps/api/src/reports/dto/list-reports.dto.ts`
- `apps/api/test/reports.e2e-spec.ts`
- `apps/api/test/admin-reports.e2e-spec.ts`
- `apps/api/test/me-reports.e2e-spec.ts`
- `apps/api/test/sections-regenerate.e2e-spec.ts`

### 后端修改

- `apps/api/prisma/schema.prisma`(enum 4 个、Draft 加 2 字段、Report 表、User 反向关系)
- `apps/api/prisma/migrations/<TS>_phase26_report_model_and_offline_status/migration.sql`
- `apps/api/prisma/fixtures/users.ts`(加 admin 用户)
- `apps/api/prisma/fixtures/prompts.ts`(加 PROMPT_POST_PUBLISH_REVIEW starter)
- `apps/api/prisma/fixtures/reports.ts`(新建,3 条种子)
- `apps/api/prisma/fixtures/index.ts`(applyAllFixtures 接 reports)
- `apps/api/src/reviews/review.service.ts`(加 `reviewPostPublish` 方法)
- `apps/api/src/feed/feed.service.ts`(`getMyWorks` 扩 OFFLINE)
- `apps/api/src/feed/feed.dto.ts`(MeWorksQueryDto 联合扩)
- `apps/api/src/drafts/dto/sections-stream.dto.ts`(加 headings 可选字段)
- `apps/api/src/drafts/sections.service.ts`(headings 跳段循环)
- `apps/api/src/app.module.ts`(注册 ReportsModule)
- `apps/api/test/helpers/auth.ts`(扩 `loginAsAdmin`)
- `apps/api/test/setup-env.ts`(注入 ADMIN_HANDLES=admin)
- `.env.example`(根级 ADMIN_HANDLES=admin 占位)

### shared 新建/修改

- `packages/shared/src/report.ts`(新建)
- `packages/shared/src/post.ts`(加 `MeWorksItem` interface)
- `packages/shared/src/index.ts`(`export * from "./report"`)

### 前端新建

- `apps/web/src/components/post/ReportButton.tsx`
- `apps/web/src/components/post/ReportDialog.tsx`
- `apps/web/src/hooks/use-report.ts`
- `apps/web/src/hooks/use-admin-reports.ts`
- `apps/web/src/hooks/use-section-regenerate.ts`
- `apps/web/src/app/me/reports/page.tsx`
- `apps/web/src/app/admin/reports/page.tsx`
- `apps/web/src/app/admin/reports/_components/ReportRow.tsx`
- `apps/web/src/app/admin/reports/_components/ResolveDialog.tsx`

### 前端修改

- `apps/web/src/app/post/[id]/page.tsx`(挂 ReportButton)
- `apps/web/src/app/me/works/page.tsx`(OFFLINE 角标 + offlineReason 横幅)
- `apps/web/src/app/drafts/[id]/_components/SectionReviewCard.tsx`(Props 接口涟漪)
- `apps/web/src/app/drafts/[id]/_components/SectionStream.tsx`(SectionReviewItem heading 注入 + 3 按钮接通)
- `apps/web/src/hooks/use-section-review.ts`(SectionReviewItem 加 heading)

---

## Task 列表预览

| #   | 标题                                                       | 主体                             | 估时 |
| --- | ---------------------------------------------------------- | -------------------------------- | ---- |
| T1  | Prisma schema + migration                                  | enum 4 个、Draft 字段、Report 表 | 30m  |
| T2  | shared 类型 report.ts + MeWorksItem                        | source-of-truth                  | 20m  |
| T3  | Reports DTO + 错误码 enum                                  | class-validator                  | 15m  |
| T4  | ReviewService.reviewPostPublish                            | LLM 复审 + 7 类目 parser 复用    | 40m  |
| T5  | seed PROMPT_POST_PUBLISH_REVIEW                            | starter prompt 入 fixtures       | 15m  |
| T6  | AdminGuard 实现 + 4 单测                                   | env 白名单鉴权                   | 25m  |
| T7  | ReportsService + 5 端点 + Module 注册                      | 业务核心                         | 60m  |
| T8  | fixtures admin 用户 + 3 条 Report seed                     | e2e 数据基线                     | 25m  |
| T9  | reports/admin-reports/me-reports e2e                       | 后端集成验收                     | 60m  |
| T10 | feed.service getMyWorks 扩 OFFLINE + DTO 联合              | 状态机扩 OFFLINE 涟漪            | 30m  |
| T11 | sections/stream DTO 加 headings + service 跳段 + e2e       | 接通"重新生成"后端               | 45m  |
| T12 | 前端 ReportButton + ReportDialog + use-report hook         | 详情页举报入口                   | 40m  |
| T13 | 前端 /me/reports 页                                        | 作者侧举报记录                   | 40m  |
| T14 | 前端 /admin/reports 页 + ResolveDialog                     | admin 工作台                     | 60m  |
| T15 | 前端 /me/works 改造 OFFLINE 角标                           | 作者侧 OFFLINE 可见              | 30m  |
| T16 | SectionReviewCard Props 涟漪 + heading 数据流 + 3 按钮接通 | Phase 2.5 收尾                   | 50m  |
| T17 | README + 静态五连 + push origin                            | 收尾                             | 20m  |

---

(以下逐 task 给完整步骤)

<!-- TASKS_BEGIN -->

### T1 — Prisma schema + migration(spec §2.1 / §2.2)

**Files**

- 改 `apps/api/prisma/schema.prisma`
- 新 `apps/api/prisma/migrations/<TS>_phase26_report_model_and_offline_status/migration.sql`

**Steps**

- [ ] schema 新增 3 个 enum:`ReportCategory`(8 项,含 OTHER)、`ReportStatus`(PENDING/RESOLVED)、`ReportResolution`(OFFLINE/WARN/DISMISS)。
- [ ] `DraftStatus` 加 `OFFLINE`;`DraftToolType` 加 `POST_PUBLISH_REVIEW`。
- [ ] `Draft` 加 `offlineReason String? @db.Text` + `offlineAt DateTime?` + `reports Report[]` 反向关系。
- [ ] 新建 `Report` 表:字段对齐 spec §2.1,`@@unique([reporterId, postId])`、`@@index([postId, status])`、`@@index([status, createdAt])`、`@@map("reports")`。
- [ ] `User` 加 `reports Report[] @relation("UserReports")`。
- [ ] `pnpm --filter @bytedance-aigc/api prisma migrate dev --name phase26_report_model_and_offline_status`,检查生成的 SQL 含 5 项变更(spec §2.2)。
- [ ] `pnpm --filter @bytedance-aigc/api prisma generate`(防 CI 漏 generate)。
- [ ] 五连本地全绿:`pnpm lint && pnpm typecheck`。

---

### T2 — shared 类型 report.ts + MeWorksItem(spec §2.3)

**Files**

- 新 `packages/shared/src/report.ts`
- 改 `packages/shared/src/post.ts`(加 `MeWorksItem`)
- 改 `packages/shared/src/index.ts`

**Steps**

- [ ] `report.ts` 写 `REPORT_CATEGORIES`(8 项 readonly tuple)+ `ReportCategory` 派生类型 + `REPORT_CATEGORY_LABELS`(中文) + `ReportDto` / `CreateReportInput` / `ResolveReportInput`,字段严格对齐 spec §2.3。
- [ ] `post.ts` 追 `MeWorksItem` interface,`status` 联合扩 `OFFLINE`,加 `offlineReason: string | null` + `offlineAt: string | null`。`PostDetailDto` 不动(spec §2.3 备注:OFFLINE 详情仍返 null)。
- [ ] `index.ts` 加 `export * from "./report"`(检查 post.ts 已经在 re-export 列表里)。
- [ ] `pnpm -w typecheck` 全绿;watch shared 子包是否需要 build(monorepo 是 source-import 直跑 ts,通常不需要)。

---

### T3 — Reports DTO + 错误码 enum(class-validator)

**Files**

- 新 `apps/api/src/reports/dto/create-report.dto.ts`
- 新 `apps/api/src/reports/dto/resolve-report.dto.ts`
- 新 `apps/api/src/reports/dto/list-reports.dto.ts`

**Steps**

- [ ] `CreateReportDto`:`@IsIn(REPORT_CATEGORIES)` category + `@IsOptional() @IsString() @MaxLength(500)` reason。
- [ ] `ResolveReportDto`:`@IsIn(["OFFLINE","WARN","DISMISS"])` resolution + `@IsOptional() @MaxLength(200)` note。
- [ ] `ListReportsDto`:`@IsOptional() @IsIn(["PENDING","RESOLVED"])` status + `@IsOptional() @IsInt() @Min(1) @Max(50)` limit(默认 20)+ `@IsOptional() @IsString()` cursor(opaque base64,服务端解 createdAt+id)。
- [ ] 错误码 enum 写在 `reports.service.ts` 头部(REPORT_NOT_FOUND / POST_NOT_PUBLISHED / DUPLICATE_REPORT / NOT_ADMIN / ALREADY_RESOLVED)对齐 spec §3 表。
- [ ] 五连:lint + typecheck + api 单测(此时无新增单测,只确保不破)。

---

### T4 — ReviewService.reviewPostPublish(spec §4)

**Files**

- 改 `apps/api/src/reviews/review.service.ts`

**Steps**

- [ ] 新增 `async reviewPostPublish(postId: string, reportId: string): Promise<void>`,fire-and-forget;失败只 log 不抛(spec §4)。
- [ ] 内部:取 Draft 全文 + 取 Report.category/reason → 调既有 `runLLM(promptId=POST_PUBLISH_REVIEW, vars={...})` → 复用既有 7 类目 parser → 写回 `Report.llmRecommendation` + `Report.llmReason`(2-3 句)。
- [ ] LLM 失败时 `llmRecommendation` 维持 null,admin 端 UI 显示"复审异常"(spec §6.5 已涵盖)。
- [ ] 单测 `apps/api/src/reviews/review.service.spec.ts` 加 3 个 case:正常 ALLOW/WARN/BLOCK 回填、LLM 抛错 swallow、找不到 Report 直接 return。
- [ ] 五连 + `pnpm --filter @bytedance-aigc/api test -- review.service`。

---

### T5 — seed PROMPT_POST_PUBLISH_REVIEW starter prompt

**Files**

- 改 `apps/api/prisma/fixtures/prompts.ts`

**Steps**

- [ ] 新增一条 starter prompt:`tool=POST_PUBLISH_REVIEW`、`isStarter=true`、`ownerId=admin`(T8 才有 admin 用户,这里先写好,T8 一起跑 fixture)。
- [ ] prompt body 沿用 SAFETY_REVIEW 7 类目结构(POLITICS/PORNOGRAPHY/GAMBLING/DRUGS/VULGARITY/FRAUD/MEDICAL),加 `{{reportCategory}}` + `{{reportReason}}` 占位让 LLM 聚焦举报方向。
- [ ] 输出 schema 要求 LLM 返 `{recommendation: ALLOW|WARN|BLOCK, reason: string}`(可被既有 parser 吃)。
- [ ] 单测覆盖在 T4 已加;此处只看 fixture 文件 lint/typecheck 过。

---

### T6 — AdminGuard 实现 + 单测(spec §5)

**Files**

- 新 `apps/api/src/reports/admin.guard.ts`
- 新 `apps/api/src/reports/admin.guard.spec.ts`
- 改 `apps/api/test/setup-env.ts`(注 ADMIN_HANDLES=admin)
- 改根级 `.env.example`(占位 `ADMIN_HANDLES=admin`)

**Steps**

- [ ] `AdminGuard implements CanActivate`:从 `ConfigService.get('ADMIN_HANDLES')` 读逗号分隔白名单 → 与 `req.user.handle` 比对 → 不在则 throw `ForbiddenException('NOT_ADMIN')`(spec §5)。
- [ ] 4 个单测:white-list 命中放行 / 不命中 403 / env 缺失 fail-loud(throw on bootstrap,不静默放行) / handle 大小写敏感对齐 spec §5。
- [ ] `setup-env.ts` 用 `process.env.ADMIN_HANDLES = "admin"` 注入;`.env.example` 写 `ADMIN_HANDLES=admin`(根级,api 服务读取)。
- [ ] 五连 + `pnpm --filter @bytedance-aigc/api test -- admin.guard`。

---

### T7 — ReportsService + 5 端点 + Module 注册(spec §3)

**Files**

- 新 `apps/api/src/reports/reports.module.ts`
- 新 `apps/api/src/reports/reports.controller.ts`(`/posts/:id/reports`、`/me/reports`)
- 新 `apps/api/src/reports/admin-reports.controller.ts`(`/admin/reports*`)
- 新 `apps/api/src/reports/reports.service.ts`
- 改 `apps/api/src/app.module.ts`(注册 ReportsModule)

**Steps**

- [ ] `ReportsService.create(postId, reporterId, dto)`:校验 Draft 存在 + status=PUBLISHED → 失败抛 POST_NOT_PUBLISHED;Prisma `create` 命中 `@@unique` 抛 P2002 时转 DUPLICATE_REPORT(409)。成功后 fire-and-forget 调 `reviewService.reviewPostPublish(postId, report.id).catch(log)`(spec §3.2、§4)。
- [ ] `ReportsService.listMine(userId, dto)`:JOIN Draft 拿 title,where Draft.authorId=userId;cursor 解码 createdAt+id,desc 翻页(spec §3.3)。
- [ ] `ReportsService.listAdmin(dto)`:status 过滤(默认 PENDING),JOIN Draft+reporter 拼 ReportDto.postTitle/reporterHandle(spec §3.4)。
- [ ] `ReportsService.resolve(reportId, adminId, dto)`:tx 内更新 Report(status=RESOLVED, resolution, resolverId, resolvedAt)+ 若 resolution=OFFLINE 则 Draft.status=OFFLINE / offlineReason=note ?? "平台审核下线" / offlineAt=now;ALREADY_RESOLVED 防重(spec §3.5、§3.3.4)。
- [ ] Controller 层挂 `UserGuard` / `AdminGuard`(`/admin/reports*` 双 guard);DTO 用 T3 三件套;返回类型显式 `Promise<ReportDto>` / `Promise<ReportDto[]>`(走 shared)。
- [ ] `ReportsModule` 引 PrismaModule + ReviewsModule(reviewPostPublish 走它);`app.module.ts` imports 加上。
- [ ] 五连 + `pnpm --filter @bytedance-aigc/api test`(此时还没 e2e,只确保 Nest 能 bootstrap)。

---

### T8 — fixtures admin 用户 + 3 条 Report seed

**Files**

- 改 `apps/api/prisma/fixtures/users.ts`
- 新 `apps/api/prisma/fixtures/reports.ts`
- 改 `apps/api/prisma/fixtures/index.ts`

**Steps**

- [ ] `users.ts` 加一条 `{handle: "admin", nickname: "管理员", ...}`(密码走既有 demo 哈希策略);id 写死方便 e2e 引用。
- [ ] `reports.ts` 写 `applyReportFixtures(prisma)`:3 条 seed —— 1 条 PENDING+无 LLM 回填、1 条 PENDING+ LLM 已 BLOCK、1 条 RESOLVED+ DISMISS,引用既有 PUBLISHED Draft + demo 用户。
- [ ] `index.ts` 的 `applyAllFixtures` 顺序加 `await applyReportFixtures(prisma)`(必须在 users / drafts / prompts 之后)。
- [ ] `pnpm --filter @bytedance-aigc/api prisma db seed` 跑通,DB 看到 3 条 reports + admin 用户。
- [ ] e2e helper:改 `apps/api/test/helpers/auth.ts` 扩 `loginAsAdmin()`,模式同 `loginAsDemo`,session 走 admin 用户。

---

### T9 — reports / admin-reports / me-reports e2e

**Files**

- 新 `apps/api/test/reports.e2e-spec.ts`
- 新 `apps/api/test/admin-reports.e2e-spec.ts`
- 新 `apps/api/test/me-reports.e2e-spec.ts`

**Steps**

- [ ] `reports.e2e`:① 普通用户 POST 举报 PUBLISHED 稿件 201 + 返回 ReportDto;② 同人同稿二次举报 409 DUPLICATE_REPORT;③ 举报 DRAFT 状态稿件 422 POST_NOT_PUBLISHED;④ 未登录 401。
- [ ] `me-reports.e2e`:① 作者 GET 看到自己稿件被举报的记录(JOIN 出 postTitle);② 别人的举报记录看不到;③ cursor 翻页正确(种 5 条手测 limit=2 翻 3 页)。
- [ ] `admin-reports.e2e`:① 非 admin 调 `/admin/reports` 403 NOT_ADMIN;② admin GET PENDING 列表正确;③ admin POST `/admin/reports/:id/resolve` resolution=OFFLINE 后 Draft.status=OFFLINE + offlineReason 写入;④ 已 RESOLVED 二次 resolve 422 ALREADY_RESOLVED。
- [ ] 共加 ≥10 个 e2e case,跑 `pnpm --filter @bytedance-aigc/api test:e2e` 全绿。
- [ ] 总 e2e 数 ≥ 81(基线 71 + 本 phase ~10)。

---

### T10 — feed.service.getMyWorks 扩 OFFLINE + DTO 联合

**Files**

- 改 `apps/api/src/feed/feed.service.ts`
- 改 `apps/api/src/feed/feed.dto.ts`

**Steps**

- [ ] `MeWorksQueryDto` 的 `status?` 联合从 `"DRAFT" | "PUBLISHED"` 扩到 `"DRAFT" | "PUBLISHED" | "OFFLINE"`(@IsIn 同步加项)。
- [ ] `getMyWorks` 返回类型显式 `Promise<MeWorksItem[]>`(import shared);select 加 `offlineReason / offlineAt`;status 默认值不变(全部),但允许 status=OFFLINE 过滤。
- [ ] feed.service 单测加 2 个 case:含 OFFLINE 稿件返回结构正确 / status=OFFLINE 过滤只回 OFFLINE。
- [ ] 五连 + 看记忆 `feedback_audit_shared_unions_when_widening_prisma_enum.md` —— 把 grep `"DRAFT" | "PUBLISHED"` 全仓走一遍,确认所有触点都已扩 OFFLINE 或确认不需扩。

---

### T11 — sections/stream DTO 加 headings + service 跳段 + e2e

**Files**

- 改 `apps/api/src/drafts/dto/sections-stream.dto.ts`
- 改 `apps/api/src/drafts/sections.service.ts`
- 新 `apps/api/test/sections-regenerate.e2e-spec.ts`

**Steps**

- [ ] DTO 加 `@IsOptional() @IsArray() @IsString({each:true}) @ArrayMaxSize(20) headings?: string[]`(单次最多重生 20 段防滥用)。
- [ ] `sections.service` 主循环改:若 `dto.headings?.length` 则跳过 `!headings.includes(section.heading)` 的段,只 stream 命中的;不传则维持全文走法(向后兼容 Phase 2.5)。
- [ ] e2e:① 不传 headings 行为不变(回归);② 传 headings=[H2] 只收到 H2 的 SSE 事件;③ headings 含不存在的 heading 时该项忽略(不 422);④ headings 超 20 项 422。
- [ ] 接口路径仍是 `/drafts/:id/sections/stream` 不新增 `/regenerate`(spec §3.6 备注:复用 stream 加可选字段,前端语义层叫 "regenerate")。前端 hook(T16)直接 POST 这个端点带 headings 即可。
- [ ] 五连 + e2e 全绿。

---

### T12 — 前端 ReportButton + ReportDialog + use-report hook(spec §6.1)

**Files**

- 新 `apps/web/src/components/post/ReportButton.tsx`
- 新 `apps/web/src/components/post/ReportDialog.tsx`
- 新 `apps/web/src/hooks/use-report.ts`
- 改 `apps/web/src/app/post/[id]/page.tsx`

**Steps**

- [ ] `use-report.ts`:暴露 `useCreateReport()` mutation,POST `/api/posts/:id/reports`,body 是 `CreateReportInput`(走 shared);成功 toast、409 提示"您已举报过该稿件"、422 POST_NOT_PUBLISHED 提示"该稿件不可举报"。
- [ ] `ReportDialog`:8 项 category radio(`REPORT_CATEGORY_LABELS` 渲染中文)+ reason `<textarea maxLength={500}>` + 提交/取消两按钮;未登录跳登录或 disable 按 spec §6.1。
- [ ] `ReportButton`:小图标按钮,只在 `post.status === "PUBLISHED"` 且不是作者本人时显示(从 detail page 拿 post.authorId 比对当前 session)。
- [ ] `/post/[id]/page.tsx`:在头部操作区挂 `<ReportButton postId={post.id} authorId={post.authorId} />`。
- [ ] 五连 + 手测:挂 demo 用户登录,举报一篇别人的 PUBLISHED 稿,看 me/reports 页(T13)能看到。
- [ ] 单测:`ReportDialog` 至少 2 个 RTL 用例(渲染所有 category / 提交后调用 mutation);hook 1 个用例(409 返回正确 toast)。

---

### T13 — 前端 /me/reports 页(spec §6.2)

**Files**

- 新 `apps/web/src/app/me/reports/page.tsx`

**Steps**

- [ ] Server Component 直读 cookie + fetch `/api/me/reports?limit=20`(沿用既有 server-fetch helper)。
- [ ] 列表渲染:每行 `postTitle`(链接 `/post/:id`,若 status=OFFLINE 则不可点) + `category 标签` + `reason 摘要 60 字截断` + `状态徽章 PENDING/RESOLVED` + `处置结果 OFFLINE/WARN/DISMISS` + `LLM 推荐 ALLOW/WARN/BLOCK`(灰底小标记,nullable 显示"复审中")+ `createdAt` 相对时间。
- [ ] 空态文案:"还没有人举报你的稿件"。
- [ ] cursor 翻页:Client Component 子组件接 `initialItems` + `initialCursor`,"加载更多"按钮调 `/api/me/reports?cursor=...`。
- [ ] 五连 + 手测翻 3 页(T8 fixture 加多 reports 或手举报多篇)。
- [ ] 入口:在 `/me` 页(若已存在)或 nav 加 "我收到的举报" 链接(确认 nav 实现位置后决定是否本 task 改)。

---

### T14 — 前端 /admin/reports 页 + ResolveDialog(spec §6.3)

**Files**

- 新 `apps/web/src/app/admin/reports/page.tsx`
- 新 `apps/web/src/app/admin/reports/_components/ReportRow.tsx`
- 新 `apps/web/src/app/admin/reports/_components/ResolveDialog.tsx`
- 新 `apps/web/src/hooks/use-admin-reports.ts`

**Steps**

- [ ] `use-admin-reports.ts`:`useAdminReports({status,cursor})` query + `useResolveReport()` mutation(POST `/api/admin/reports/:id/resolve`)。
- [ ] `page.tsx` Server Component:fetch `/api/admin/reports?status=PENDING&limit=20`;非 admin 调 API 拿 403 时整页渲染"无管理员权限",不跳登录(spec §6.3)。
- [ ] `ReportRow`:展开 panel 显示 LLM 推荐 + reason 全文 + post 全文链接(打开新窗到 `/post/:id`,即使 OFFLINE 也允许 admin 预览,后端单独走 admin 视图——本 phase 范围内先用 `/drafts/:id` 编辑视图替代,记 backlog)。
- [ ] `ResolveDialog`:radio 三选一(OFFLINE/WARN/DISMISS) + note `<textarea maxLength={200}>` + 高危确认("此操作会下线该稿件并通知作者"对应 OFFLINE)。
- [ ] mutation 成功 invalidate admin-reports query,行从 PENDING 列表消失 / 跳到 RESOLVED tab。
- [ ] 单测:`ResolveDialog` RTL 1 用例(OFFLINE 时显示高危确认文案)。
- [ ] 五连 + 手测:用 admin 登录处置 1 条,看 PENDING tab 减一 + RESOLVED tab 加一 + 该稿 `/post/:id` 跳 404 / `/me/works` 显示 OFFLINE 角标。

---

### T15 — 前端 /me/works 改造 OFFLINE 角标 + offlineReason 横幅(spec §6.4)

**Files**

- 改 `apps/web/src/app/me/works/page.tsx`

**Steps**

- [ ] import `MeWorksItem`(走 shared);卡片渲染分支加 `status === "OFFLINE"` 显示红底"已下线"角标 + 下方一行 `offlineReason` 文本(若有)。
- [ ] OFFLINE 卡片不出"查看"按钮(避免点进 404),保留"编辑"按钮跳 `/drafts/:id`(作者本人可在编辑视图看全文)。
- [ ] status 过滤 tab 加 OFFLINE 项(三选一 DRAFT/PUBLISHED/OFFLINE)。
- [ ] 五连 + 手测:T14 处置 OFFLINE 后,`/me/works` 切到 OFFLINE tab 看到该稿。
- [ ] 单测:RTL 1 用例(MeWorksItem with status=OFFLINE 渲染红底角标 + offlineReason)。

---

### T16 — SectionReviewCard Props 涟漪 + heading 数据流 + 3 按钮接通(spec §6.5,Phase 2.5 收尾)

**Files**

- 新 `apps/web/src/hooks/use-section-regenerate.ts`
- 改 `apps/web/src/app/drafts/[id]/_components/SectionReviewCard.tsx`(Props 接口)
- 改 `apps/web/src/app/drafts/[id]/_components/SectionStream.tsx`(SectionReviewItem heading 注入 + 接通)
- 改 `apps/web/src/hooks/use-section-review.ts`(SectionReviewItem 加 heading)

**Steps**

- [ ] `SectionReviewItem` 类型加 `heading: string`(use-section-review 解析 SSE 时填入)。
- [ ] `SectionReviewCard.Props` 加 `onRegenerate(heading: string): void` / `onApplySuggestion(heading: string, suggestion: string): void` / `onKeep(heading: string): void`,父级 SectionStream 传入。
- [ ] `use-section-regenerate.ts`:暴露 `useRegenerateSection(draftId)`,调 `/api/drafts/:id/sections/stream` POST 带 `headings: [heading]`(走 T11 的可选字段);返回流式 token,SectionStream 拿来局部替换该段。
- [ ] "重新生成":onRegenerate(heading) → 触发上面 hook,该卡进 streaming 态,完成后清掉旧 review 触发新 review(沿用 Phase 2.5 三阶段流程)。
- [ ] "修改建议":onApplySuggestion(heading, suggestion) → 把 suggestion 写回 TipTap editor 对应段落(用既有 editor.commands API 找 heading 节点替换 body)。
- [ ] "仍要保留":onKeep(heading) → 本地 state 标记 dismissed=true,卡片折叠成"已忽略"提示,不走后端。
- [ ] 五连 + RTL 单测:3 个回调点击各 1 个用例,断言 hook / editor.commands 被正确调用。
- [ ] 手测全流程:打开一份草稿 → 触发 SectionStream → 命中一个 WARN 段 → 三个按钮各点一遍,验证行为符合 spec §6.5。

---

### T17 — README + 静态五连 + push origin

**Files**

- 改 `README.md`(Phase 2.6 小节)
- 改 `docs/superpowers/plans/2026-06-07-phase-2-6-post-publish-review.md`(归档移动)
- 改 `docs/superpowers/specs/2026-06-07-phase-2-6-post-publish-review-design.md`(归档移动)

**Steps**

- [ ] README 加 Phase 2.6 小节:发布后举报闭环(用户 → LLM 推荐 → admin 处置)+ Phase 2.5 SectionReviewCard 3 按钮接通;按记忆 `feedback_no_real_users_means_no_user_metrics_in_report.md` 不写 DAU/留存。
- [ ] 收尾五连(注意 `feedback_ci_prisma_generate_before_static_checks.md`:每个 job 先 prisma generate):`pnpm install && pnpm --filter @bytedance-aigc/api prisma generate && pnpm lint && pnpm typecheck && pnpm test && pnpm --filter @bytedance-aigc/api test:e2e && pnpm build`。
- [ ] 总 e2e ≥ 81 / 单测 ≥ 110(api ~75 + web ~35),不达标定位补测。
- [ ] 按记忆 `feedback_archive_shipped_phase_docs.md`:把本 plan + spec 移到 `docs/superpowers/{plans,specs}/shipped/`。
- [ ] 按记忆 `feedback_commit_message_mixed_language.md` + `feedback_no_claude_in_commits.md`:commit 英文 type/scope + 中文标题 body,不带 Claude 署名。
- [ ] `git push origin main`(用户已点名 main 直推,不走 PR)。

<!-- TASKS_END -->
