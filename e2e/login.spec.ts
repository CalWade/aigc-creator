import { test, expect } from "@playwright/test";

/**
 * /login 是纯 client-only 路由,fetch 全在浏览器侧发出 → Playwright route() 可拦截。
 * 这里覆盖最关键的 happy path:输入 handle → 调 /auth/login → 写 token → 跨 zone 跳 /studio/drafts/mine。
 */

test.describe("登录流程", () => {
  test("成功登录后跨 zone 跳转 /studio/drafts/mine 且 localStorage token 跨 zone 共享", async ({
    page,
  }) => {
    await page.route("**/auth/login", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          accessToken: "tok-fake-12345",
          user: { id: "user-fake-1", handle: "demo-author" },
        }),
      });
    });

    // /drafts/mine 落地后 client 还会发 /drafts/mine 拉稿件,mock 空列表避免后续依赖
    await page.route("**/drafts/mine", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [] }),
      });
    });

    await page.goto("/login");
    await page.getByRole("button", { name: "登录", exact: true }).click();

    // hard navigation 跨 zone 后浏览器看到 /studio/drafts/mine(consumer rewrites 转发到 studio:3001)
    await page.waitForURL("**/studio/drafts/mine");
    const token = await page.evaluate(() =>
      window.localStorage.getItem("bytedance-aigc.accessToken"),
    );
    // 同 host localStorage 自动共享 → studio 页面也能读到 consumer 写入的 token
    expect(token).toBe("tok-fake-12345");
  });

  test("后端返 401 时显示「用户不存在」错误", async ({ page }) => {
    await page.route("**/auth/login", async (route) => {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ message: "Unauthorized" }),
      });
    });

    await page.goto("/login");
    await page.getByRole("button", { name: "登录", exact: true }).click();
    await expect(page.getByText("用户不存在")).toBeVisible();
  });
});
