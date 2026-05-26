import { test, expect } from "@playwright/test";

test("首页渲染平台标题", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("AI 创作者辅助生产与分发平台");
});
