# AI 创作者辅助生产与分发平台 — 完整功能清单

> 基于 281 条 git commit（143 feat / 46 docs / 27 chore / 22 test / 19 fix / 18 refactor / 3 ci / 2 style / 1 perf）+ 后端 14 个 NestJS 模块源码 + 前端 22 个页面源码 + 4 份项目文档交叉比对汇总。
>
> 生成日期：2026-07-06

---

## Commit 分布说明

全仓库共 281 个 commit（0 merge），其中 `feat` 类型 143 个。但大量 feat commit 是同一功能的子任务拆分（例如 Phase 2.4 信息流分发 = 18 个 feat commit = 1 个功能模块），因此功能项数 ≠ commit 数。本清单按功能维度去重后共 **149 项**。

---

## 一、用户认证与权限（10 项）

| #   | 功能                         | 说明                                                                                    |
| --- | ---------------------------- | --------------------------------------------------------------------------------------- |
| 1   | 手机号 + 短信验证码登录/注册 | 接入火山引擎 SMS（含 mock 降级）                                                        |
| 2   | 邮箱 + 密码登录/注册         |                                                                                         |
| 3   | 邮箱 + 验证码登录/注册       | 接入 Resend 邮件服务（含 mock 降级）                                                    |
| 4   | Handle 用户名快捷登录        | Demo 快捷入口，登录页 quick-fill 按钮                                                   |
| 5   | JWT 全局认证守卫             | Bearer token，全局 `JwtAuthGuard`                                                       |
| 6   | RBAC 角色权限                | `role: AUTHOR / ADMIN`，JWT 携带 role，三层门控（sidebar + command-menu + route guard） |
| 7   | AdminGuard 后台保护          | `role === "ADMIN"` fail-closed                                                          |
| 8   | 认证事件审计                 | 所有登录/注册/登出/发码事件写入 `AuthEvent` 表（IP、UA、method）                        |
| 9   | 验证码存储                   | Redis 存储 5min TTL，一次性消费，dev/CI 内存降级                                        |
| 10  | 环境变量 Joi 校验            | 启动时 fail-fast 校验                                                                   |

## 二、AI 内容创作 — 得力助手（12 项）

| #   | 功能                          | 说明                                                                                                                              |
| --- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 11  | FAST 模式（AI 主导生成）      | 选题 → 大纲确认 → SSE 逐段流式生成，帧协议 `section.start` / `token` / `section.end` / `done` / `error`                           |
| 12  | FINE 模式（人主导 + AI 工具） | 手动 TipTap 编辑 + 按需调 AI 工具卡                                                                                               |
| 13  | AI 大纲生成                   | LLM 生成 3-8 段大纲，JSON 校验                                                                                                    |
| 14  | SSE 逐段流式正文生成          | cursor-based resume，可断点续传                                                                                                   |
| 15  | 段落重新生成                  | `useRegenerateSection` 带 `headings:[heading]` 单段重流                                                                           |
| 16  | 9 种 AI 写作工具卡            | REWRITE_FLUENT / EXPAND / TRANSFORM_STYLE / HEADLINE_SUB / HEADLINE_NEW / REWRITE_OPENING / ADD_FACTS / ADD_TOPIC / IMAGE_SUGGEST |
| 17  | AI 气泡菜单（AiBubbleMenu）   | 选中文段浮动菜单，快速调用改写工具                                                                                                |
| 18  | 两层 Prompt 体系              | 24 条平台内置（9 默认 + 9 风格 + 6 审核/改写）+ 私人复制编辑                                                                      |
| 19  | 平台 Prompt 风格款 + 设计注释 | 每工具配默认款 + 风格款，含 `designNote` PE 经验                                                                                  |
| 20  | 私人 Prompt 3 快照版本管理    | 编辑自动 snapshot（上限 3 条），「恢复默认」按钮，「历史 ▾」回滚                                                                  |
| 21  | LLM 适配层                    | OpenAI SDK 兼容，改 `.env` 三项即可切换厂商（DeepSeek / 火山方舟 / OpenAI）                                                       |
| 22  | LLM 流式封装                  | `chatStream()` RxJS Observable，finish_reason 归一，error 帧不断连                                                                |

## 三、富文本编辑器（14 项）

| #   | 功能                   | 说明                                                                     |
| --- | ---------------------- | ------------------------------------------------------------------------ |
| 23  | TipTap 富文本编辑器    | 基于 ProseMirror，JSON 存储格式，6 按钮工具栏（H1/H2/bold/italic/lists） |
| 24  | 1.5s 防抖本地自动保存  | debounce PATCH                                                           |
| 25  | 30s 周期云端自动保存   | `useAutosave` setInterval + online 事件即时补 push                       |
| 26  | IndexedDB 离线快照     | 断网不丢数据，上线自动同步                                               |
| 27  | 版本号乐观锁冲突检测   | `baseVersion` → 409 VERSION_CONFLICT                                     |
| 28  | 离线冲突 fork          | OFFLINE_CONFLICT 版本备份，云端覆盖编辑器                                |
| 29  | 多标签页协作感知       | BroadcastChannel 检测同草稿双开，只读锁                                  |
| 30  | 版本历史快照           | AUTO（5min throttle, 30 cap）/ NAMED / PUBLISHED / OFFLINE_CONFLICT      |
| 31  | 版本 diff 可视化       | side-by-side ProseMirror JSON diff（fast-diff）                          |
| 32  | 版本回滚               | 回滚到任意版本，切回 DRAFT 需重新发布                                    |
| 33  | 编辑器专注模式         | Notion DNA 布局风格                                                      |
| 34  | 四类状态 Banner        | Readonly(红) > Offline(黄) > Conflict(蓝) > Republish(蓝)                |
| 35  | 图片插入素材库选择弹窗 | AssetPicker（我的素材 / 上传 / 图库）                                    |
| 36  | SSR 配方               | `immediatelyRender: false` 避免 hydration mismatch                       |

## 四、内容安全与质量管控 — 守门员（29 项）

### 4.1 五阶段审核链路

| #   | 功能                      | 说明                                                             |
| --- | ------------------------- | ---------------------------------------------------------------- |
| 37  | ① Prompt 输入审核         | 选题/hint 失焦 800ms 防抖触发 `POST /reviews/prompt`，7 类目审核 |
| 38  | ② 输入阶段敏感词扫描      | Web Worker + Aho-Corasick 自动机，1.5s 防抖，140 条敏感词库      |
| 39  | 敏感词波浪线标注          | TipTap ProseMirror 插件，红/橙/灰三级 severity 样式              |
| 40  | ③ 流式段落审核            | `onSectionEnd` fire-and-forget `POST /reviews/section`，红框标注 |
| 41  | 连续违规中断机制          | 同 sessionId 连续 ≥3 段 high → `abortStream` 中断 AI 生成        |
| 42  | ④ 发布前预检（PREFLIGHT） | Guard + LLM 安全 + LLM 质量，三路并发，落 Review 记录            |
| 43  | ⑤ 发布后举报复审          | fire-and-forget LLM 复审，双路失败 fallback ALLOW 等 admin       |
| 44  | 5% 抽样巡检               | Postgres `ORDER BY RANDOM()` 抽样，PASS/FAIL（FAIL→自动下线）    |
| 45  | 规则更新批量复审          | p-limit 并发=2 全量扫 PUBLISHED，BLOCK→自动下线                  |

### 4.2 审核引擎

| #   | 功能                           | 说明                                                                       |
| --- | ------------------------------ | -------------------------------------------------------------------------- |
| 46  | Guard + LLM 双路混合审核       | 阿里云 MultiModalGuard（~200ms）+ DeepSeek LLM（~1.5s）并行，结果取严      |
| 47  | mergeSafety 合并策略           | severity 取高，score 取 max，hits 取并集去重，reason 取 winner             |
| 48  | 6 维安全类目                   | 涉黄 / 涉赌 / 涉毒 / 辱骂攻击 / 欺诈 / 黑产广告                            |
| 49  | 6 个 YAML 规则库               | 每条含 rule_id / category / severity / prompt_hint / 正负样本              |
| 50  | 规则库 prompt_hint 注入        | 启动时 `loadRules()` 加载，`buildPromptHints()` 拼入 system prompt         |
| 51  | 4 维质量评分                   | 内容价值 / 表达质量 / 读者体验 / 传播潜力，与安全审核共享 LLM 调用省 token |
| 52  | Severity → Recommendation 映射 | high→BLOCK / medium→WARN / low→ALLOW；全 low 但 quality<60 也 WARN         |
| 53  | 一键合规替代（SAFE_REWRITE）   | 双温度 0.6/1.0 候选 SSE 并发生成，独立采用/丢弃                            |
| 54  | 审核结果内联标注               | TipTap review-decorations 插件，word + section 双来源                      |
| 55  | 审核准确率评测                 | ChineseHarm-Bench 310 条样本，Accuracy 92.26%，Macro-F1 0.9261             |

### 4.3 Prompt 实验室

| #   | 功能                    | 说明                                                  |
| --- | ----------------------- | ----------------------------------------------------- |
| 56  | 测试集管理              | `PromptTestCase` 按 tool 维护评估样本                 |
| 57  | 批量评估                | `runEval()` p-limit 并发=2，accuracy=匹配数/总数      |
| 58  | 版本对比                | candidate vs current，accuracyDelta + canPromote      |
| 59  | 人工确认上线（promote） | 检查 accuracy 不回退，写 snapshot，记 PromptLabAction |
| 60  | 可追溯回滚              | rollback 到 fromPromptId，记 PromptLabAction          |

## 五、素材管理（10 项）

| #   | 功能                     | 说明                                                                |
| --- | ------------------------ | ------------------------------------------------------------------- |
| 61  | 图片上传                 | 5MB 限制，JPEG/PNG/WebP/GIF，S3/MinIO 存储                          |
| 62  | AI 生图                  | `POST /assets/generate`（当前 placeholder URL）                     |
| 63  | 自动打标签               | LLM 解析 scene + subject tags（1-3 each），失败 fallback `["其他"]` |
| 64  | 标签搜索                 | `GET /assets/search?scene=&subject=&aiOnly=`                        |
| 65  | 内容推荐                 | `POST /assets/recommend` tag 命中评分 topN                          |
| 66  | 入库合规校验（INGEST）   | Guard 图像审核 + LLM 元启发式，BLOCK 拒绝入库                       |
| 67  | 插入前校验（PRE_INSERT） | `POST /assets/:id/check-for-insert`，high→WARN 不 BLOCK             |
| 68  | AI 未标注检测            | LLM 判 `ai_unmarked=high` 且未声明 → INGEST 提升至 BLOCK            |
| 69  | 4 维度审核               | 人脸 / 水印 / 敏感内容 / AI 未标记                                  |
| 70  | 素材库选择弹窗           | AssetPicker（我的素材 / 上传 / 图库 tab）                           |

## 六、内容分发与榜单 — 导航员（15 项）

| #   | 功能                     | 说明                                                                      |
| --- | ------------------------ | ------------------------------------------------------------------------- |
| 71  | 加权排序公式             | `score = α·质量 + β·热度 + γ·时间衰减 + δ·外部趋势`                       |
| 72  | 前端权重热调             | WeightDrawer localStorage + `router.replace(?alpha&beta&gamma)`           |
| 73  | 热点榜（hot）            | τ=12h，α=0.2/β=0.5/γ=0.3，偏重实时热度                                    |
| 74  | 爆文榜（best）           | τ=72h，α=0.5/β=0.4/γ=0.1，偏重质量沉淀                                    |
| 75  | 信息流（feed）           | τ=24h，窗口=30d，默认 α=0.5/β=0.3/γ=0.2                                   |
| 76  | Cursor 分页              | base64url 编码含权重快照，权重不一致返 400                                |
| 77  | 归一化防 outlier         | pool <50 用 P95 作 max                                                    |
| 78  | HotnessScore             | `log(impression+1) + click×2 + like×5 + collect×8 + share×10 - report×20` |
| 79  | TimeDecayScore           | `100 * exp(-deltaHours / tau)`                                            |
| 80  | 抖音热榜外部数据源       | 实时抓取，5min 缓存，stale-while-error，UA 轮换，请求去重                 |
| 81  | 抖音热榜「以此选题创作」 | 一键跳转 FAST 模式自动建稿                                                |
| 82  | 外部趋势匹配评分         | `getMatchScore()` / `getBatchMatchScores()` 滑动窗口分词 + 子串匹配       |
| 83  | 无限滚动加载             | IntersectionObserver + LoadMore                                           |
| 84  | ISR 30s 缓存             | `revalidate = 30`，CDN 可缓存                                             |
| 85  | Suspense 流式渲染        | 骨架屏先流出，TTFB 不阻塞于 API                                           |

## 七、文章详情与互动（6 项）

| #   | 功能                 | 说明                                                                      |
| --- | -------------------- | ------------------------------------------------------------------------- |
| 86  | 文章详情页（SSR）    | 标题 / 作者 / 质量徽章 / 热度 / 封面 / PostBody / ReactionBar             |
| 87  | TipTap JSON 正文渲染 | PostBody 组件                                                             |
| 88  | 点赞 / 收藏反应      | 幂等 add/remove，unique 约束 + P2002/P2025 处理                           |
| 89  | 分享功能             |                                                                           |
| 90  | 用户举报             | 8 类目 + 补充说明（≤500 字），`@@unique([reporterId, postId])` 防灌水     |
| 91  | 举报 LLM 复审        | fire-and-forget `reviewPostPublish`，写 `llmRecommendation` / `llmReason` |

## 八、创作者中心（10 项）

| #   | 功能             | 说明                                                                                                     |
| --- | ---------------- | -------------------------------------------------------------------------------------------------------- |
| 92  | 数据看板         | 总稿件数 / 已发布 / 已下线 / 曝光 / 点击 / 点赞 / 收藏 / 分享 / 举报 / 平均质量 / 优质率 / 互动率 / Top5 |
| 93  | 我的作品列表     | ALL/PUBLISHED/DRAFT/OFFLINE 四 tab                                                                       |
| 94  | 数据回流诊断     | 4 条诊断规则推荐 AI 工具（好文被埋没→新标题 / 标题吸但留不住→改开头 / 话题冷→补话题 / 低互动→补钩子）    |
| 95  | 一键跳工具       | 诊断卡片 → `/drafts/:id?tool=HEADLINE_NEW` 自动打开 Prompt 抽屉                                          |
| 96  | 作者主动下线     | `POST /drafts/:id/takedown`（PUBLISHED→OFFLINE）                                                         |
| 97  | OFFLINE 重新提审 | `POST /drafts/:id/restore-from-offline`（OFFLINE→DRAFT）                                                 |
| 98  | 发布后二次编辑   | `POST /drafts/:id/edit`（PUBLISHED→DRAFT），线上版本保留可见                                             |
| 99  | 热度继承开关     | env `REPUBLISH_HOTNESS_INHERIT`，二发时是否清零 PostStat                                                 |
| 100 | 被举报记录页     | `/me/reports` cursor 翻页                                                                                |
| 101 | 素材管理页       | `/me/assets` 我的素材 + 图库双 tab                                                                       |

## 九、管理后台（12 项）

| #   | 功能               | 说明                                                                         |
| --- | ------------------ | ---------------------------------------------------------------------------- |
| 102 | Admin 总览看板     | 用户/稿件/举报/审核/素材计数 + block/warn 率 + 平均质量 + 健康度条           |
| 103 | 举报管理工作台     | PENDING/RESOLVED/ALL 三 tab，LLM 推荐处置 + 手动裁决（OFFLINE/WARN/DISMISS） |
| 104 | 举报一键下线       | OFFLINE 走 `$transaction` 同时更新 Report + Draft 状态                       |
| 105 | 直接下线           | `POST /admin/drafts/:id/offline` 按 Draft ID 强制下线 + 通知                 |
| 106 | 抽样巡检页         | 触发抽样 dialog + PASS/FAIL 决策 + tab 过滤                                  |
| 107 | 规则复审页         | 触发批量复审 + 历史列表（scan/offline 计数）                                 |
| 108 | Prompt 管理列表    | 按 tool type 列出平台 Prompt，复制 ID，一键回滚                              |
| 109 | 测试集管理页       | input→expected 评估样本 CRUD                                                 |
| 110 | 评估运行列表       | accuracy/stability 指标历史                                                  |
| 111 | 评估运行详情/对比  | candidate vs current，accuracy delta，一键 promote                           |
| 112 | Admin Sidebar 布局 | 独立 AdminShell，admin 不见作者侧入口                                        |
| 113 | 登录按 role 分流   | admin→`/admin`，author→`/drafts/mine`                                        |

## 十、通知系统（4 项）

| #   | 功能                  | 说明                                                                                       |
| --- | --------------------- | ------------------------------------------------------------------------------------------ |
| 114 | 通知模型              | 5 类型：PUBLISH_APPROVED / PUBLISH_REJECTED / POST_TAKEN_DOWN / HOT_RANK / MILESTONE_VIEWS |
| 115 | NotificationBell 组件 | 铃铛 + 红点 badge + Popover 抽屉列表                                                       |
| 116 | 通知 CRUD             | cursor 分页 / 单条已读 / 全部已读 / 未读计数                                               |
| 117 | 跨模块触发            | 发布通过 / 预检 BLOCK / 管理员下线 三处自动发通知                                          |

## 十一、全局 UX 与工程化（13 项）

| #   | 功能                    | 说明                                                              |
| --- | ----------------------- | ----------------------------------------------------------------- |
| 118 | ⌘K 命令面板             | 导航 / 主题 / 账户，role-aware（admin/author/anonymous 不同选项） |
| 119 | AppShell 布局           | Sidebar + TopBar + Breadcrumb                                     |
| 120 | 暗色/亮色/系统主题      | next-themes                                                       |
| 121 | shadcn/ui 组件库        | 22 个原语（packages/ui）                                          |
| 122 | oklch 双模式 token 体系 | globals.css 设计令牌                                              |
| 123 | next/font 字体          | JetBrains Mono 等宽 + 内容字体                                    |
| 124 | Sonner 全局 Toast       |                                                                   |
| 125 | 全局 Prisma 异常过滤    | P2025→404 / P2003→400 / P2002→409                                 |
| 126 | LLM 降级策略            | 审核双路任一失败不影响另一路；LLM 解析失败 fallback 全 low        |
| 127 | 未登录引导登录          | 侧边栏 / 首页横幅 / 热榜创作按钮三层入口                          |
| 128 | 首图 priority 预加载    | 前 3 张卡片 `priority={true}`                                     |
| 129 | 骨架屏                  | FeedSkeleton 与 FeedList 布局对齐减少 CLS                         |
| 130 | Lighthouse 性能         | Desktop LCP 1.08s / FID ~20ms / CLS 0                             |

## 十二、测试与 CI（11 项）

| #   | 功能                       | 说明                                                                      |
| --- | -------------------------- | ------------------------------------------------------------------------- |
| 131 | 后端 Jest 单测             | 174+ 用例                                                                 |
| 132 | 后端 e2e 测试              | 175+ 用例                                                                 |
| 133 | 前端 Vitest 单测           | 90+ 用例                                                                  |
| 134 | Playwright E2E             | 6 文件（login / home / dashboard / admin / offline-autosave / republish） |
| 135 | GitHub Actions CI          | lint / typecheck / test / build 四关                                      |
| 136 | Husky + lint-staged        | 提交前自动 lint + 类型检查                                                |
| 137 | Commitlint                 | Conventional Commits 规范                                                 |
| 138 | 安全审核 eval 脚本         | `eval-safety.ts` 270 fixtures，Accuracy <0.90 exit(1)                     |
| 139 | eval 聚合纯函数测试        | `eval-safety-aggregator.spec.ts`                                          |
| 140 | ChineseHarm-Bench 采样脚本 | `sample-chineseharm.py` HuggingFace 抽 300 条                             |
| 141 | 抖音 API smoke 测试        | `douyin-smoke.ts`                                                         |

## 十三、部署与基础设施（8 项）

| #   | 功能                       | 说明                                                      |
| --- | -------------------------- | --------------------------------------------------------- |
| 142 | Monorepo（pnpm workspace） | apps/web + apps/api + packages/shared + packages/ui       |
| 143 | Docker Compose 本地基建    | PostgreSQL 16 + Redis 7 + MinIO                           |
| 144 | 生产部署配置               | Dockerfile + docker-compose + nginx + systemd + deploy.sh |
| 145 | Nginx 反向代理             | TLS / gzip / 静态缓存 / API 转发                          |
| 146 | Prisma migrations          | 版本化数据库迁移                                          |
| 147 | Prisma seed                | 平台默认 24 条 Prompt 种子数据                            |
| 148 | S3 兼容存储策略            | S3StorageService / MockStorageService 按 env 切换         |
| 149 | 一键启动 `pnpm dev:all`    | web + api 双进程并行                                      |

---

## 统计汇总

| 类别               | 数量    |
| ------------------ | ------- |
| 认证与权限         | 10      |
| AI 内容创作        | 12      |
| 富文本编辑器       | 14      |
| 内容安全与质量管控 | 29      |
| 素材管理           | 10      |
| 内容分发与榜单     | 15      |
| 文章详情与互动     | 6       |
| 创作者中心         | 10      |
| 管理后台           | 12      |
| 通知系统           | 4       |
| 全局 UX 与工程化   | 13      |
| 测试与 CI          | 11      |
| 部署与基础设施     | 8       |
| **合计**           | **149** |

## 数据来源

- Git 历史：281 条 commit（`git log --oneline` 全量）
- 后端源码：`apps/api/src/` 14 个 NestJS 模块
- 前端源码：`apps/web/src/app/` 22 个页面 + components/hooks/lib/workers
- 项目文档：`docs/architecture.md` / `docs/project-structure.md` / `docs/submission.md` / `README.md`
