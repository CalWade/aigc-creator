import { test, expect, type Route } from "@playwright/test";

/**
 * Phase 2.15 — 发布后二次编辑 e2e。
 *
 * 全 mock 后端,验证两条链路:
 *   1. /me/works PUBLISHED 项 →「继续编辑草稿」→ POST /drafts/:id/edit → 跳 /drafts/:id
 *   2. 编辑器页 publishedAt 非空 → RepublishBanner 出现 +「查看线上」链接
 */

const DRAFT_ID = "draft-e2e-republish";

async function seedAuth(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("bytedance-aigc.accessToken", "tok-e2e-republish");
    window.localStorage.setItem(
      "bytedance-aigc.user",
      JSON.stringify({ id: "u1", handle: "demo-author" }),
    );
  });
}

test.describe("二次编辑链路", () => {
  test("/me/works PUBLISHED →「继续编辑草稿」→ POST /edit → 跳编辑器", async ({ page }) => {
    await seedAuth(page);

    let editCalls = 0;
    await page.route("**/me/works**", async (route: Route) => {
      if (route.request().resourceType() === "document") {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          items: [
            {
              id: DRAFT_ID,
              title: "已发布的稿",
              status: "PUBLISHED",
              mode: "FAST",
              publishedAt: "2026-06-08T00:00:00.000Z",
              updatedAt: "2026-06-08T00:00:00.000Z",
              qualityOverall: 88,
              recommendation: "ALLOW",
              offlineReason: null,
              offlineAt: null,
            },
          ],
        }),
      });
    });

    await page.route(`**/drafts/${DRAFT_ID}/edit`, async (route: Route) => {
      if (route.request().method() === "POST") {
        editCalls += 1;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ id: DRAFT_ID, status: "DRAFT", version: 2 }),
        });
        return;
      }
      await route.fallback();
    });

    // 跳到 /drafts/:id 后还会拉详情 — 简单 mock 一下避免页面跑飞
    await page.route(`**/drafts/${DRAFT_ID}`, async (route: Route) => {
      if (route.request().resourceType() === "document") {
        await route.fallback();
        return;
      }
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            id: DRAFT_ID,
            authorId: "u1",
            title: "已发布的稿",
            body: { type: "doc", content: [{ type: "paragraph" }] },
            publishedBody: { type: "doc", content: [{ type: "paragraph" }] },
            publishedTitle: "已发布的稿",
            publishedVersion: 1,
            publishedAt: "2026-06-08T00:00:00.000Z",
            mode: "FAST",
            version: 2,
            updatedAt: "2026-06-09T00:00:00.000Z",
          }),
        });
        return;
      }
      await route.fallback();
    });

    await page.goto("/me/works");
    await expect(page.getByText("已发布的稿")).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: "继续编辑草稿" }).click();
    await page.waitForURL(`**/drafts/${DRAFT_ID}`, { timeout: 10_000 });
    expect(editCalls).toBe(1);
  });

  test("编辑器页 publishedAt 非空 → RepublishBanner 显示 +「查看线上」链接", async ({ page }) => {
    await seedAuth(page);

    await page.route(`**/drafts/${DRAFT_ID}`, async (route: Route) => {
      if (route.request().resourceType() === "document") {
        await route.fallback();
        return;
      }
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            id: DRAFT_ID,
            authorId: "u1",
            title: "已发布的稿(二发中)",
            body: { type: "doc", content: [{ type: "paragraph" }] },
            publishedBody: { type: "doc", content: [{ type: "paragraph" }] },
            publishedTitle: "已发布的稿",
            publishedVersion: 1,
            publishedAt: "2026-06-08T00:00:00.000Z",
            mode: "FAST",
            version: 2,
            updatedAt: "2026-06-09T00:00:00.000Z",
          }),
        });
        return;
      }
      await route.fallback();
    });

    await page.goto(`/drafts/${DRAFT_ID}`);

    const banner = page.getByTestId("republish-banner");
    await expect(banner).toBeVisible({ timeout: 10_000 });
    await expect(banner.getByRole("link", { name: /查看线上/ })).toHaveAttribute(
      "href",
      `/post/${DRAFT_ID}`,
    );
  });
});
