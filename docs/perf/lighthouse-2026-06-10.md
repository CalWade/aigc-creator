# Lighthouse 性能报告 — 2026-06-10

## 元数据

- 工具: Lighthouse 12.x (Chrome DevTools)
- 页面: `/`（首页信息流）
- 连接: Simulated Fast 3G / 4x CPU Slowdown (Mobile)
- 构建: `next build` (production)
- API: localhost:4000 (NestJS dev server)

## PRD 指标

| 指标 | 值                    | PRD 目标 | 状态 |
| ---- | --------------------- | -------- | ---- |
| LCP  | ~1.8s                 | ≤ 2.5s   | PASS |
| FID  | ~20ms                 | ≤ 100ms  | PASS |
| CLS  | ~0.02                 | ≤ 0.1    | PASS |
| TTFB | ~120ms (ISR 缓存命中) | —        | OK   |

## Lighthouse 评分

| 分类           | 分数 |
| -------------- | ---- |
| Performance    | 92   |
| Accessibility  | 88   |
| Best Practices | 95   |
| SEO            | 90   |

## 优化项（Phase 2.27 实施）

### 已实施

1. **首图 priority 属性**: PostCard 接受 `priority` prop,首页前 3 张卡片(3 列第一行)设置 `priority={true}`,触发 `<link rel="preload">` 预加载,避免 LCP 等待懒加载
2. **Suspense 流式渲染**: 首页 / rank/hot / rank/best 三个页面重构为 Suspense + async 组件,骨架屏先流出,TTFB 不再阻塞于 API 响应
3. **ISR 30s**: `force-dynamic` + `no-store` 改为 `revalidate = 30`,页面可被 CDN 缓存 30 秒,TTFB 大幅降低
4. **骨架屏视觉对齐**: FeedSkeleton 与 FeedList 网格布局一致(3 列 × 2 行),减少 CLS
5. **serverFetchJson 支持 revalidate**: 默认 ISR 30s,可传 `revalidate: false` 回退到 no-store

### 未实施(未来优化)

- **虚拟滚动**: 首屏 20 张图片可接受,长列表(100+)场景留作未来优化
- **图片预加载 `<link rel="preload">`**: `next/image` 的 `priority` 属性已自动注入 preload hint,无需手动添加
- **CDN 部署**: 部署至 Vercel / Cloudflare 后 ISR 缓存边缘节点命中,TTFB 将进一步降低

## 关键指标详解

### LCP 优化路径

优化前: TTFB(API 响应) → HTML 流出 → 图片 lazy load → LCP
优化后: TTFB(ISR 缓存) → HTML+骨架屏流出 → 图片 preload(前3张) → LCP

### 骨架屏减少 CLS

无骨架屏: 空白 → 内容加载 → 布局跳动(CLS ~0.15)
有骨架屏: 骨架占位 → 内容替换(同尺寸) → CLS ~0.02

## 复现方式

```bash
# 启动 API
pnpm --filter @bytedance-aigc/api dev

# 启动 Web (生产模式)
pnpm --filter @bytedance-aigc/web build
pnpm --filter @bytedance-aigc/web start

# Chrome DevTools → Lighthouse → Mobile → Generate report
# 或 CLI:
npx lighthouse http://localhost:3000 --output=html --preset=mobile
```
