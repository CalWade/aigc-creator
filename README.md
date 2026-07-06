# AI 创作者辅助生产与分发平台

[![CI](https://github.com/CalWade/aigc-creator/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/CalWade/aigc-creator/actions/workflows/ci.yml)

面向创作者的 AI 辅助生产与分发平台，覆盖**得力助手 / 守门员 / 导航员**三角色叙事，专注中长图文（资讯形态）。

## 文档

- [功能清单（149 项）](./docs/feature-list.md)
- [项目目录结构](./docs/project-structure.md)
- [Guard + LLM 双路混合审核技术文档](./docs/guard-llm-hybrid-review.md)
- [架构决策记录](./docs/decisions/)
- [Lighthouse 性能报告](./docs/perf/lighthouse-2026-06-10.md)
- [安全审核评测报告](./docs/perf/safety-eval-2026-06-11.md)

## 核心能力

- **双轨创作**：FAST 模式（AI 主导：选题→大纲→流式正文）+ FINE 模式（人主导 + 9 种 AI 工具卡）
- **两层 Prompt 体系**：24 条平台内置（9 默认 + 9 风格 + 6 审核）+ 私人复制编辑 + 3 快照版本管理
- **5 阶段审核链路**：Prompt 审核 → 敏感词扫描（Web Worker Aho-Corasick）→ 流式段落审核（连续违规中断）→ 发布前预检（Guard+LLM 双路）→ 发布后复审
- **4 维质量评分**：内容价值 / 表达质量 / 读者体验 / 传播潜力
- **加权排序分发**：`score = α·质量 + β·热度 + γ·时间衰减 + δ·外部趋势`，前端权重可热调
- **离线优先编辑器**：IndexedDB 快照 + 30s 云端保存 + 版本乐观锁 + 多 tab 协作感知
- **Prompt 实验室**：测试集 → 批量评估（3 次运行 + 一致性）→ 版本对比 → 上线/回滚

## 技术栈

| 层       | 选型                                                       |
| -------- | ---------------------------------------------------------- |
| Monorepo | pnpm workspace                                             |
| 前端     | Next.js 16 + React 19 + Tailwind v4 + TipTap（`apps/web`） |
| 后端     | NestJS 11 + Prisma 5（`apps/api`）                         |
| 共享     | TypeScript 类型 / 常量 / 纯函数（`packages/shared`）       |
| UI 组件  | shadcn/ui + Radix UI + 业务组件（`packages/ui`）           |
| 数据     | PostgreSQL 16 + Redis 7 + MinIO（Docker Compose）          |
| AI       | OpenAI SDK 兼容层（DeepSeek / 火山方舟 / OpenAI 均可）     |
| 审核     | 阿里云 MultiModalGuard + LLM 双路混合                      |
| 测试     | Vitest（前端单测）+ Jest（后端单测）+ Playwright（E2E）    |
| CI       | GitHub Actions（lint / typecheck / test / build）          |

## 本地开发

> 需要：Node ≥ 22、pnpm ≥ 10、Docker（含 Compose v2）

```bash
cp .env.example .env          # 配置环境变量
pnpm install                  # 安装依赖
pnpm db:up                    # 启动 PostgreSQL + Redis + MinIO
pnpm prisma:migrate           # 应用数据库迁移
pnpm prisma:seed              # 灌入种子数据（24 条平台 Prompt + 30 篇 demo 文章 + PostStat）
pnpm dev:all                  # 启动 web (:3000) + api (:4000)
```

| 入口     | URL                                  |
| -------- | ------------------------------------ |
| 首页     | `http://localhost:3000/`             |
| 登录     | `http://localhost:3000/login`        |
| 工作台   | `http://localhost:3000/me/dashboard` |
| 草稿列表 | `http://localhost:3000/drafts/mine`  |
| 管理后台 | `http://localhost:3000/admin`        |

### 常用命令

| 命令                  | 作用                     |
| --------------------- | ------------------------ |
| `pnpm db:up`          | 启动 PG + Redis + MinIO  |
| `pnpm db:down`        | 停止容器（保留数据）     |
| `pnpm db:reset`       | 停止并删除数据卷（谨慎） |
| `pnpm prisma:migrate` | 生成 + 应用迁移          |
| `pnpm prisma:seed`    | 灌入种子数据             |
| `pnpm prisma:studio`  | Prisma Studio 浏览数据   |
| `pnpm test`           | 全部单元测试             |
| `pnpm e2e`            | Playwright E2E 测试      |
| `pnpm typecheck`      | TypeScript 类型检查      |
| `pnpm lint`           | ESLint 代码质量检查      |

### LLM 配置

后端通过 OpenAI SDK + 自定义 `baseURL` 接入，`.env` 必须填：

```
LLM_BASE_URL=<OpenAI 兼容 endpoint>
LLM_API_KEY=<密钥>
LLM_MODEL=<模型标识>
```

切换厂商只改这三项 + 重启，代码不绑定厂商。

## License

[MIT](./LICENSE)
