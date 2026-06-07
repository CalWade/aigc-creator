# Phase 2.6 — 发布后审核 + 闭环 设计文档

> 状态:Spec 待用户审稿 → Plan → Implementation
>
> 范围:PRD §4.1.5 第 1 路径(用户举报)+ §4.2 分级响应处置(OFFLINE / WARN / DISMISS)+ Phase 2.5 SectionReviewCard 3 按钮接通(重新生成 / 修改建议 / 仍要保留)。**不包含** §4.1.5 第 2 / 3 路径(平台抽样巡检 / 规则更新批量复审,推到后续 phase)。

---

## 0. 上下文与依赖

**上游已 ship**:

- Phase 2.3 — `Review` 表(一对多)+ `Draft.status / publishedAt / lastReviewId` + 发布前审核 + 4 维质量分
- Phase 2.4 — `feed` 模块(信息流 / 双榜单 / `/post/:id` / `/me/works`)+ `PostStat` 表占位(report 字段已有)
- Phase 2.5 — 三阶段审核(① Prompt / ② 输入 / ③ 生成中)+ 7 类目规则库 + Aho-Corasick 词扫 + ProseMirror decoration

**Phase 2.6 增量(本 spec)**:

- 用户举报已发布稿件 → admin 复审(LLM 推荐 + 人工裁决)→ 处置(OFFLINE 强制下线 / WARN 警告 / DISMISS 驳回)
- 状态机扩展:`DraftStatus.OFFLINE`(对应 PRD §3.3.4 平台强制下线)
- Phase 2.5 留下的 SectionReviewCard 3 个 placeholder 按钮真正接通

**显式不做**(本 phase 范围外):

- 平台抽样巡检(PRD §4.1.5 第 2 路径,需 cron / queue)
- 规则更新批量复审(PRD §4.1.5 第 3 路径,需历史数据再处理 pipeline)
- 误判反馈队列 / 周报(PRD §4.5,需独立闭环)
- 通知中心(PRD §6.2,本 phase 用 `Draft.offlineReason` 文本兜住,作者在 `/me/works` 看角标)
- T14 / T15 PE 尾巴(规则库 yaml 内容补全 + safety-eval 标注集 350 条 + 实测准确率报告)

---

## 1. 决策表(brainstorming 已拍板)

| ID       | 决策          | 选项                                                                                                                                                 |
| -------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-2.6.1  | 范围          | A 极简:仅举报 + 处置 + SectionReviewCard 接通                                                                                                        |
| D-2.6.2  | 举报主体      | 仅登录用户;`@@unique([reporterId, postId])` 防灌水                                                                                                   |
| D-2.6.3  | 自举禁止      | 不在后端校验;前端 UI 在作者本人页面隐藏举报按钮                                                                                                      |
| D-2.6.4  | 举报理由分类  | Phase 2.5 的 7 类目 + `other`,共 8 项,新建 `ReportCategory` enum                                                                                     |
| D-2.6.5  | 处置粒度      | 三态 `OFFLINE` / `WARN` / `DISMISS`(对应 §4.2 高 / 中 / 低 + 驳回兜底)                                                                               |
| D-2.6.6  | 复审方式      | LLM 复审给推荐 + 人工最终裁决                                                                                                                        |
| D-2.6.7  | 谁人工复审    | env `ADMIN_HANDLES` 白名单(0 依赖,3 周内不堆 RBAC)                                                                                                   |
| D-2.6.8  | 状态机扩展    | `DraftStatus` 加 `OFFLINE`;feed.service `where status='PUBLISHED'` 天然过滤                                                                          |
| D-2.6.9  | 通知方式      | **不**建 Notification 表(留给后续);用 `Draft.offlineReason` + `Draft.offlineAt` 让作者在 `/me/works` 看角标                                          |
| D-2.6.10 | Report schema | `Report{ id, postId, reporterId, category, reason?, status, resolution?, resolverId?, llmRecommendation?, llmReason?, createdAt, resolvedAt? }`      |
| D-2.6.11 | 端点形态      | `POST /posts/:id/reports` / `GET /me/reports` / `GET /admin/reports` / `POST /admin/reports/:id/resolve` / `POST /drafts/:id/sections/regenerate`    |
| D-2.6.12 | 3 按钮接通    | 重新生成 → `/sections/regenerate` 部分重做;修改建议 → 调既有 `REWRITE_FLUENT` 工具卡;仍要保留 → 仅前端关闭                                           |
| D-2.6.13 | 重新生成实现  | 复用 `POST /drafts/:id/sections/stream`,在既有 `SectionsStreamDto` body 加可选 `headings?: string[]` 字段(既有端点是 `@Body()` 不是 query,详见 §3.6) |
| D-2.6.14 | admin 鉴权    | `AdminGuard`:从 JWT `user.handle` 比对 `process.env.ADMIN_HANDLES.split(",")`                                                                        |
| D-2.6.15 | fixtures      | seed 加 3 条 Report(PENDING / RESOLVED-OFFLINE / RESOLVED-DISMISS 各一)                                                                              |
| D-2.6.16 | e2e 增量      | reports / admin-reports / me-reports / sections-regenerate,~80 用例                                                                                  |
| D-2.6.17 | PE 尾巴绑定   | 不绑定;T14 / T15 在本 phase 之外,PE 自行补                                                                                                           |

---

## 2. 数据模型

### 2.1 Prisma schema 变更

**新增 enum**:

```prisma
enum ReportCategory {
  POLITICS
  PORNOGRAPHY
  GAMBLING
  DRUGS
  VULGARITY
  FRAUD
  MEDICAL
  OTHER       // 第 8 项,用于"举报理由不在 7 类目中"
}

enum ReportStatus {
  PENDING        // 等待 admin 复审
  RESOLVED       // 已处置
}

enum ReportResolution {
  OFFLINE        // 强制下线 (高危)
  WARN           // 站内警告 (中危,内容仍在线)
  DISMISS        // 驳回举报 (低危/误报)
}
```

**`DraftStatus` 加 `OFFLINE`**:

```prisma
enum DraftStatus {
  DRAFT
  PUBLISHED
  OFFLINE       // 新增:平台强制下线(§3.3.4 已下线态)
}
```

**`DraftToolType` 加 `POST_PUBLISH_REVIEW`**(§4 新 starter Prompt 用,`Prompt.tool` 字段是该 enum):

```prisma
enum DraftToolType {
  // 既有 9 工具 + SAFETY_REVIEW / QUALITY_REVIEW / PROMPT_REVIEW / SECTION_REVIEW 全部保留
  POST_PUBLISH_REVIEW   // 新增:发布后举报复审 LLM 用
}
```

**`Draft` 加 2 个可空字段 + 反向关系**:

```prisma
model Draft {
  // 既有字段不变
  offlineReason String?   @db.Text   // 下线原因(给作者看,200 字内)
  offlineAt     DateTime?            // 下线时间
  reports       Report[]             // 反向关系
}
```

**新表 `Report`**:

```prisma
model Report {
  id                  String                  @id @default(cuid())
  postId              String                  // = Draft.id
  reporterId          String                  // = User.id
  category            ReportCategory
  reason              String?                 @db.Text   // 自由文本(可选)
  status              ReportStatus            @default(PENDING)
  resolution          ReportResolution?
  resolverId          String?                 // admin 的 user id
  llmRecommendation   ReviewRecommendation?   // ALLOW / WARN / BLOCK,异步回填
  llmReason           String?                 @db.Text   // LLM 给的简短说明(2-3 句)
  createdAt           DateTime                @default(now())
  resolvedAt          DateTime?

  post                Draft                   @relation(fields: [postId], references: [id], onDelete: Cascade)
  reporter            User                    @relation("UserReports", fields: [reporterId], references: [id], onDelete: Cascade)

  @@unique([reporterId, postId])    // 一人一篇一次,防灌水
  @@index([postId, status])         // 作者侧 list 用
  @@index([status, createdAt])      // admin 列表分页用
  @@map("reports")
}
```

**`User` 加反向关系**:

```prisma
model User {
  // 既有
  reports Report[] @relation("UserReports")  // 新增
}
```

### 2.2 Migration

文件:`apps/api/prisma/migrations/20260607XXXXXX_phase26_report_model_and_offline_status/migration.sql`

变更点:

1. `CREATE TYPE "ReportCategory" / "ReportStatus" / "ReportResolution"`
2. `ALTER TYPE "DraftStatus" ADD VALUE 'OFFLINE'`
3. `ALTER TYPE "DraftToolType" ADD VALUE 'POST_PUBLISH_REVIEW'`
4. `ALTER TABLE "drafts" ADD COLUMN "offlineReason" TEXT`、`ADD COLUMN "offlineAt" TIMESTAMP(3)`
5. `CREATE TABLE "reports" (...)` + 2 个外键 + `@@unique` + 2 个 index

### 2.3 Shared 类型(`packages/shared/src/`)

新建 `report.ts`:

```ts
export const REPORT_CATEGORIES = [
  "POLITICS",
  "PORNOGRAPHY",
  "GAMBLING",
  "DRUGS",
  "VULGARITY",
  "FRAUD",
  "MEDICAL",
  "OTHER",
] as const;

export type ReportCategory = (typeof REPORT_CATEGORIES)[number];

export const REPORT_CATEGORY_LABELS: Record<ReportCategory, string> = {
  POLITICS: "涉政",
  PORNOGRAPHY: "涉黄",
  GAMBLING: "涉赌",
  DRUGS: "涉毒",
  VULGARITY: "低俗",
  FRAUD: "欺诈",
  MEDICAL: "医疗误导",
  OTHER: "其他",
};

export interface ReportDto {
  id: string;
  postId: string;
  postTitle: string; // 反查 Draft.title 拼出
  reporterId: string;
  reporterHandle: string;
  category: ReportCategory;
  reason: string | null;
  status: "PENDING" | "RESOLVED";
  resolution: "OFFLINE" | "WARN" | "DISMISS" | null;
  llmRecommendation: "ALLOW" | "WARN" | "BLOCK" | null;
  llmReason: string | null;
  createdAt: string; // ISO
  resolvedAt: string | null;
}

export interface CreateReportInput {
  category: ReportCategory;
  reason?: string;
}

export interface ResolveReportInput {
  resolution: "OFFLINE" | "WARN" | "DISMISS";
  note?: string;
}
```

`packages/shared/src/index.ts` 追加 `export * from "./report";`。

**`PostDetailDto` 不扩 OFFLINE 字段**:§6.6 已决定 `getPostDetail` 对 OFFLINE 仍返 null(对外 404),前端永远拿不到 OFFLINE 详情,所以 PostDetailDto 不需要加 status / offlineReason / offlineAt 字段(避免死分支)。OFFLINE 信息只在 MeWorksItem 上携带,**作者本人**走 `/drafts/[id]` 编辑视图查看。`packages/shared/src/post.ts` 的 `PostDetailDto` 维持现状不动。

**`MeWorksItem` 抽到 shared**(当前 `feed.service.getMyWorks` 返结构内联,前端各自定义,本 phase 顺手抽公共类型):

```ts
// packages/shared/src/post.ts 新增
export interface MeWorksItem {
  id: string;
  title: string;
  status: "DRAFT" | "PUBLISHED" | "OFFLINE"; // 扩 OFFLINE
  mode: "FAST" | "QUALITY";
  publishedAt: string | null; // ISO
  updatedAt: string; // ISO
  qualityOverall: number;
  recommendation: "ALLOW" | "WARN" | "BLOCK" | null;
  offlineReason: string | null; // 新增
  offlineAt: string | null; // 新增,ISO
}
```

后端 `feed.service.getMyWorks` 返回值 `Promise<MeWorksItem[]>` 显式标注;前端 `/me/works` 页面 import 使用。

---

## 3. 端点设计

### 3.1 端点总表

| 方法 | 路径                                             | 鉴权                   | 用途                                |
| ---- | ------------------------------------------------ | ---------------------- | ----------------------------------- |
| POST | `/posts/:id/reports`                             | UserGuard              | 用户举报已发布稿件                  |
| GET  | `/me/reports?limit=20&cursor=`                   | UserGuard              | 作者看自己稿件被举报记录            |
| GET  | `/admin/reports?status=PENDING&limit=20&cursor=` | UserGuard + AdminGuard | admin 工作台列表                    |
| POST | `/admin/reports/:id/resolve`                     | UserGuard + AdminGuard | 处置 OFFLINE / WARN / DISMISS       |
| POST | `/drafts/:id/sections/regenerate`                | UserGuard              | SectionReviewCard 重新生成,SSE 复用 |

### 3.2 POST /posts/:id/reports

**Request body**:

```ts
{ category: ReportCategory; reason?: string }
```

**校验**:

- `class-validator`:`category` 必填且 ∈ enum;`reason` 可选,maxLength 500
- post 必须存在且 `status === PUBLISHED`(`OFFLINE` 不允许再举报,400 `POST_NOT_PUBLISHED`)
- `@@unique(reporterId, postId)` 冲突 → 409 `REPORT_DUPLICATE`

**副作用**:

1. `prisma.report.create` 写 PENDING 行
2. fire-and-forget 调 `reviewService.reviewPostPublish(postText)` → 完成后 `update report.llmRecommendation/llmReason`(失败静默,不阻塞)
3. `prisma.postStat.upsert { report: { increment: 1 } }`(顺手累计 PostStat.report 计数,Phase 2.4 已建表占位)

**Response 200**:`{ reportId: string }`

### 3.3 GET /me/reports

返作者本人发布的稿件被举报的记录(reporter 视角不开放,避免泄露举报者隐私)。

query:`limit?: number = 20`、`cursor?: string`(base64 `{ createdAt, id }`)

返:`{ items: ReportDto[]; nextCursor: string | null }`

WHERE:`post.authorId = user.sub`,按 `createdAt DESC` 排。

### 3.4 GET /admin/reports

query:`status?: PENDING | RESOLVED | ALL = PENDING`、`limit?: number = 20`、`cursor?: string`

返:`{ items: ReportDto[]; nextCursor: string | null }`

排序:`createdAt DESC`(用 `[status, createdAt]` 复合 index)。

### 3.5 POST /admin/reports/:id/resolve

**Request body**:

```ts
{ resolution: "OFFLINE" | "WARN" | "DISMISS"; note?: string }
```

**校验**:

- report 必须存在且 `status === PENDING`(已 RESOLVED → 409 `REPORT_ALREADY_RESOLVED`)
- resolution ∈ 3 选 1

**OFFLINE 处置事务**:

```ts
await prisma.$transaction([
  prisma.report.update({
    where: { id },
    data: {
      status: "RESOLVED",
      resolution: "OFFLINE",
      resolverId: admin.sub,
      resolvedAt: new Date(),
    },
  }),
  prisma.draft.update({
    where: { id: report.postId },
    data: {
      status: "OFFLINE",
      offlineAt: new Date(),
      offlineReason: buildOfflineReason(report.category, note),
    },
  }),
]);
```

**WARN 处置**:仅写 Report.RESOLVED + resolution=WARN + note,**不动 Draft**。

**DISMISS 处置**:仅写 Report.RESOLVED + resolution=DISMISS + note(可空),不动 Draft。

`buildOfflineReason(category, note)`:`"${REPORT_CATEGORY_LABELS[category]}:${note ?? "举报核实违规"}"`,truncate 到 500。

**Response 200**:`{ ok: true }`

### 3.6 POST /drafts/:id/sections/regenerate

Phase 2.5 SectionReviewCard "重新生成"按钮的服务端落点。

**两种实现取舍**:

1. **复用既有 `/sections/stream`** + body 加 `headings: string[]`(可选)只重生指定 heading 段 — 选这个,延伸最小
2. 新建独立端点 — 否决,outline.service 等代码会重复

**所以本 spec 决定**:不新建端点,改造既有 `POST /drafts/:id/sections/stream`。该端点用 `@Body() dto: SectionsStreamDto`(query 不行,既有 DTO 已是 body),DTO 加可选 `headings?: string[]`,装饰器:

```ts
@IsOptional()
@IsArray()
@IsString({ each: true })
@ArrayMaxSize(50)
headings?: string[];
```

后端 sections.service 在循环里跳过 `headings && !headings.includes(s.heading)` 的段(`headings` 缺省 = 全量重生,保持向后兼容)。

_注:决策表 D-2.6.13 已改正为 body 字段,与本节一致。_

### 3.7 错误码表

| HTTP | code                      | 触发                                   |
| ---- | ------------------------- | -------------------------------------- |
| 400  | `POST_NOT_PUBLISHED`      | 举报非 PUBLISHED 稿件(DRAFT / OFFLINE) |
| 400  | `INVALID_RESOLUTION`      | resolution 不在 3 选 1                 |
| 401  | (默认)                    | 未登录                                 |
| 403  | `ADMIN_REQUIRED`          | 非 admin 访问 /admin/\*                |
| 404  | (默认)                    | post 不存在;report 不存在              |
| 409  | `REPORT_DUPLICATE`        | 同 (reporterId, postId) 重复举报       |
| 409  | `REPORT_ALREADY_RESOLVED` | resolve 已 RESOLVED 的 Report          |

所有 409/400 沿 Phase 2.3 publish 风格:平铺 `{code, message}` 在响应顶层(NestJS 的 HttpException 接 object 时自动 spread)。

---

## 4. ReviewService.reviewPostPublish (新方法)

**位置**:`apps/api/src/reviews/review.service.ts`,与 `preflight` / `reviewPrompt` / `reviewSection` 平级。

**签名**:

```ts
async reviewPostPublish(text: string): Promise<{
  recommendation: "ALLOW" | "WARN" | "BLOCK";
  reason: string;            // 2-3 句
  hitCategories: SensitiveCategory[];
}>
```

**实现路径**:

- 复用 Phase 2.5 的 7 类目 prompt(平台保留 Prompt `PROMPT_REVIEW` 不合适 — 那个是 ① 阶段用的;这里**新增第 9 个 starter** `POST_PUBLISH_REVIEW`,在 `prisma:seed` 灌入)
- LlmClient.chat (temperature 0.0) → JSON 严格解析(parser 复用 `parseSafetyOf7Cats`)
- 失败 fallback:返 `{ recommendation: "ALLOW", reason: "LLM 复审失败,默认放行,等待 admin 人工裁决", hitCategories: [] }`
- **不**写 Review 表(Phase 2.6 决定:LLM 推荐落 Report.llmRecommendation/llmReason 字段就够了,不污染 Review 表的 stage 语义)

**调用方**(在 `ReportsService.create` 内):

```ts
const created = await prisma.report.create({...});
// fire-and-forget,失败静默
void this.reviews.reviewPostPublish(postText)
  .then(r => prisma.report.update({
    where: { id: created.id },
    data: { llmRecommendation: r.recommendation, llmReason: r.reason },
  }))
  .catch(() => {});
return { reportId: created.id };
```

**为什么 fire-and-forget 而不是同步等**:举报端点返回时间不应被 LLM 拖慢(对用户体验重要),admin 几分钟后看列表时 LLM 推荐基本已回填。

**`PROMPT_POST_PUBLISH_REVIEW` 的 system prompt 骨架**(放 fixtures.ts):

> "你是一名社区内容复审员,对一篇已发布的图文内容做合规复审。请按 7 类目(politics / pornography / gambling / drugs / vulgarity / fraud / medical)逐项评估,返 JSON `{ recommendation: ALLOW|WARN|BLOCK, reason: string, hitCategories: string[] }`。规则:命中任一高危类目 → BLOCK;边界违规 → WARN;无问题 → ALLOW。reason 控制在 2-3 句中文。"

---

## 5. AdminGuard 实现

**位置**:`apps/api/src/reports/admin.guard.ts`(新模块内,不放到 auth/ 避免污染既有体系)。

```ts
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { JwtPayload } from "../auth/jwt-payload.interface";

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<{ user?: JwtPayload }>();
    if (\!req.user) throw new UnauthorizedException();

    const allow = (process.env.ADMIN_HANDLES ?? "")
      .split(",")
      .map(h => h.trim())
      .filter(Boolean);

    if (\!allow.includes(req.user.handle)) {
      throw new ForbiddenException({ code: "ADMIN_REQUIRED", message: "需要 admin 权限" });
    }
    return true;
  }
}
```

**关键点**:

- AdminGuard **不**自己解 JWT,依赖 UserGuard 已把 JwtPayload 放 `req.user`
- `@UseGuards(UserGuard, AdminGuard)` 顺序敏感 — UserGuard 必须先跑
- `JwtPayload.handle` 字段已存在(Phase 1.4 `auth/jwt-payload.interface.ts` 应该有);如缺,本 phase 顺手补
- env 单一事实源:dev/test 在 `apps/api/test/setup-env.ts`(jest-e2e.json 的 `setupFiles` 指向此文件,**不是 `jest-e2e-setup.ts`**)写 `process.env.ADMIN_HANDLES = "admin"`;production 通过 `.env` 注入
- fixtures 新增独立 admin 用户(handle=`admin`,id=`adminuser000000000000000004`),与 demo-author / tech-author / life-author 三作者**身份隔离**;e2e helpers 扩 `loginAsAdmin(app)` 与既有 `loginAsDemo(app)` 平级

**.env 增量**:

```
ADMIN_HANDLES=admin
```

根级 `.env.example` 同步加占位。

**单测**:

- `admin.guard.spec.ts`:
  - env 含当前 user.handle → ✅ 通过
  - env 不含 → throws ForbiddenException with code
  - req.user 缺失 → throws UnauthorizedException
  - env 空 → throws ForbiddenException(空白名单 = 拒绝所有人)

---

## 6. 前端组件 + 数据流

### 6.1 文件树

```
apps/web/src/
├─ components/post/
│  ├─ ReportButton.tsx          # client island,挂在 /post/[id] 页
│  └─ ReportDialog.tsx          # 弹窗:8 类目下拉 + reason textarea + 提交
│
├─ app/post/[id]/page.tsx       # SSR,加 <ReportButton postId={id} authorId={...} />
│                                # OFFLINE 状态返 404 走 notFound()
│
├─ app/me/reports/page.tsx      # client,作者看自己稿件被举报列表
├─ app/admin/reports/page.tsx   # client,admin 处置面板
│  └─ _components/
│     ├─ ReportRow.tsx          # 单行:作者 / 类目 / 理由 / LLM 推荐 / Resolve 按钮
│     └─ ResolveDialog.tsx      # OFFLINE / WARN / DISMISS 三选 + note 文本
│
├─ hooks/
│  ├─ use-report.ts             # POST /posts/:id/reports
│  ├─ use-admin-reports.ts      # 列表 + resolve
│  └─ use-section-regenerate.ts # 调既有 sections/stream + headings
│
└─ app/drafts/[id]/_components/
   └─ SectionReviewCard.tsx     # 改 3 按钮回调 (本 phase 关键改动)
```

### 6.2 ReportButton + ReportDialog

**位置**:`/post/[id]` 详情页右上角(替代既有 "← 返回信息流" 旁边)。

**显示规则**:

- 未登录 → 按钮跳 `/login?next=/post/[id]`
- 已登录但 `user.id === authorId` → 隐藏按钮(D-2.6.3 的前端兜底)
- 已登录他人 → 按钮显示,点击弹 ReportDialog

**ReportDialog**:

- 类目下拉 8 项,默认 `OTHER`
- reason textarea,placeholder "请说明问题(选填,最多 500 字)"
- 提交 → POST /posts/:id/reports → 成功 toast "已收到举报,我们会尽快处理"
- 409 REPORT_DUPLICATE → toast "你已经举报过这篇内容"

**hook `use-report.ts`**:apiFetch + 错误码 narrow,返 `{ submit, status, error }`。

### 6.3 /me/reports 页

参照既有 `/me/works` 风格(client + apiFetch + getToken)。

列表项:稿件标题 / 举报类目 / 举报时间 / 处置状态(PENDING 黄 / RESOLVED-OFFLINE 红 / RESOLVED-WARN 橙 / RESOLVED-DISMISS 灰)。

空态:"还没有被举报的稿件。"

### 6.4 /admin/reports 页

参照 `/me/works` 风格,加 admin 校验:

- mounted 时 apiFetch `/admin/reports` → 403 → router.replace("/") + toast "需要 admin 权限"
- tabs:`PENDING(默认)` / `RESOLVED` / `ALL`
- 每行 `<ReportRow>`:
  - 显示稿件标题(点击跳 `/post/[id]` 新窗,即便已 OFFLINE 也用 admin 视角能看到 — 注:本 phase 不开 admin 后台预览,跳 /post/[id] 对 OFFLINE 会 404,可接受)
  - LLM 推荐 badge(ALLOW 绿 / WARN 橙 / BLOCK 红 / null 灰 "等待 LLM")
  - "处置" 按钮 → 弹 ResolveDialog

**ResolveDialog**:

- 单选 OFFLINE / WARN / DISMISS(默认按 LLM 推荐预选:BLOCK→OFFLINE / WARN→WARN / ALLOW→DISMISS)
- note textarea
- 提交 → POST /admin/reports/:id/resolve → 成功 toast → 列表 refresh

### 6.5 /me/works 改造

**显示 OFFLINE 角标**:

- status 三态显示:`DRAFT`(灰)/ `PUBLISHED`(绿)/ `OFFLINE`(红 + ⚠️)
- OFFLINE 项展开看 `offlineReason`(横幅文字)
- 点 OFFLINE 项链接到 `/drafts/[id]`(走作者本人编辑视图,不走 /post/[id])

**后端 `feed.service.getMyWorks` 改造**(spec 必须显式列,verifier 已发现):

- 当前签名 `getMyWorks(userId, status: "DRAFT" | "PUBLISHED" | "ALL", limit)`,内部 `where` 类型 `status?: "DRAFT" | "PUBLISHED"`
- 改为 `status: "DRAFT" | "PUBLISHED" | "OFFLINE" | "ALL"`,where 类型同步加 OFFLINE
- 返回值 map 增字段 `offlineReason: d.offlineReason`、`offlineAt: d.offlineAt?.toISOString() ?? null`
- 返回值类型显式标注 `Promise<MeWorksItem[]>`(§2.3 新增 shared 类型);`d.status` 是 prisma `DraftStatus` enum(`DraftStatus.OFFLINE` 加入后正好三态),与 `MeWorksItem["status"]` 字符串字面量联合等价,TS 不一定能自动 narrow,map 里写 `status: d.status as MeWorksItem["status"]` 兜一下
- `me-works` query DTO(`apps/api/src/feed/me-works.dto.ts`)的 `status` 联合同步扩

### 6.6 /post/[id] OFFLINE 处理

`feed.service.getPostDetail` 当前 L109 已 `if (draft.status !== "PUBLISHED") return null;`,加 OFFLINE 后**仍然返 null**(§3.3.4 PRD 要求 OFFLINE 内容对外不可见),前端 `app/post/[id]/page.tsx` 走 `notFound()` → 404。**作者本人**想看 OFFLINE 稿件走 `/drafts/[id]` 编辑视图(getDraft 不走这个 where)。

### 6.7 SectionReviewCard 3 按钮接通

```tsx
// onRegenerate (改非占位)
const regen = useSectionRegenerate();
onRegenerate={async (item) => {
  // headings 由 SectionStream 父组件传下来,包含违规段的 heading 文本
  await regen.start(draftId, [item.heading]);
  // 重生流式跑完,review.dismiss(item) 隐藏卡片
  review.dismiss(item);
}}

// onSuggest (改非占位)
const tools = useToolInvoke();
onSuggest={async (item) => {
  const result = await tools.invoke({
    draftId,
    tool: "REWRITE_FLUENT",
    payload: { text: textOfRange(editor, item.range) },
  });
  // 把候选展示在卡片下方(复用 ToolCandidateCard 的 3 态)
  // Phase 2.6 简化:直接 alert 第一个候选,作者复制粘贴(避免再做一层 UI 状态机)
  alert(result.candidates[0]?.text ?? "无建议");
}}

// onKeep (维持占位语义)
onKeep={(item) => review.dismiss(item)}    // 仅前端关闭卡片
```

**why "修改建议" 用 alert 而不接 ToolCandidateCard**:Phase 2.5 的 ToolCandidateCard 设计是 9 工具卡通用 UI,接进 SectionReviewCard 需要把"采用候选"逻辑串到 PM editor 的 range replace,工程量超出 Phase 2.6 范围。本 phase 用 alert + 复制是最小可用接通,Phase 2.7 再升级。

**`SectionReviewCard` Props 接口同步改动**(verifier R4 已点出涟漪):

当前 `apps/web/src/app/drafts/[id]/_components/SectionReviewCard.tsx` 的 Props:

```ts
interface Props {
  item: SectionReviewItem;
  onRegenerate: (range: { from: number; to: number }) => void;
  onSuggest: () => void;
  onKeep: () => void;
}
```

**改成**:

```ts
interface Props {
  item: SectionReviewItem;
  onRegenerate: (item: SectionReviewItem) => void | Promise<void>;
  onSuggest: (item: SectionReviewItem) => void | Promise<void>;
  onKeep: (item: SectionReviewItem) => void;
}
```

- `onRegenerate / onSuggest` 入参从 `range` 改成整个 `item`(因为父组件回调里需要 `item.heading` 重新生成、`item.range` 取文本送 REWRITE_FLUENT,统一传 item 后两边都能拿)
- 返回类型加 `| Promise<void>` 让父传 async 函数类型对齐
- 子组件 `<button onClick>` 内部不需要 await(`async => Promise<void>` 内部自己 await,fire-and-forget 即可)
- `onKeep` 维持同步,补 `item` 入参以便父组件 dispatch
- **onClick 调用点同步改写**:Props 改成 `(item) =>` 后,子组件 `<button onClick={onRegenerate}>` 这种直接绑会把 React MouseEvent 当 item 传,要改 `<button onClick={() => onRegenerate(item)}>`,onSuggest / onKeep 同理

**`SectionReviewItem` 加 `heading` 字段 + 数据流**(verifier 已点出现有字段不够):

当前 `apps/web/src/hooks/use-section-review.ts` 的 `SectionReviewItem` 仅 `{ range, result }`,**无 heading**。`reviewSection` 调用方在 `SectionStream` 父组件,该组件 import `useStreamingGeneration`,后者 `onSectionStart` callback 已经携带 `{ index, heading }`(`use-streaming-generation.ts:9`)。但 section-review 的触发点是 `onSectionEnd`(段落结束才送审),那时的 heading 需要从 sections 数组按 index 反查或事先存。

**确定方案**:

1. `SectionReviewItem` 加 `heading: string` 字段
2. `reviewSection` 入参加 `heading: string`,父组件在调用前从 `useStreamingGeneration` 的 sections 状态里按 range 对应的 index 取 heading 传入
3. `setItems` 把 heading 一并存入 item
4. SectionReviewCard 重新生成回调:`await regen.start(draftId, [item.heading])`,把单个 heading 数组传给 `/sections/stream` 的 `headings` body 字段

`use-section-regenerate.ts` hook 内部就是封装一次 `streamFetch` 调 `/drafts/:id/sections/stream` POST + body `{ outline, headings: [item.heading] }`(outline 复用当前 draft 已存的 outline,从 OutlinePanel 父组件取)。
