import { test, expect } from "@playwright/test";

/**
 * 首页是 SSR 路由,会在 Next.js server 侧调 /feed —— Playwright route() 拦不到 server-side fetch。
 * 因此这里走 mock:用 page.route 拦截 SSR 之后客户端补发的 /feed 请求,SSR 时若失败由 page.tsx 自己抛错。
 * 但 layout 的 <title> 来自 metadata,无 SSR 数据依赖 → 我们以此作为最稳定 smoke 检验。
 */

test("首页 layout metadata 渲染平台标题", async ({ page }) => {
  // 即使 /feed 500,html 头部 title 仍由 metadata 渲染。
  await page.route("**/feed*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items: [], nextCursor: null }),
    });
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveTitle("AI 创作者辅助生产与分发平台");
});
