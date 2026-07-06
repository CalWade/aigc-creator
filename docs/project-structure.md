# 项目目录结构

> 上次更新：2026-06-15

---

## 顶层总览

```
aigc-creator/
├── apps/                    # 应用层 — 可独立部署的服务
│   ├── web/                 #   Next.js 16 前端 (React 19)
│   └── api/                 #   NestJS 11 后端
├── packages/                # 共享层 — 多应用复用的代码
│   ├── shared/              #   纯类型 / 常量 / 枚举（双端共用约定层）
│   └── ui/                  #   组件库 + hooks + 工具函数
├── deploy/                  # 生产部署配置
├── docs/                    # 架构文档 / 决策记录 / 评估报告
├── e2e/                     # Playwright 端到端测试
├── docker-compose.yml       # 本地开发基础设施 (PG + Redis + MinIO)
├── pnpm-workspace.yaml      # monorepo workspace 定义
└── package.json             # 根脚本 + 代码质量工具
```

---

## apps/web — Next.js 16 前端

端口 `3000`。App Router + React 19，SSR/ISR 混合渲染，SSE 流式接收 AI 输出。

```
apps/web/src/
├── app/                              # Next.js App Router 页面
│   ├── (public)/                     #   公开页面组（无 Shell 布局）
│   │   ├── login/page.tsx            #     登录
│   │   └── register/page.tsx         #     注册
│   ├── (creator)/                    #   创作者页面组（Creator Shell 布局）
│   │   ├── _components/              #     创作者专属共享组件
│   │   │   ├── CreatorLoginBanner    #       未登录引导横幅
│   │   │   ├── FeedSection           #       首页 Feed 区域
│   │   │   └── SafeRewriteHintBanner #       安全改写提示
│   │   ├── drafts/
│   │   │   ├── [id]/                 #     编辑器（Tiptap + AI 工具栏）
│   │   │   └── mine/page.tsx         #     我的草稿列表
│   │   ├── me/                       #     个人中心
│   │   │   ├── dashboard/            #       数据看板
│   │   │   ├── works/                #       我的作品
│   │   │   ├── assets/               #       我的素材
│   │   │   └── reports/              #       我的举报
│   │   ├── post/[id]/                #     文章详情页
│   │   └── rank/                     #     排行榜
│   │       ├── hot/                  #       热榜
│   │       ├── best/                 #       优质榜
│   │       └── external/             #       外部热榜
│   └── (admin)/                      #   管理后台页面组（Admin Shell 布局）
│       └── admin/
│           ├── _components/          #     AdminShell 布局组件
│           ├── prompt-lab/           #     Prompt 实验室
│           ├── rule-rechecks/        #     规则复查
│           ├── sample-audits/        #     抽样审核
│           ├── reports/              #     举报管理
│           └── offline/              #     下线管理
├── components/shell/                 # 应用级 Shell 组件
│   ├── app-shell.tsx                 #   根布局壳
│   ├── top-bar.tsx                   #   顶栏
│   ├── sidebar-nav.tsx               #   侧边栏导航
│   ├── breadcrumb.tsx                #   面包屑
│   └── ...
├── hooks/                            # 应用级 hooks（聚焦 AI 交互）
│   ├── use-streaming-generation.ts   #   SSE 流式生成
│   ├── use-safe-rewrite.ts           #   安全改写
│   ├── use-section-review.ts         #   段落审核
│   ├── use-section-regenerate.ts     #   段落重写
│   ├── use-sensitive-scan.ts         #   敏感词扫描
│   ├── use-preflight.ts             #   发布前预检
│   └── use-admin-*.ts               #   管理后台 hooks
├── lib/                              # 工具库
│   ├── tiptap/                       #   Tiptap 编辑器集成
│   ├── idb-draft-cache.ts            #   IndexedDB 草稿离线缓存
│   ├── use-autosave.ts               #   30s 自动保存
│   ├── use-draft-presence.ts         #   协作感知
│   ├── diff.ts                       #   版本 diff 工具
│   └── safety-key-map.ts            #   安全快捷键映射
└── workers/                          # Web Workers（主线程卸载）
    ├── aho-corasick.ts               #   Aho-Corasick 敏感词匹配引擎
    └── sensitive-scanner.worker.ts    #   敏感词扫描 Worker 入口
```

---

## apps/api — NestJS 11 后端

端口 `4000`。全局 JWT 认证（`APP_GUARD`），统一 Prisma 异常过滤（`APP_FILTER`）。

```
apps/api/src/
├── app.module.ts                     # 根模块 — 组装 13 个业务模块
├── config/                           # 环境变量校验 (Joi schema)
├── common/filters/                   # 全局异常过滤器
│   └── prisma-known-request.filter   #   Prisma 错误 → HTTP 标准响应
├── prisma/                           # PrismaService 单例
├── auth/                             # 认证模块
│   └── dto/                          #   登录/注册 DTO
├── drafts/                           # 草稿模块
│   ├── dto/                          #   CRUD DTO
│   └── versions/                     #   版本历史子模块
│       └── dto/
├── prompts/                          # Prompt 模板库
│   └── dto/                          #   平台/私人 Prompt DTO
├── llm/                              # AI 网关 (LLM 适配 + SSE 流式)
│   └── dto/
├── reviews/                          # 多阶段审核流水线
│   └── dto/                          #   preflight → prompt → inline → post-publish
├── reports/                          # 举报/下线处理
│   └── dto/
├── feed/                             # 内容 Feed 与发现
├── assets/                           # 素材上传 + AI 合规预审
│   └── storage/                      #   S3 (MinIO) 存储适配
├── analytics/                        # 数据看板与反馈
├── notifications/                    # 通知推送
│   └── dto/
├── admin/                            # 管理后台
│   ├── prompt-lab/                   #   Prompt 实验
│   ├── rule-recheck/                 #   规则复查
│   ├── sample-audit/                 #   抽样审核
│   └── dto/
└── external-trending/                # 外部热榜数据接入

apps/api/prisma/
└── schema.prisma                     # 17 模型 / 13 枚举的数据层定义
```

---

## packages/shared — 双端约定层

纯 TypeScript 类型、枚举、常量。零业务逻辑、零运行时依赖。前后端都引用此包来保持类型一致。

```
packages/shared/src/
├── index.ts                # Barrel re-export
├── draft-tools.ts          # 17 种 AI 工具类型定义
├── review.ts               # 审核阶段 / 评审推荐枚举与类型
├── ranking.ts              # 排行算法类型
├── post.ts                 # 文章/帖子共享 DTO
├── report.ts               # 举报类型
├── analytics.ts            # 数据分析类型
├── errors.ts               # 标准化错误码
├── sensitive-words.ts      # 敏感词过滤导出
└── sensitive-words.json    # 敏感词词典数据（Web Worker + API 双端共用）
```

构建输出到 `dist/`，由 `apps/web` 和 `apps/api` 通过 `workspace:*` 引用。

---

## packages/ui — 组件库 + hooks + 工具函数

面向 `apps/web` 的可复用 UI 资源。shadcn/ui 基础组件 + 业务组件 + 客户端工具。

```
packages/ui/src/
├── components/
│   ├── ui/                     # shadcn/ui 原子组件 (22 个)
│   │   ├── avatar, badge, button, card, checkbox,
│   │   ├── command, dialog, dropdown-menu, input, kbd,
│   │   ├── label, navigation-menu, popover, scroll-area,
│   │   ├── select, separator, sheet, skeleton, sonner,
│   │   ├── switch, tabs, tooltip
│   │   └── ...
│   ├── feed/                   # Feed 业务组件
│   │   ├── FeedList            #   列表容器
│   │   ├── PostCard            #   文章卡片 (+ .test.tsx)
│   │   ├── QualityBadge        #   质量徽章 (+ .test.tsx)
│   │   ├── RankTabs            #   排行标签切换
│   │   ├── WeightDrawer        #   权重抽屉 (+ .test.tsx)
│   │   ├── LoadMore            #   加载更多
│   │   └── FeedSkeleton        #   骨架屏
│   ├── post/                   # 文章详情业务组件
│   │   ├── PostBody            #   文章正文渲染
│   │   ├── ReactionBar         #   点赞/收藏栏
│   │   ├── ReportDialog        #   举报对话框 (+ .test.tsx)
│   │   └── ReportButton        #   举报入口
│   ├── dashboard/              # 数据看板组件
│   │   └── stat-card.tsx       #   统计卡片
│   └── shell/                  # 消费端 Shell 组件
│       ├── consumer-shell      #   C 端页面壳
│       ├── consumer-top-nav    #   C 端顶部导航
│       ├── sidebar-section     #   侧边栏区块
│       ├── theme-toggle        #   暗色切换
│       └── user-menu           #   用户菜单
├── hooks/
│   ├── use-active-prompt-id    #   当前 Prompt ID 状态
│   └── use-report              #   举报逻辑复用 hook
├── lib/
│   ├── auth.ts                 #   客户端认证工具 (+ .test.ts)
│   ├── use-auth-snapshot.ts    #   认证状态快照
│   ├── server-fetch.ts         #   SSR fetch (ISR 30s + 内网直连)
│   ├── sse.ts                  #   SSE 客户端封装
│   ├── upload-image.ts         #   图片上传 (+ .test.ts)
│   └── utils.ts                #   cn() 等通用工具
└── styles/
    └── globals.css             #   Tailwind 基础样式
```

---

## deploy — 生产部署

```
deploy/
├── Dockerfile              # API 多阶段构建 (deps → build → slim runtime)
├── docker-compose.yml      # 生产容器编排 (API + PG + Redis + MinIO)
├── nginx.conf              # 反向代理: TLS / gzip / 静态缓存 / API 转发
├── deploy.sh               # 一键部署脚本 (rsync + docker + migrate + health check)
├── aigc-web.service   # systemd 单元 (Next.js standalone, 512MB 限制)
└── .env.example            # 生产环境变量模板
```

生产拓扑：

```
nginx (:443)
  ├── /api/*          → Docker API (127.0.0.1:4000)
  ├── /_next/static/* → Next.js standalone (:3000, immutable cache)
  └── /*              → Next.js standalone (:3000)

Docker Compose:
  ├── api       (NestJS, :4000)
  ├── postgres  (PG 16, :5433)
  ├── redis     (Redis 7, :6379)
  └── minio     (S3 兼容, :9002/:9003)

systemd:
  └── aigc-web.service (Next.js standalone, :3000, MemoryMax=512M)
```

前端未容器化 — Next.js standalone Docker image 体积过大（8GB 磁盘不够），改用 systemd 直接托管。

---

## docker-compose.yml — 本地开发基础设施

仓库根目录的 `docker-compose.yml` 用于本地开发，与 `deploy/docker-compose.yml`（生产）分离。

| 服务     | 镜像                 | 端口        | 用途               |
| -------- | -------------------- | ----------- | ------------------ |
| postgres | `postgres:16-alpine` | 5432        | 主数据库           |
| redis    | `redis:7-alpine`     | 6379        | 缓存 / 会话        |
| minio    | `minio/minio:latest` | 9000 / 9001 | 对象存储 (S3 兼容) |

常用命令：`pnpm db:up` / `pnpm db:down` / `pnpm db:reset`

---

## e2e — 端到端测试

Playwright 驱动，覆盖核心用户路径：

| 测试文件                   | 覆盖场景       |
| -------------------------- | -------------- |
| `login.spec.ts`            | 登录流程       |
| `home.spec.ts`             | 首页 Feed      |
| `dashboard.spec.ts`        | 创作者数据看板 |
| `admin.spec.ts`            | 管理后台       |
| `offline-autosave.spec.ts` | 离线自动保存   |
| `republish.spec.ts`        | 重新发布       |

---

## docs — 项目文档

| 路径                         | 内容                                           |
| ---------------------------- | ---------------------------------------------- |
| `architecture.md`            | 系统架构设计（三角色模型、模块映射、决策原则） |
| `decisions/`                 | ADR 架构决策记录                               |
| `guard-llm-hybrid-review.md` | Guard + LLM 混合审核方案                       |
| `evaluation-report.md`       | 评估报告                                       |
| `close-out-report.md`        | 结营报告                                       |
| `submission.md`              | 提交材料                                       |
| `feishu-tech-doc.md`         | 飞书技术文档                                   |
| `perf/`                      | 性能分析                                       |
| `superpowers/`               | AI 能力说明                                    |

---

## 依赖关系

```
apps/web ──→ packages/ui ──→ packages/shared
   │                              ↑
   └──────────────────────────────┘

apps/api ──→ packages/shared
```

- `packages/shared` 是约定层，前后端都依赖它保持类型同步
- `packages/ui` 仅被 `apps/web` 消费，依赖 `shared`
- `apps/web` 同时依赖 `ui` 和 `shared`
- `apps/api` 仅依赖 `shared`，不依赖任何前端包
- 依赖方向严格单向，无循环

---

## 代码质量工具

| 工具        | 配置文件                          | 用途                      |
| ----------- | --------------------------------- | ------------------------- |
| Husky       | `.husky/`                         | Git hooks                 |
| lint-staged | `.lintstagedrc.json`              | 提交前增量检查            |
| Commitlint  | `commitlint.config.mjs`           | Conventional Commits 规范 |
| Prettier    | `.prettierrc` / `.prettierignore` | 代码格式化                |
| ESLint      | 各包独立配置                      | 代码质量                  |
| Vitest      | `apps/web`                        | 前端单元测试              |
| Jest        | `apps/api`                        | 后端单元测试              |
| Playwright  | `playwright.config.ts`            | 端到端测试                |
