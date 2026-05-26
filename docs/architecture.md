# 系统架构草稿

> Phase 0 Step 7 产出物 · 2026-05-26
>
> **定位**:把 [`PRD.md`](./PRD.md) 的三角色叙事(得力助手/守门员/导航员)落到将要实现的代码模块边界上,为 Phase 1 提供"地图"。
>
> **不是**最终架构。Phase 1 真正写第一个数据模型时,会沉淀 [`ADR-0002`](./decisions/) 锁数据层接口。本文档随实现演化。

---

## 0. 决策原则(贯穿全文)

1. **薄前端 / 厚后端**:AI 调用、Prompt 渲染、审核裁决、评分计算、榜单排序——全部放在 `apps/api`。`apps/web` 只做"输入 + 渲染 + 流式接收"。
2. **流式优先**:涉及 AI 输出(快速稿生成、改写工具)的接口默认走 SSE,非流式是例外。
3. **Prompt 是数据,不是代码**:Prompt 模板存 DB(平台层 + 作者私人层),版本可追溯,不进 git。
4. **审核 5 阶段是切面,不是主线**:用 NestJS 的 Guard / Interceptor / Pipe 切进每一阶段,不污染业务 controller。
5. **AI 只提主张,人做决定**:服务端永远返回 candidate / suggestion,持久化由用户显式 Accept 触发。

---

## 1. Monorepo 物理分层

```
bytedance-aigc/
├── apps/
│   ├── web         # Next.js 16 + React 19 — 用户界面 + SSR
│   └── api         # NestJS 11 — 业务编排 + AI 网关 + 审核 + 评分
├── packages/
│   └── shared      # TS 类型 / 常量 / 枚举(双端共用)
└── docker-compose.yml  # 本地 PG 16 + Redis 7
```

| 包                | 职责                                                                       | 不该出现的东西                               |
| ----------------- | -------------------------------------------------------------------------- | -------------------------------------------- |
| `apps/web`        | 路由、UI、表单、流式渲染、客户端缓存                                       | Prompt 文本、AI SDK 调用、审核逻辑、评分公式 |
| `apps/api`        | 业务编排、AI 网关、Prompt 装配、审核切面、评分、榜单计算                   | UI 组件、CSS、浏览器 API                     |
| `packages/shared` | DTO 类型、枚举(`AuditStage`/`Verdict`/`ContentMode`)、常量(评分权重默认值) | 业务函数、数据库代码、AI 调用                |

`shared` 是"双端约定层"。任何前后端都用到的类型/常量都先沉到这里,避免漂移。

---

## 2. 三角色 → 后端模块映射

```
                        ┌──────────────────────────┐
                        │  apps/api (NestJS 11)    │
                        └──────────────────────────┘

  ┌─── 得力助手 ─────────┐  ┌─── 守门员 ──────────┐  ┌─── 导航员 ──────────┐
  │ creation/            │  │ audit/              │  │ feed/               │
  │   - drafts           │  │   - rules-engine    │  │   - ranking         │
  │   - mode (fast/fine) │  │   - stage-pipeline  │  │   - hot-board       │
  │   - versions         │  │   - verdicts        │  │   - top-board       │
  │ prompts/             │  │ scoring/            │  │ analytics/          │
  │   - platform-lib     │  │   - 4-dim-rubric    │  │   - data-feedback   │
  │   - author-lib       │  │   - aggregator      │  │                     │
  │ ai-gateway/          │  │ feedback-loop/      │  │                     │
  │   - llm-adapter      │  │   - rewrite-hooks   │  │                     │
  │   - sse-streamer     │  │                     │  │                     │
  │ assets/              │  │                     │  │                     │
  └──────────────────────┘  └─────────────────────┘  └─────────────────────┘

           ┌────────────── 横切关注点(共享基础设施) ──────────────┐
           │ auth/  config/  logging/  health/  prisma 或 typeorm  │
           └───────────────────────────────────────────────────────┘
```

### 2.1 得力助手 — `creation/` + `prompts/` + `ai-gateway/` + `assets/`

| 子模块                    | 主要职责                                  | 关键类(预计)                                        |
| ------------------------- | ----------------------------------------- | --------------------------------------------------- |
| `creation/drafts`         | 稿件 CRUD、双轨模式标记、30s 自动保存     | `DraftController` / `DraftService` / `Draft` entity |
| `creation/versions`       | 版本历史、diff 还原                       | `VersionService`                                    |
| `prompts/platform-lib`    | 平台内置 Prompt(只读默认款)               | `PlatformPromptRepo`(种子数据)                      |
| `prompts/author-lib`      | 作者私人 Prompt(复制后可编辑)             | `AuthorPromptService`                               |
| `ai-gateway/llm-adapter`  | 屏蔽具体 LLM 厂商(OpenAI / 豆包 / Claude) | `LlmAdapter` 接口 + 实现                            |
| `ai-gateway/sse-streamer` | SSE 流式响应封装                          | `SseInterceptor`                                    |
| `assets/`                 | 图片/素材上传 + 合规预审入口              | `AssetController`                                   |

**为什么 `ai-gateway` 是独立模块而不是塞进 `creation`**:审核(`audit`)和改写工具也要调 LLM,共用一个 adapter 才避免重复鉴权 / 重复限流 / 重复 prompt 装配。

### 2.2 守门员 — `audit/` + `scoring/` + `feedback-loop/`

5 阶段审核链路用 NestJS 切面实现,**不是 5 个独立 controller**:

| 阶段           | 触发点                          | 实现方式                  |
| -------------- | ------------------------------- | ------------------------- |
| 1. Prompt 阶段 | 用户保存自定义 Prompt 前        | `PromptValidatePipe`      |
| 2. 输入阶段    | 用户提交选题描述 / 编辑器内容前 | `InputAuditGuard`         |
| 3. 生成阶段    | LLM 流式输出每段后              | SSE `transform` 钩子      |
| 4. 发布前      | 用户点"发布"时                  | `PrePublishGuard`         |
| 5. 发布后      | 已发布内容定时巡检 + 用户举报   | Cron + `ReportController` |

`scoring/` 4 维评分(内容价值/表达质量/读者体验/传播潜力)是**生成阶段审核**的同行者,共享同一次 LLM 调用结果(省 token)。

`feedback-loop/` 把"质量低分维度 ↔ 工作台改写工具"的对应关系沉淀成数据驱动:维度 ID → 改写 prompt ID → 工作台 UI hint。

### 2.3 导航员 — `feed/` + `analytics/`

| 子模块                    | 职责                                                | 关键算法                    |
| ------------------------- | --------------------------------------------------- | --------------------------- |
| `feed/ranking`            | 加权榜单公式 `score = α·质量 + β·热度 + γ·时间衰减` | 权重 UI 可调,存配置表       |
| `feed/hot-board`          | 平台内热度榜(不是外部热点抓取)                      | Redis sorted set,分钟级刷新 |
| `feed/top-board`          | 历史爆文榜                                          | 离线计算,每日 cron          |
| `analytics/data-feedback` | 阅读/互动/留存数据回流到工作台首页                  | 聚合表 + dashboard API      |

---

## 3. 前端模块对应

```
apps/web/src/
├── app/                    # Next.js App Router
│   ├── (creator)/          # 得力助手:工作台路由组
│   │   ├── new/            # 新建(选快速稿/精耀稿)
│   │   ├── editor/[id]/    # 富文本编辑器(双模式入口)
│   │   └── prompts/        # Prompt 库管理(我的/平台)
│   ├── (audit)/            # 守门员:审核反馈侧栏(嵌入编辑器)
│   ├── (discover)/         # 导航员:首页信息流 + 双榜单 + 详情页
│   └── (account)/          # 用户中心 / 通知中心
├── components/
│   ├── editor/             # 富文本编辑器(候选:tiptap)
│   ├── streaming/          # SSE 客户端 + 流式渲染组件
│   └── audit-feedback/     # 风险标注 / 质量分卡片 / 改写按钮
└── lib/
    ├── api-client/         # 调 apps/api 的 typed client(用 shared 包的 DTO)
    └── sse/                # 流式接收 hooks(useStream)
```

---

## 4. 数据层(草稿 — 留给 ADR-0002 终板)

本节列出**本文档当前的预想**,但具体 ORM 选型、表结构契约由 Phase 1 第一次写数据库代码时通过 ADR-0002 锁定。

### 4.1 PostgreSQL 主表(预想)

| 表                   | 关键字段                                                        | 备注                             |
| -------------------- | --------------------------------------------------------------- | -------------------------------- |
| `users`              | id, handle, role                                                | MVP 单角色"作者",不做 RBAC       |
| `drafts`             | id, author_id, mode(fast/fine), title, body(rich-json), version | 30s 自动保存 = upsert 当前版本   |
| `draft_versions`     | id, draft_id, snapshot, created_at                              | 显式快照,不是每次 keystroke      |
| `prompts_platform`   | id, name, template, category                                    | 种子数据,只读                    |
| `prompts_author`     | id, author_id, parent_platform_id, template                     | 复制 platform 后可编辑           |
| `audit_records`      | id, target_id, target_type, stage, verdict, payload             | 5 阶段统一表,stage 字段区分      |
| `quality_scores`     | id, content_id, value/quality/experience/spread, total          | 4 维分,total 是当前公式产出      |
| `published_articles` | id, draft_id, published_at, snapshot                            | 发布即定格,后续编辑生成新文章    |
| `engagement_events`  | id, article_id, type(view/like/comment), at                     | 数据回流原料,可能改去 ClickHouse |
| `ranking_config`     | α, β, γ, updated_by, updated_at                                 | 后台 UI 可调权重                 |

### 4.2 Redis 用途

| key 模式                 | 用途                              |
| ------------------------ | --------------------------------- |
| `hot:board:zset`         | 热度榜 sorted set(score = 加权值) |
| `sse:stream:{requestId}` | 长连接生成进度,用户刷新后可恢复   |
| `audit:rate:{userId}`    | 审核接口按用户限流                |
| `cache:prompt:platform`  | 平台 Prompt 库缓存,降库压         |

### 4.3 数据 ↔ 模块归属

每张表都属于**一个**主模块,跨模块只通过 service 接口访问,不直接 join 别模块的表(NestJS 模块边界 = 数据所有权边界)。

---

## 5. 关键流程时序(2 条主链路)

### 5.1 快速稿生成(SSE 流式)

```
User              apps/web              apps/api               LLM
 │                   │                     │                    │
 │  填选题描述       │                     │                    │
 ├──────────────────>│                     │                    │
 │                   │  POST /creation/    │                    │
 │                   │   fast/outline      │                    │
 │                   ├────────────────────>│                    │
 │                   │                     │ [审核·阶段2 输入]  │
 │                   │                     │ [取作者私人 Prompt]│
 │                   │                     │ [Prompt 装配]      │
 │                   │                     ├───────────────────>│
 │                   │                     │   大纲 JSON        │
 │                   │                     │<───────────────────┤
 │                   │  outline 列表       │                    │
 │                   │<────────────────────┤                    │
 │  调整/确认大纲    │                     │                    │
 │ ─────────────────>│                     │                    │
 │                   │  POST /creation/    │                    │
 │                   │   fast/generate     │                    │
 │                   │  (开 SSE)           │                    │
 │                   ├════════════════════>│                    │
 │                   │                     │  逐段 stream 调用  │
 │                   │                     ├═══════════════════>│
 │                   │  data: chunk        │  chunk             │
 │                   │<════════════════════┤<═══════════════════┤
 │  流式渲染段落     │                     │ [审核·阶段3 生成]  │
 │<──────────────────┤                     │ [评分写入 quality] │
 │                   │                     │                    │
 │                   │  data: done         │                    │
 │                   │<────────────────────┤                    │
```

### 5.2 发布前审核 + 入榜

```
User → apps/web → POST /publish/{draftId}
                        │
                        ▼
        apps/api: PrePublishGuard (审核·阶段4)
            ├─ 命中高危规则 → 直接 deny,返回理由
            ├─ 低危/警告 → 透传,前端弹确认
            └─ 通过
                ▼
        持久化 published_articles + 触发 ranking 重算
                ▼
        Redis ZADD hot:board:zset
                ▼
        202 + article id
```

---

## 6. 开放问题(交给 Phase 1 解决)

| 问题          | 默认假设(可被 ADR 推翻)                                   | 触发决策的时机               |
| ------------- | --------------------------------------------------------- | ---------------------------- |
| ORM 选型      | Prisma(类型最强) vs TypeORM(NestJS 官方亲) vs Drizzle(轻) | 写第一张表时 → ADR-0002      |
| 富文本格式    | tiptap JSON(渲染稳、可结构化喂给审核)                     | 编辑器接入时                 |
| LLM 厂商      | 豆包(国内合规)+ OpenAI 备                                 | ai-gateway 实装时            |
| 审计/事件溯源 | 暂不引入 event sourcing,审核记录直接落表即可              | 如审核策略需要回溯重放再讨论 |
| 鉴权方案      | NextAuth + JWT(单角色,够用)                               | apps/web 接入登录时          |
| 部署形态      | 单 VPS / Vercel + Railway 二选一                          | Phase 2 准备上线时           |

---

## 7. 与 PRD 的可追溯性

| PRD 节        | 本文档对应                                  |
| ------------- | ------------------------------------------- |
| §1.2 三角色   | §2 三模块映射                               |
| §2 闭环图     | §2.2 守门员 + §2.3 导航员                   |
| §3.1 双轨创作 | §5.1 时序图                                 |
| §4 5 阶段审核 | §2.2 表 + §0 决策原则 4                     |
| §5 4 维评分   | §2.2 `scoring/`                             |
| §6 加权榜单   | §2.3 `feed/ranking` + §4.1 `ranking_config` |

---

## 8. 修订记录

| 日期       | 改动                     | 触发                    |
| ---------- | ------------------------ | ----------------------- |
| 2026-05-26 | 初版,Phase 0 Step 7 产出 | 收尾 Phase 0 工程化基建 |
