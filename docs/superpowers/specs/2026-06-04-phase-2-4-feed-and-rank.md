# Phase 2.4 信息流分发(读路径)— 设计稿

> **范围**:PRD §5.1-5.4 内容分发的**读路径**部分(信息流 / 双榜单 / 详情页 / 我的创作 / 排序公式)。**不含**埋点上报、HotnessScore 实时计算、数据回流诊断,这些留 Phase 2.5。
>
> **本 phase 用 mock 热度数据让排序公式有可视差异;Phase 2.5 接埋点后无侵入替换 mock 函数。**

## 目标(Goal)

让评委能从浏览器 `/` 刷到信息流、点开 `/post/:id` 看详情、切换 `/rank/hot` 与 `/rank/best` 看到不同 τ 下的排序差异;让作者能在 `/me/works` 看到自己 PUBLISHED 的所有内容。

## 范围决策(Scope)

**做**:

- 5 个新页面:`/`(信息流) / `/rank/hot` / `/rank/best` / `/post/[id]`(重写,从 Phase 2.3 占位扩展) / `/me/works`
- 6 个新端点(GET only,见下)
- 排序公式实现 + 跨前后端共享(`packages/shared/src/ranking.ts`)
- 双榜单 τ 与窗口过滤
- 权重 UI 配置(localStorage,默认 α=0.5/β=0.3/γ=0.2)
- 30 篇 fixtures PUBLISHED Draft(评委 demo 池)
- LCP ≤ 2.5s 验证(Lighthouse 截图归档)
- 详情页 SSR + 作者其他作品(底部 3 篇)

**不做**(Phase 2.5 或后续):

- 埋点上报 `POST /events/track`(Phase 2.5)
- `PostStat` 表的实时写入(Phase 2.5)
- 真实 HotnessScore(Phase 2.5,本 phase 用确定性 mock 哈希)
- 数据回流诊断(PRD §5.5,Phase 2.5)
- 互动行为持久化(点赞 / 收藏 / 分享)— UI 显示按钮但 disabled,标注"Phase 2.5"
- 举报触发发布后审核(Phase 2.6)
- 关注流 tab(超 3 周交付边界)
- 虚拟滚动(候选池 ≤ 100 时不需要,fixtures 30 篇也不需要)
- 权重运营管理 UI(超出范围;localStorage 单设备够用)
- Redis 接入(本 phase 无写路径,候选池 < 1000 时 in-memory 排序绰绰有余)
- 图床 / WebP 衍生(用本地 mock cover)

## 已拍板决策

### D-C0:范围拆分

PRD §5 全章拆为两个 phase:**Phase 2.4 = 读路径**(本 spec),**Phase 2.5 = 埋点 + 数据回流**。
**理由**:Phase 2.4 总工作量 12-14 task 已与 Phase 2.3 持平,继续合并到一个 spec 会失控。读写分离也让本 phase 早点产生评委可见 demo。

### D-C1:Post 表 vs 复用 Draft

**复用 `Draft where status='PUBLISHED'` 作为 Post 视角**。新增 `PostStat` 表(占位 schema:7 个埋点计数字段),本 phase 不写入。
**理由**:Post 与 Draft 有 95% 字段重合(title/body/author/createdAt/updatedAt 全是),开新表会引入 Draft → Post 的同步问题。Domain 概念用 DTO 转换:外部 API 返 `PostDto`,内部 Prisma 查 `Draft`。

### D-C2:HotnessScore 来源

**Phase 2.4 用确定性 mock**:`hotnessMockBase(postId) = (hashBase64(postId).charCodeAt(0) * 7 + 13) % 100`,与 `publishedAt` 无关纯随机但稳定。
**理由**:无埋点写入时实时算永远 0;mock 让 α/β/γ 调权重时排序有差异,评委可见。Phase 2.5 接 PostStat 后,把 mock 函数替换成 `compute(window, postIds)` 即可,排序公式不变。

### D-C3:Redis 不接

本 phase 不接 Redis。
**理由**:无写路径要计数;候选池 fixtures 30 篇 < 100,Postgres `WHERE status=PUBLISHED ORDER BY publishedAt LIMIT 100` + node 内存排序绰绰有余。Phase 2.5 真正需要计数器和 ZSET 时再接,避免 YAGNI。

### D-C4:LCP 验证流程

**手测交付,不进 CI**。在最后一个 task 跑 Lighthouse,要求 LCP ≤ 2.5s,截图存到 `docs/perf/lighthouse-feed-2026-06-XX.png` 并 commit。
**理由**:Lighthouse CI 接入成本高(GH Actions runner 性能不一致,LCP 数字波动大),本项目交付物只要"提交时附 Lighthouse 截图"(PRD §5.2.3)。

### D-C5:分页方式 — cursor-based("候选池一次取全 + 内存切片")

**实现策略**:候选池 ≤ 500 时,服务端**一次性**查出全部候选,内存算 score 排序,然后 cursor 编码 `{rank: 上一页最后一条的位置索引}` base64,下一页从 `rank+1` 开始切;每页 20 条(PRD §5.2.2)。
**理由**:加权 score 是运行时算出来的,无法直接进 SQL ORDER BY;且权重可变,cursor 编码 score 数值在下次请求时(权重不同)会失效。把"全候选池排序"看成单请求内的内存操作,cursor 只编码"我看到第几条了"。

- 候选池 hard cap 500 防爆(SQL `LIMIT 500`);如果 fixtures 突破 500 才需要重构
- cursor: `Buffer.from(JSON.stringify({rank: number, weights: {alpha,beta,gamma}})).toString('base64url')`
- weights 也编进 cursor,翻页时服务端校验"当前请求 weights 必须与 cursor 内 weights 一致",否则 400(避免翻页中途调权重导致顺序错乱)
- 前端在 LoadMore 时把当前 weights 一起发,与 cursor 校验一致;权重抽屉调整则直接 `router.refresh()` 重置到第一页
  **取舍说明**:这是 MVP 取舍。真正的"权重无关稳定 cursor"需要预算分数到 PostStat 表,Phase 2.5 接埋点后可考虑;3 周交付窗口内 in-memory 切片够用。

### D-C6:权重 UI 持久化 — localStorage

**localStorage `feed:weights = {alpha, beta, gamma}`**,默认 0.5/0.3/0.2。
**理由**:评委演示场景单设备调权重,不需要后端持久;运营管理 UI 超出 3 周交付边界。

### D-C7:双榜单的窗口过滤

- **/rank/hot**:`WHERE publishedAt > NOW() - 12h`,τ = 12h
- **/rank/best**:`WHERE publishedAt > NOW() - 72h`,τ = 72h
- **/feed**(综合):`WHERE publishedAt > NOW() - 30d`(防候选池无限),τ = 24h
  **理由**:窗口与 τ 一致是 PRD §5.4 明确写的"避免长期高量内容稀释短期热度"。

### D-C8:SSR 全站

所有 5 页面用 Next.js 16 **Server Components SSR**;互动按钮等需 client 行为的部分用 `"use client"` 子组件。
**理由**:LCP ≤ 2.5s 硬指标依赖首屏直出;App Router 的 Server Components 默认 SSR + 自动数据获取,正合用。

### D-C9:`/me/works` 与 `/drafts/mine` 关系

- **`/drafts/mine`** = 现有页面,只列 `status='DRAFT'`(本 phase 加 status filter)
- **`/me/works`** = 新页面,只列 `status='PUBLISHED'`,显示阅读量 mock + 质量分总分 + 占位"24h 后行动建议"区域(Phase 2.5 填充)
  **理由**:草稿与作品两个视角分离,跟 PRD §5.1 表述一致。

### D-C10:图片策略

- 30 篇 fixtures 共享 5 张本地 `apps/web/public/covers/cover-{1..5}.webp`(用 placeholder 服务下载,1280×720)
- `<Image>` 用 next/image 自动响应式
- 第一屏首图加 `priority`(等价 fetchpriority=high)
  **理由**:无图床基建;PRD §3.6 素材库本来就要 Phase 2.6 才做。

## 数据模型变更

### 新增 `PostStat` 表(占位)

```prisma
model PostStat {
  id          String   @id @default(cuid())
  draftId     String   @unique  // 一对一映射到 PUBLISHED 的 Draft
  impression  Int      @default(0)
  click       Int      @default(0)
  dwellUnit   Int      @default(0)  // 完读次数 (PRD §5.4)
  like        Int      @default(0)
  collect     Int      @default(0)
  share       Int      @default(0)
  report      Int      @default(0)
  updatedAt   DateTime @updatedAt

  draft Draft @relation(fields: [draftId], references: [id], onDelete: Cascade)

  @@map("post_stats")
}
```

`Draft` 加 `stat PostStat?` 反向关系。**本 phase 不写入此表**;只是把 schema 落地,Phase 2.5 直接 `prisma.postStat.upsert` 即可。

Migration 名:`20260604XXXXXX_phase24_post_stat`。

### Fixtures 扩充

`apps/api/prisma/fixtures/drafts.ts` 增加 30 条 PUBLISHED Draft:

- `status: PUBLISHED`、`publishedAt` 散布在最近 7 天(用确定性偏移,不依赖 random)
- `body` 用最小 TipTap doc(1 个 heading + 2-3 段)
- `title` 用预定义 30 个题目(科技 / 生活 / 财经 / 健康 各类)
- 每条挂一条 PREFLIGHT Review,`quality.overall` 散布在 60-95(让 80+ 徽章有 7-8 篇命中)
- `lastReviewId` 指向该 review

5 张封面图:`apps/web/public/covers/cover-{1..5}.webp`(每条 fixture 用 `coverIndex = (orderInList % 5) + 1`)。

**多作者**:除现有 `demo-author` 外新增 2 个 `tech-author` / `life-author`,30 篇均匀分配(各 10 篇),让"作者其他作品"端点有数据可演示。fixture user 数量从 1 → 3。

**fixtures/index.ts cleanup 要扩**:`cleanupAllFixtures` 现状只 deleteMany {draftVersion, draft, prompt, user},Phase 2.3 已落地 Review 表但 cleanup 漏了(靠 Draft 级联 onDelete: Cascade 兜底)。Phase 2.4 加 PostStat 后,cleanup 顺序改为:`postStat → review → draftVersion → draft → prompt → user`(显式 deleteMany 比依赖级联清楚,e2e 也更稳)。

**applyAllFixtures 增量**:写入顺序 `users → prompts → drafts → reviews(每篇 1 条 PREFLIGHT)→ drafts.update lastReviewId`;PostStat 本 phase 不写入(Phase 2.5 才填)。

## 新增端点

| 路径                 | 方法 | 用途                      | 输入                                                       | 输出                                                         |
| -------------------- | ---- | ------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------ |
| `/feed`              | GET  | 综合排序信息流            | `cursor?` `limit=20` `alpha?=0.5` `beta?=0.3` `gamma?=0.2` | `{ items: PostDto[], nextCursor: string \| null }`           |
| `/rank/hot`          | GET  | 热点榜(τ=12h, window=12h) | `cursor?` `limit=20`                                       | 同上                                                         |
| `/rank/best`         | GET  | 爆文榜(τ=72h, window=72h) | `cursor?` `limit=20`                                       | 同上                                                         |
| `/post/:id`          | GET  | 详情页(已 PUBLISHED)      | path id                                                    | `PostDetailDto`,含 `body` `quality.overall` `recommendation` |
| `/me/works`          | GET  | 作者 PUBLISHED 列表       | (auth)                                                     | `PostDto[]`                                                  |
| `/authors/:id/posts` | GET  | 作者其他作品(详情页底部)  | path authorId, query `limit?=3` `excludeId?`               | `PostDto[]`                                                  |

`PostDto` 新建到 `packages/shared/src/post.ts`:

```ts
export interface PostDto {
  id: string;
  title: string;
  authorId: string;
  authorHandle: string;
  publishedAt: string; // ISO
  qualityOverall: number; // 0-100
  hotnessMock: number; // 0-100, Phase 2.5 替换为真实
  coverIndex: number; // 1-5
  excerpt: string; // 取 body 前 80 字
}

export interface PostDetailDto extends PostDto {
  body: unknown; // TipTap JSON
  qualityRecommendation: "ALLOW" | "WARN" | "BLOCK";
}

export interface FeedResponse {
  items: PostDto[];
  nextCursor: string | null;
}

export interface FeedWeights {
  alpha: number;
  beta: number;
  gamma: number;
}
```

**鉴权**:`/me/works` 必须登录(UserGuard);其他端点公开访问(评委不需要登录就能刷信息流)。

**错误码**:

- `404 NotFoundException` `/post/:id` 找不到或 `status !== PUBLISHED`
- `400 BadRequestException` cursor 解码失败 / weights 范围 [0, 1] 外
- `401` `/me/works` 未登录(沿用 UserGuard)

## 排序公式(packages/shared/src/ranking.ts)

```ts
export interface Scoreable {
  id: string;
  publishedAt: Date;
  qualityOverall: number;  // 0-100
  hotnessRaw: number;      // Phase 2.4 = mock; Phase 2.5 = 真实计数加权
}

export interface ScoreContext {
  weights: FeedWeights;
  tauHours: number;            // 12 / 24 / 72
  now: Date;
  hotnessPool: number[];       // 当前榜单候选池的 hotnessRaw,用于 min-max
}

/** TimeDecayScore = 100 * exp(-Δh / τ) */
export function timeDecayScore(publishedAt: Date, now: Date, tauHours: number): number {
  const dh = Math.max(0, (now.getTime() - publishedAt.getTime()) / 3600_000);
  return 100 * Math.exp(-dh / tauHours);
}

/** min-max 归一化到 0-100;空池或 max==min 返 0;池 < 50 用 P95 兜底 */
export function normalizeHotness(raw: number, pool: number[]): number { ... }

export function computeScore(p: Scoreable, ctx: ScoreContext): number {
  const q = p.qualityOverall;
  const h = normalizeHotness(p.hotnessRaw, ctx.hotnessPool);
  const t = timeDecayScore(p.publishedAt, ctx.now, ctx.tauHours);
  return ctx.weights.alpha * q + ctx.weights.beta * h + ctx.weights.gamma * t;
}

/** Phase 2.4 mock:稳定哈希,跨调用一致 */
export function hotnessMockBase(postId: string): number {
  let h = 0;
  for (let i = 0; i < postId.length; i++) h = (h * 31 + postId.charCodeAt(i)) | 0;
  return Math.abs(h) % 100;
}
```

**关键不变量**:

- 输入纯数据 + ctx,无 IO
- `hotnessRaw` 在 Phase 2.4 = `hotnessMockBase(post.id)`,Phase 2.5 = `computeRawFromStats(stat, window)`
- 单测覆盖:α=1/β=0/γ=0 时按 quality 排;τ 越小越偏新内容;空池兜底返 0;`computeScore` 单调性

## 后端层(apps/api/src/feed/)

**新模块** `FeedModule`(独立于 DraftsModule):

- `feed.service.ts`:`getFeed(weights, cursor, limit, mode='all'|'hot'|'best')`
  - 查 `WHERE status=PUBLISHED AND publishedAt > NOW() - windowHours[mode]`
  - 一次性 `findMany` 取候选池(hard cap 500 防爆),包含 `lastReview` 拿 `quality.overall`
  - 内存调用 `computeScore`,排序后切 cursor + limit
  - 输出 `FeedResponse`

- `feed.controller.ts`:`@Get('/feed')` `@Get('/rank/hot')` `@Get('/rank/best')` `@Get('/me/works')` `@Get('/authors/:id/posts')`
- `posts.controller.ts`:`@Get('/post/:id')` 单独控制器(避免 `feed.controller` 路由太杂)
- DTO:`FeedQueryDto`(weights / cursor / limit class-validator);cursor 用 `class-transformer` 反序列化

**Cursor 编码**:`Buffer.from(JSON.stringify({rank, weights})).toString('base64url')`,`rank`=上一页最后一条在候选池中的索引(0-based),`weights`={alpha,beta,gamma}。下次请求必须带相同 weights,否则 400 `CURSOR_WEIGHTS_MISMATCH`。前端透传不需要解析。

## 前端层(apps/web/src/app/)

### 路由结构

```
app/
  page.tsx                  # / 信息流首页(SSR)
  rank/
    hot/page.tsx            # /rank/hot
    best/page.tsx           # /rank/best
  post/[id]/page.tsx        # 重写:从 Phase 2.3 占位 → 真实详情
  me/works/page.tsx         # /me/works(SSR + 作者鉴权)
  drafts/mine/page.tsx      # 现有,加 status=DRAFT filter(改 1 行)
```

### 组件树(`apps/web/src/app/_components/`)

```
FeedShell          (Layout: 顶部 RankTabs + 右侧 WeightDrawer 触发器)
  ├─ RankTabs      (推荐 / 热点 / 爆文,active 状态联 pathname)
  ├─ WeightDrawer  (client,localStorage,滑块 0-1)
  └─ FeedList      (Server Component,接 SSR 数据)
      ├─ PostCard  (封面+标题+作者+发布时间+质量徽章)
      └─ LoadMore  (client,Intersection Observer 距底 600px 触发)

PostDetail
  ├─ PostHeader    (封面+标题+作者头像+发布时间+质量分)
  ├─ PostBody      (TipTap JSON 渲染,只读)
  ├─ InteractionBar (client,点赞/收藏/分享 disabled,占位)
  └─ AuthorOtherPosts (Server,/authors/:id/posts?limit=3)

MyWorksList
  └─ MyWorkCard    (复用 PostCard 形态,加"行动建议"占位条)
```

### 关键交互

- 权重抽屉调整 → 刷 localStorage → `router.refresh()`(SSR re-fetch)
- LoadMore 用 fetch 直接拉 `/feed?cursor=...`(不走 router),append 进 list
- 详情页用 `Link prefetch={true}` 让信息流 hover 时预热
- 互动按钮 onClick 弹 toast "Phase 2.5 上线后开放"(避免静默失败困惑评委)

## 错误处理

| 场景                                    | 行为                                                                     |
| --------------------------------------- | ------------------------------------------------------------------------ |
| `/post/:id` 草稿(未发布)                | 404 + 前端展示"内容已下架或不存在"                                       |
| cursor 解码失败                         | 400 `CURSOR_INVALID` + 前端 toast "页面状态异常,刷新重试" + 自动跳第一页 |
| cursor 内 weights 与请求 weights 不匹配 | 400 `CURSOR_WEIGHTS_MISMATCH` + 前端跳第一页(权重已变)                   |
| weights 范围越界                        | 400 + 前端 reset to default                                              |
| 候选池为空(fixtures 没跑 / 全过期)      | 200 `{ items: [], nextCursor: null }` + 前端"暂无内容,试试调高权重 γ"    |
| `/me/works` 未登录                      | 401 + 前端跳 `/login?from=/me/works`                                     |
| `/authors/:id/posts` 作者不存在         | 200 `[]`(详情页底部静默隐藏)                                             |

## 对现有 e2e 的影响(必须修)

Phase 2.4 fixtures 改动会让现有断言失效,本 spec 范围内必须一并修:

- `apps/api/test/drafts.e2e-spec.ts`:`GET /drafts` 现在断言数量等于 `DEMO_DRAFTS.length`(2);Phase 2.4 fixtures 后 `Draft` 总数 = 2 (DRAFT) + 30 (PUBLISHED) = 32。改成 `>= DEMO_DRAFTS.length`,或显式 filter `status='DRAFT'` 后等于 2。
- `apps/api/test/drafts.e2e-spec.ts` 的 "GET /drafts/mine":作者改为多个,断言"只看到自己的"的逻辑需保留;`demo-author` 名下应仍是 2 条 DRAFT(未发布的 demo)。
- `apps/api/test/prompts.e2e-spec.ts`:Phase 2.3 已 filter SAFETY/QUALITY,Phase 2.4 prompts 不变。**预计无影响**,但跑一遍再确认。
- `applyAllFixtures` 返回结构 `{users, prompts, drafts}` 不变,但 `drafts` 数量从 2 → 32,reviews 是新增字段。考虑把返回签名扩成 `{users, prompts, drafts, reviews}`,所有引用处一起改。

预期受影响 e2e 文件清单(plan 任务里逐文件改):

- `drafts.e2e-spec.ts`(数量断言)
- `fast-mode.e2e-spec.ts`(若有显式 count 断言)
- `outline.e2e-spec.ts` / `sections.e2e-spec.ts` / `tools.e2e-spec.ts`(用 demo 草稿但没数量断言,**预计无影响**)
- `preflight-review.e2e-spec.ts` / `publish.e2e-spec.ts`(自建 user/draft,**无影响**)

## 测试

### 单测(packages/shared 共享)

- `ranking.spec.ts`(packages/shared 自己加 jest):
  - α=1/β=0/γ=0 时按 quality 降序
  - α=0/β=0/γ=1 时按 publishedAt 降序
  - τ=12h 与 τ=72h 同输入差异
  - 空池 normalizeHotness 返 0
  - 池 < 50 时 P95 兜底
  - hotnessMockBase 同 id 多次调用一致

### 后端 e2e(apps/api/test/)

- `feed.e2e-spec.ts`:
  - GET /feed 默认权重 → 20 条 + nextCursor 非空
  - 翻页:用第一页 nextCursor 拉第二页 → 不重复
  - alpha=1 时排序与 quality.overall 降序一致
  - 空 cursor 第一页边界
- `rank.e2e-spec.ts`:
  - /rank/hot 只返最近 12h
  - /rank/best 包含 12h-72h 之间内容
  - 老于 72h 的不在 best 里
- `post-detail.e2e-spec.ts`:
  - GET /post/:id 已发布 → 200 含 quality.overall
  - GET /post/:id 草稿 → 404
  - GET /authors/:id/posts → 排除 excludeId 后 limit 生效
- `me-works.e2e-spec.ts`:
  - 401 未登录
  - 200 只返自己的 PUBLISHED,DRAFT 不出现

### 前端单测(apps/web)

- `PostCard.test.tsx`:80+ 显示徽章,< 80 不显示
- `WeightDrawer.test.tsx`:localStorage round-trip,reset 生效

## 验收标准

- [ ] `pnpm lint` / `pnpm typecheck` / `pnpm test`(api + web + shared)/ `pnpm build` / `pnpm format:check` 全绿
- [ ] `pnpm --filter @bytedance-aigc/api test:e2e` ≥ 49 + ~12 新 = ~61 全绿
- [ ] `pnpm dev`,浏览器开 `/`、`/rank/hot`、`/rank/best`、`/post/:id`(随便点一篇)、`/me/works`(登录后)五个页面无白屏 / 报错
- [ ] α=1/β=0/γ=0 时 `/feed` 排序与 quality.overall 降序一致(肉眼)
- [ ] α=0/β=1/γ=0 时排序与 hotnessMock 降序一致
- [ ] 调 γ=1 后 `/feed` 顺序变(新内容上浮)
- [ ] `/rank/hot` 与 `/rank/best` 候选池有差异(Hot 短窗口比 Best 少)
- [ ] Lighthouse 跑 `/` 首页 LCP ≤ 2.5s,截图归档 `docs/perf/lighthouse-feed-2026-06-XX.png`
- [ ] README "Phase 2.4 信息流" 小节,说明 mock 热度 + Phase 2.5 替换路径

## 风险与对策

| 风险                                       | 对策                                                                                                       |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| LCP 超标                                   | 关键 CSS 内联(Next.js 默认 inline);首图 priority;cover 预下载 5 张共享;Server Components 避免水合等待      |
| 评委看不出"分发"差异                       | README 写明 mock + Phase 2.5 接埋点路径;权重抽屉让评委手动调 α/β/γ 看排序变化                              |
| 排序公式跨前后端复用导致 shared 包打包问题 | shared 已是 workspace `*` 软链(Phase 2.2 验证过),`ranking.ts` 是纯函数无 side effect,Next.js 16 SWC 直接吃 |
| cursor base64 在 URL 中变成 `+/=` 引发问题 | 用 `base64url`(node 内置 `Buffer.toString('base64url')`),URL safe                                          |
| fixtures 跑两次 publishedAt 偏移漂         | 用 `BASE_DATE = new Date('2026-06-01')` 常量 + 数组下标偏移,确定性                                         |
| Lighthouse 数字波动                        | 跑 3 次取最低,只要任一次 ≤ 2.5s 即过(Lighthouse Mobile slow 3G 默认 throttling 即基准)                     |

## 与 Phase 2.5 的接口契约

Phase 2.5 接埋点上线时,以下文件要改:

1. `packages/shared/src/ranking.ts` 不动 — 只换 `hotnessRaw` 来源
2. `apps/api/src/feed/feed.service.ts`:
   - 删 `hotnessMockBase`
   - 加 `private hotnessFromStats(stats: PostStat[], windowHours: number): number` — 按 PRD §5.4 raw 公式
   - candidates query 加 `include: { stat: true }`
3. 新加 `apps/api/src/events/events.service.ts` + `POST /events/track`(本 phase 不做)

也就是说 Phase 2.4 的 service 里 `hotnessRaw` 取数那一行(1 行)是唯一耦合点,留好注释 `// PHASE_2_5_REPLACE_HERE` 让 Phase 2.5 顺手能改。

## Phase 边界小结

- **本 spec ≈ Phase 2.3 体量**(8-10 task 估)
- **必须前置**:Phase 2.3(publish 端点已 ship,本 phase 直接基于 PUBLISHED 内容)
- **解锁后续**:Phase 2.5(埋点 + 真实 hotness + 数据回流诊断)
- **不在本 spec**:互动持久化、关注流、举报触发后审、虚拟滚动、运营管理 UI
