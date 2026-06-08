# Phase 2.15 — 发布后二次编辑(PRD §3.3.3)设计

> **Goal:** 已发布稿点「编辑」 → 切回 CloudDraft 但**线上版本仍保留原内容**;新版本编辑完保存提交后进入 Reviewing;通过完整 §4.1.4 PreflightDialog 后,新版本替换线上,旧版本入版本历史。

**对应 PRD 位置:** §3.3.3 发布后二次编辑;§3.4 版本历史。

**前置 Phase:** 2.3 PreflightDialog + publish + lastReview;2.4 信息流(`/post/:id` / `/feed` / `/me/works`);2.7 版本历史(`VersionKind.PUBLISHED` 永不删);2.10 工作台数据看板(PostStat);2.14 乐观锁 baseVersion 与 OFFLINE_CONFLICT 版本。

---

## 1. 需求拆解(PRD §3.3.3 原话锁)

| 编号 | PRD 原话                                   | 落地点                                                                                                                              |
| ---- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| R1   | 已发布内容点「编辑」 → 状态切回 CloudDraft | `POST /drafts/:id/edit` 状态转移 PUBLISHED → DRAFT                                                                                  |
| R2   | 线上版本仍保留原内容                       | `Draft.publishedBody` 双 body 字段;`/post/:id` 改读 `publishedBody`                                                                 |
| R3   | 新版本编辑完保存提交后再次进入 Reviewing   | `publish()` 事务先切 REVIEWING 再切 PUBLISHED(REVIEWING 状态短暂存在)                                                               |
| R4   | 重过完整发布前审核(§4.1.4)                 | 复用现有 `PreflightDialog` + `/preflight` + `lastReview` 24h 校验,无需新代码,只在 `publish()` 二发分支多落一个 `publishedBody` 快照 |
| R5   | 新版本上线后保留旧版本到版本历史           | `VersionKind.PUBLISHED` 已永不删(versions.service.ts L9),零改动                                                                     |
| R6   | 热度是否重置/继承由后台开关控制(默认继承)  | 新增 env `REPUBLISH_HOTNESS_INHERIT=true`,在 `publish()` 二发分支单点判断                                                           |

**不在本 Phase 范围:**

- §3.3.4 OFFLINE → 重新上发(留下个 Phase)
- 多版本 A/B 上线、平行流量切分(YAGNI)
- admin UI 的 hotness 开关(env 已够,UI 是 §3.3.3 之外)

---

## 2. 架构总览

```
┌────────────────────────────────────────────────────────────┐
│                      作者端 /me/works                          │
│   PUBLISHED 卡片  ↔ 双 Action: [查看线上] [继续编辑草稿]            │
│      │                                  │                    │
│      ▼                                  ▼                    │
│   /post/:id                       POST /drafts/:id/edit       │
│   (读 publishedBody)              (PUBLISHED → DRAFT)         │
│                                          │                    │
│                                          ▼                    │
│                                    /drafts/:id (TipTap)       │
│                                    (编辑 body, 不动 publishedBody) │
│                                          │                    │
│                                          ▼                    │
│                                    [发布按钮 → PreflightDialog] │
│                                    POST /drafts/:id/preflight  │
│                                    (现有 §4.1.4 流不变)         │
│                                          │                    │
│                                          ▼ ALLOW/WARN          │
│                                    POST /drafts/:id/publish    │
│                                    (事务: 二发分支)             │
│                                       publishedBody = body     │
│                                       publishedVersion = ver   │
│                                       VersionKind.PUBLISHED 快照│
│                                       status = PUBLISHED       │
│                                       (env=false 时清 PostStat) │
└────────────────────────────────────────────────────────────┘
                                          │
                                          ▼
              ┌──────────────────────────────────────┐
              │       公开端 /post/:id /feed /authors  │
              │      读 publishedBody + publishedAt   │
              │      (REVIEWING 期间也是老线上版本)     │
              └──────────────────────────────────────┘
```

---

## 3. 数据模型变更

### 3.1 schema.prisma 改动

```prisma
enum DraftStatus {
  DRAFT
  REVIEWING       // ← 新增,publish() 事务期间短暂存在
  PUBLISHED
  OFFLINE
}

model Draft {
  id                String      @id @default(cuid())
  authorId          String
  mode              DraftMode   @default(FAST)
  status            DraftStatus @default(DRAFT)
  title             String
  body              Json        // ← 编辑中
  publishedBody     Json?       // ← 新增:线上展示快照(NULL=从未发布)
  publishedTitle    String?     // ← 新增:线上标题快照
  publishedVersion  Int?        // ← 新增:发布瞬间 Draft.version 值,审计/对照用
  version           Int         @default(1)
  publishedAt       DateTime?
  lastReviewId      String?
  offlineReason     String?     @db.Text
  offlineAt         DateTime?
  createdAt         DateTime    @default(now())
  updatedAt         DateTime    @updatedAt
  // ... 关系不变
}
```

**为什么三个 published 字段一起加(不只 body)**:

- `/post/:id` 详情页要显示 `title` + `body` + `publishedAt`;若 title 不快照,二发期间作者改标题立刻泄露到线上
- `publishedVersion` 是审计字段,前端 ConflictBanner 与 admin 调试时用

### 3.2 迁移策略

```sql
-- migration 文件 (prisma migrate dev --name phase_2_15_republish)
ALTER TYPE "DraftStatus" ADD VALUE 'REVIEWING' BEFORE 'PUBLISHED';
ALTER TABLE "drafts" ADD COLUMN "publishedBody" JSONB;
ALTER TABLE "drafts" ADD COLUMN "publishedTitle" TEXT;
ALTER TABLE "drafts" ADD COLUMN "publishedVersion" INTEGER;

-- 数据迁移: 现有 PUBLISHED 行回填 publishedBody = body 兜底
UPDATE "drafts" SET
  "publishedBody"    = "body",
  "publishedTitle"   = "title",
  "publishedVersion" = "version"
WHERE "status" = 'PUBLISHED';
```

WHY 把现有 PUBLISHED 回填:迁移后立刻有 `publishedBody`,`/post/:id` 切到读 `publishedBody` 不会全部 404。

---

## 4. API 变更

### 4.1 新增 `POST /drafts/:id/edit` — 切回编辑态

```ts
// drafts.controller.ts
@Post(":id/edit")
@HttpCode(HttpStatus.OK)
async edit(@Param("id") id: string, @CurrentUser() user: JwtPayload):
  Promise<{ id: string; status: "DRAFT"; version: number }>
```

**service 行为:**

1. `assertAuthor(id, user.sub)` — 非作者 403
2. 校验当前 status === PUBLISHED,否则 409 `{ code: "EDIT_NOT_ALLOWED", message: "仅 PUBLISHED 状态可进入二次编辑" }`
3. `prisma.draft.update({ where:{id}, data:{ status:"DRAFT", version:{increment:1} } })` — version+1 是为了让任何打开中的 /post/:id 端缓存失效自洽
4. 返 `{ id, status: "DRAFT", version }`

**WHY 不修改 body:** 切到 DRAFT 时 body 还是 publishedBody 的内容(初次进入二发,作者从老版本继续改);publishedBody 不动,/post/:id 仍读老版。

**WHY 单独走 endpoint 而非复用 PATCH:** 状态机变更属于「显式动作」,与字段变更不同语义;PATCH 一直是字段变更通道。

### 4.2 修改 `POST /drafts/:id/publish` — 二发分支

```ts
// drafts.service.ts publish()
async publish(id, authorId): Promise<{ id; publishedAt }> {
  await this.assertAuthor(id, authorId);
  const draft = await prisma.draft.findUnique({ where: { id }, include: { lastReview: true }});
  if (!draft) throw NotFoundException;

  // 现有 §4.1.4 校验链不变
  const r = draft.lastReview;
  if (!r || r.stage !== "PREFLIGHT") throw PREFLIGHT_REQUIRED;
  if (r.recommendation === "BLOCK") throw PREFLIGHT_BLOCKED;
  if (Date.now() - r.createdAt.getTime() > 24*3600*1000) throw PREFLIGHT_EXPIRED;

  // ↓↓↓ 新增:二发判定
  const isRepublish = draft.publishedBody !== null;
  const inheritHotness = process.env.REPUBLISH_HOTNESS_INHERIT !== "false"; // 默认继承

  // 现有 PUBLISHED 版本快照逻辑不变
  try { await this.versions.snapshotPublished(id, draft.body); } catch {}

  // 事务一刀切 REVIEWING → PUBLISHED + publishedBody/Title/Version 同步
  const updated = await prisma.$transaction(async (tx) => {
    // REVIEWING 一闪 — 既贴 PRD 文字又给 SSE / 监控可见(可选)
    await tx.draft.update({
      where: { id },
      data: { status: "REVIEWING" },
    });

    // 二发热度重置(env=false 时)
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

**REVIEWING 生命周期:** 仅在事务内一闪而过(单事务的两次 update),DB 行最终落 PUBLISHED;PRD「Reviewing」语义被遵守(LLM 调用瞬间 + 状态写入瞬间都属于 Reviewing 期),无作者侧 UX 暴露。

### 4.3 `/post/:id` 与公开端读法切换

| 端点                                            | 当前读                                             | 改为读                                                                                                        |
| ----------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `GET /post/:id` (`feed.service.getPostDetail`)  | `draft.body` + `draft.title` + `draft.publishedAt` | `draft.publishedBody` + `draft.publishedTitle` + `draft.publishedAt`,两个 fallback 到老字段(兼容回填前的老行) |
| `GET /feed` (`feed.service.findPublishedSlice`) | `body/title`                                       | `publishedBody/publishedTitle` 同上;`status="PUBLISHED" AND publishedBody IS NOT NULL`                        |
| `GET /authors/:id/posts`                        | 同上                                               | 同上                                                                                                          |
| `GET /me/works`                                 | `body` 用作 excerpt                                | 用 `publishedBody ?? body`(作者自查时编辑中态可看 body excerpt)                                               |

**WHY fallback:** 数据迁移已 backfill,但旧测试 fixture / 集成测试 mock 不一定带 publishedBody;fallback 让兼容性弹性更好。

### 4.4 `lastReview` 24h 收紧

无变化 — 二发场景下作者必须重过 PreflightDialog,新 review 创建后 lastReviewId 自动指向新 review,`createdAt` 刷新。原 24h 检查自然约束二发(老 lastReview 不复用)。

---

## 5. 前端变更

### 5.1 `/me/works` 双 Action

```tsx
// apps/web/src/app/me/works/page.tsx
{
  w.status === "PUBLISHED" && (
    <>
      <Link href={`/post/${w.id}`}>查看线上</Link>
      <button onClick={() => handleEdit(w.id)}>继续编辑草稿</button>
    </>
  );
}
{
  w.status === "DRAFT" && <Link href={`/drafts/${w.id}`}>继续编辑草稿</Link>;
}
{
  w.status === "REVIEWING" && <span className="text-zinc-500">审核中…</span>;
}
{
  w.status === "OFFLINE" &&
    // §3.3.4 后续 Phase 处理
    null;
}

async function handleEdit(id: string) {
  const res = await apiFetch(`/drafts/${id}/edit`, { method: "POST" });
  if (res.ok) router.push(`/drafts/${id}`);
  else alert(`无法进入编辑(HTTP ${res.status})`);
}
```

### 5.2 `/drafts/:id` 编辑器横幅

PUBLISHED 二发期间(后端用 status===DRAFT && publishedBody!=null 信号),在编辑器顶部加 `RepublishBanner`:

```tsx
{
  state.kind === "ready" && state.draft.publishedBody != null && (
    <RepublishBanner publishedAt={state.draft.publishedAt} draftId={id} />
  );
}
```

文案:`你正在编辑已发布版本。线上仍保留原版直到你重新发布通过审核。[查看线上 →]`

### 5.3 `GET /drafts/:id` 返回字段补充

api 控制器 `findOne` 返回中追加 `publishedBody / publishedTitle / publishedVersion / publishedAt`,前端 DraftDetail interface 与 RepublishBanner 都用上。

**WHY 不开新端点:** /drafts/:id 已被作者侧 SSR 入口高度依赖,单字段补全比新建 endpoint 损耗小。

---

## 6. 错误码

| 场景                    | code                | HTTP | 触发位置                 |
| ----------------------- | ------------------- | ---- | ------------------------ |
| 非 PUBLISHED 调 `/edit` | `EDIT_NOT_ALLOWED`  | 409  | drafts.service.edit()    |
| publish 调到非作者      | `Forbidden`         | 403  | drafts.service.publish() |
| publish 24h 过期        | `PREFLIGHT_EXPIRED` | 409  | 现有,未变                |

---

## 7. 测试矩阵

### 7.1 api 单测

| 用例                                                      | 期望 |
| --------------------------------------------------------- | ---- |
| `edit()` PUBLISHED → DRAFT,version+1                      | OK   |
| `edit()` DRAFT 状态 → 409 EDIT_NOT_ALLOWED                | OK   |
| `edit()` OFFLINE 状态 → 409 EDIT_NOT_ALLOWED              | OK   |
| `edit()` 非作者 → 403                                     | OK   |
| `publish()` 首发 → publishedBody = body, status=PUBLISHED | OK   |
| `publish()` 二发 → publishedBody 覆盖,publishedAt 更新    | OK   |
| `publish()` 二发 + env=false → PostStat 清零              | OK   |
| `publish()` 二发 + env=true(默认) → PostStat 不动         | OK   |

### 7.2 api e2e

| 用例                                                                                                   | 期望                 |
| ------------------------------------------------------------------------------------------------------ | -------------------- |
| 完整二发链路:edit → 改 body → preflight → publish → /post/:id 看到新版                                 | OK                   |
| 二发期间 /post/:id 返老版本                                                                            | OK(读 publishedBody) |
| 二发期间另一作者匿名访问 /me/works /post/:id 可隔离                                                    | OK                   |
| 二发期间 publish() 不带新 preflight → 409 PREFLIGHT_REQUIRED(老 lastReview 还在 24h 内是否会绕开 — 测) | 需测                 |

### 7.3 web vitest

`/me/works` PUBLISHED 双 Action 渲染、`handleEdit` 调 `/drafts/:id/edit` 后路由到 `/drafts/:id`、RepublishBanner 在 publishedBody!=null 时显示。

### 7.4 playwright e2e

`republish.spec.ts`:作者登录 → /me/works → 点 PUBLISHED 卡「继续编辑草稿」 → 编辑器加载,顶部见 RepublishBanner → 改标题 → /post/:id 在新 tab 验证仍是老版 → 回 /drafts/:id 点发布 → preflight → publish → /post/:id 新 tab 显新版。

---

## 8. 上线 / 灰度

- 直接 main(单分支训练营)
- env `REPUBLISH_HOTNESS_INHERIT` 在 `.env.example` 加注 + README Phase 2.15 段落引述

---

## 9. 边界与非目标

- **非目标:** 二发新版本未通过审核(publish() 永远要求作者再点 preflight)→ 留作 BLOCK 的现有抛错通道,前端 PreflightDialog 已展示。**不做**「自动定时退回 DRAFT」。
- **非目标:** 二发期间 publishedBody/Title 字段对作者只读 — schema 上无 trigger,信任 service 层(publish() 是唯一写路径)。
- **非目标:** 不为 OFFLINE 解锁二发 — 由 §3.3.4 单独处理。
- **边界:** PostStat 行可能不存在(老 fixture 行只有 published 没 stat),env=false 路径用 `updateMany` 不抛 P2025。

---

## 10. 完成定义

- [x] schema.prisma 加 4 字段 + REVIEWING enum,migrate ✓
- [x] 现有 PUBLISHED 数据 backfill publishedBody ✓
- [x] `POST /drafts/:id/edit` 端点上 ✓
- [x] `publish()` 二发分支 + env 开关 ✓
- [x] feed/post/me-works/authors 读侧切到 publishedBody/publishedTitle ✓
- [x] /me/works 双 Action UI ✓
- [x] /drafts/:id 顶部 RepublishBanner ✓
- [x] api 单测、e2e、web vitest、playwright 全绿 ✓
- [x] README Phase 2.15 段落上 ✓
