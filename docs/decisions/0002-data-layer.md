# ADR-0002: 数据层 ORM——Prisma

- Status: Accepted
- Date: 2026-05-26

## Decision

`apps/api` 数据层使用 **Prisma**(v5)作为 ORM。

- 单一 schema 源:`apps/api/prisma/schema.prisma`,种子数据 `apps/api/prisma/seed.ts`。
- 迁移工作流:`prisma migrate dev`(开发) / `prisma migrate deploy`(生产)。
- NestJS 集成:自写 `PrismaService extends PrismaClient implements OnModuleInit`,挂在 `@Global()` `PrismaModule` 上,各业务模块通过构造函数注入。
- 不引入 Redis ORM。Redis 直接用 `ioredis`,封装成 `RedisService`,由独立 `CacheModule` 提供。

## Reason

- **类型推导最强**:`select` / `include` 的结果类型自动缩窄,审核切面常见的"只取 `{id, title, body}` 喂 LLM"场景能在编译期保证字段不漏不多。TypeORM 做不到。
- **三周单人交付,踩坑成本最低**:Prisma 文档 / SO 答案 / AI 助手训练数据密度最高;Drizzle 生态新、TypeORM 0.2↔0.3 文档断层都会拖慢节奏。
- **迁移工作流开箱即用**:`prisma migrate dev` 一条命令完成 SQL 生成 + 应用 + 历史记录;配合 `pnpm db:reset`(已在 Phase 0 Step 6 落地),本地重建链路顺滑。
- **Json 字段一等公民**:架构草稿 §4.1 中 `drafts.body`(rich-json)、`audit_records.payload`、`draft_versions.snapshot` 都是 jsonb,Prisma 的 `Json` 类型直接对应,无需额外转换层。
- **schema.prisma 即文档**:10 张主表的 diff 集中在一个文件,比散落的装饰器更容易 review,也更适合 ADR 演化追踪。

## 否决项

- **TypeORM**:NestJS 官方有 `@nestjs/typeorm`,装饰器风味与 Nest 一致——但类型推导在 partial select 场景明显落后,migration 工作流(generate / synchronize 两套 + 0.3 版本变更)在 2026 年仍是新人陷阱。
- **Drizzle**:SQL-like 语法 + 零运行时是技术上最优雅的方案,但生态新、NestJS 集成需自包装、踩坑要翻 GitHub issue,与"三周交付"约束冲突。预留下一项目使用。

## 代价(已评估,可接受)

- **额外 query engine 二进制**:Prisma 5 自带 Rust query engine,容器镜像 +~30MB,运行时多一个进程。开发本机无感;Phase 2 上线时如有镜像瘦身需求再评估 `engineType = "library"` 模式。
- **DSL 不是 TS**:`schema.prisma` 是独立 DSL,需要 IDE 插件高亮。但只在 schema 定义阶段出现,业务代码 100% TS,认知割裂可控。
- **NestJS 集成无官方包装**:需自写 ~30 行 `PrismaService`,但这是 Prisma 官方文档首例,模板成熟,不构成阻碍。

## 边界(不在本 ADR 范围)

- **表结构契约**:具体字段、索引、关系约束在 Phase 1 第一次写 schema 时确定,通过 PR 落地,不再单独 ADR 化。
- **审计/事件溯源**:架构草稿 §6 已默认"暂不引入",维持。
- **缓存层抽象**:Redis 用法 (`hot:board:zset` / `sse:stream:{requestId}` / `audit:rate:{userId}` / `cache:prompt:platform`)分散在各业务模块,不在数据层 ORM 决策范围。
- **向量检索**:如 Phase 1 之后需要内容相似度,届时再决定是 `pgvector/pgvector:pg16` 镜像 + Prisma `Unsupported("vector")` 字段,还是独立向量库。本 ADR 不预设。

## 触发再决策的信号

- Prisma query engine 二进制成为部署瓶颈(容器镜像 / 冷启动);
- 复杂 SQL(窗口函数 / CTE / 全文检索)在 Prisma 中表达困难,频繁需要 `$queryRaw` 兜底;
- 团队从单人扩展,出现并行写多张表的需求,Prisma 的 transaction API 制约协作。

满足任一即可重新评估,届时新增 ADR-00xx 替代本决策,不修改本文件。
