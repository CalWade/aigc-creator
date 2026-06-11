# 收回 Multi-Zones:合并 web-consumer + web-studio → apps/web

**日期**: 2026-06-11
**状态**: shipped

## 背景

项目前端曾采用 Next.js Multi-Zones 物理拆分: `apps/web-consumer`(3000, default zone) + `apps/web-studio`(3001, basePath=/studio)。这条切线的语义是"C 端读者 / B 端创作者",但与 PDF《头条 AI 前端训练营 - AI 创作者辅助生产与分发平台》对齐后发现切线错误:

- **写作者(C 端)**:既写又读,是同一个人,应在同一个 app 里零跳转
- **审核管理员(B 端)**:独立用户群,~1% 流量,是另一个产品形态

原来的拆分把"写作者的读"(web-consumer)和"写作者的写"(web-studio)切到两个进程,反而把 admin 后台和 (creator) 写作功能合并在 web-studio 里 —— 切线完全反。

## 决策

1. **收回 Multi-Zones**:合并为 `apps/web` 单 app,4 个路由组 `(reader)` + `(creator)` + `(public)` + `(admin)`
2. **URL 设计**(路由组不影响实际路径):
   - `/`、`/rank/*`、`/post/[id]` ← (reader)
   - `/drafts/*`、`/me/*` ← (creator)
   - `/login`、`/register` ← (public)
   - `/admin/*` ← (admin)
3. **导航分流**(身份单一原则):
   - AUTHOR: sidebar 显示"工作台 + 阅读"两组,无"管理"
   - ADMIN: 登录后跳 /admin,AdminShell 只显示"管理 + 返回阅读端"
4. **packages/ui 保留**为共享库

## 变更清单

### Commit 1: 搬运 web-consumer + web-studio → apps/web 骨架

- 新建 `apps/web/` 完整目录(4 路由组 + components + hooks + lib + workers)
- 合并两个 app 的 package.json dependencies(web-studio 更全,增量补 web-consumer 的)
- `next.config.ts`: 纯净版(无 basePath、无 rewrites、无 redirects)
- 修 `login/page.tsx` `/studio/*` → `/admin` + `/drafts/mine` + `router.push` 替代 `window.location.href`
- 删除 `apps/web-consumer/` 和 `apps/web-studio/`

### Commit 2: 清理 Multi-Zones 残留

- `playwright.config.ts`: 双 webServer → 单 webServer
- `e2e/*.spec.ts`: 所有 `/studio/*` 前缀去掉,注释更新
- `deploy/deploy.sh`: 双 app build → 单 web build,去掉 STUDIO_ORIGIN
- `deploy/docker-compose.yml`: 注释更新
- apps/web 内 7 个组件: 去掉 Multi-Zones 相关注释,`<a>` → `<Link>`,去掉 `/studio/` 前缀
- `globals.css`: 去掉 Multi-Zones 注释

### Commit 3: 文档同步

- `README.md`: 去掉 Multi-Zones 拓扑描述、更新本地开发说明
- rbac-mini spec 移到 shipped/
- 本文档直接放 shipped/

## 验证结果

- `pnpm typecheck` / `pnpm test`(66 + 192) / `pnpm build` 全绿
- `apps/web` build 16 条路由全部识别
- `apps/web-consumer` 和 `apps/web-studio` 目录已删除
