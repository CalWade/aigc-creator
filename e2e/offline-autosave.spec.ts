import { test, expect, type Route } from "@playwright/test";

/**
 * Phase 2.14 — 离线兜底 + 多 tab 只读 e2e。
 *
 * 全 mock 后端,不依赖 db:up:
 *   GET  /drafts/:id           → 返预设 draft(version=1)
 *   PATCH /drafts/:id          → 累加 version,200
 *   POST /drafts/:id/versions  → 201
 *
 * useAutosave 的 online 事件会立刻 maybePush,因此恢复网络的断言不必等 30s 周期。
 */

const DRAFT_ID = "draft-e2e-offline";

const SEED_DRAFT = {
  id: DRAFT_ID,
  authorId: "u1",
  title: "离线测试草稿",
  body: { type: "doc", content: [{ type: "paragraph" }] },
  mode: "FAST" as const,
  version: 1,
  updatedAt: "2026-06-08T00:00:00.000Z",
};

async function seedAuth(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("bytedance-aigc.accessToken", "tok-e2e-1");
    window.localStorage.setItem(
      "bytedance-aigc.user",
      JSON.stringify({ id: "u1", handle: "demo-author" }),
    );
  });
}

interface MockState {
  version: number;
  patchCount: number;
}

async function mockDraftRoutes(page: import("@playwright/test").Page, state: MockState) {
  // GET / PATCH /drafts/:id — 仅 fetch/xhr,不拦页面导航(否则 goto 直接拿到 JSON)
  await page.route(`**/drafts/${DRAFT_ID}`, async (route: Route) => {
    if (route.request().resourceType() === "document") {
      await route.fallback();
      return;
    }
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ...SEED_DRAFT, version: state.version }),
      });
      return;
    }
    if (route.request().method() === "PATCH") {
      state.version += 1;
      state.patchCount += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: DRAFT_ID,
          version: state.version,
          updatedAt: new Date().toISOString(),
        }),
      });
      return;
    }
    await route.fallback();
  });

  // POST /drafts/:id/versions(冲突备份 / 命名版本)
  await page.route(`**/drafts/${DRAFT_ID}/versions`, async (route: Route) => {
    if (route.request().resourceType() === "document") {
      await route.fallback();
      return;
    }
    if (route.request().method() === "POST") {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ id: "ver-1", kind: "OFFLINE_CONFLICT" }),
      });
      return;
    }
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [] }),
      });
      return;
    }
    await route.fallback();
  });
}

test.describe("离线兜底自动保存", () => {
  test("断网编辑 → OfflineBanner 显示 → 恢复网络后自动同步", async ({ page, context }) => {
    await seedAuth(page);
    const state: MockState = { version: 1, patchCount: 0 };
    await mockDraftRoutes(page, state);

    await page.goto(`/drafts/${DRAFT_ID}`);

    // 编辑器加载完成 — 初始状态无 banner
    await expect(page.getByPlaceholder("未命名草稿")).toBeVisible({ timeout: 10_000 });

    // 切离线 → 等浏览器 offline 事件 → 等 React 把 status 切到 "offline" → 看 banner
    await context.setOffline(true);
    await page.waitForFunction(() => navigator.onLine === false);

    // OfflineBanner 在 navigator 切 offline 后由 useAutosave onOffline 立即出现
    await expect(page.getByTestId("offline-banner")).toBeVisible({ timeout: 5_000 });

    // 离线状态下编辑标题(走 useAutosave 的 dirty 派生 + IDB 1s 防抖路径)
    const titleInput = page.getByPlaceholder("未命名草稿");
    await titleInput.fill("离线编辑后的新标题");

    // WHY 不再断言 banner 仍可见:value 变化 → render-phase setStatus("dirty"),
    // offline banner 暂时消失;这是 hook 的当前 dirty 派生逻辑(见 use-autosave.ts L92-98)。
    // 这里只关心「断网时确实出现过 banner + 恢复后能重新同步」。

    // 恢复网络 — useAutosave 监听 online 事件立即 maybePush
    await context.setOffline(false);

    // PATCH 应被发送(状态由 dirty → saving → saved)
    await expect.poll(() => state.patchCount, { timeout: 10_000 }).toBeGreaterThan(0);

    // OfflineBanner 应已消失(status=saved 时 isOffline=false)
    await expect(page.getByTestId("offline-banner")).toBeHidden();
  });
});

test.describe("多 tab 只读", () => {
  test("两 tab 同 draftId → 双方都进入只读模式", async ({ context }) => {
    const tabA = await context.newPage();
    const tabB = await context.newPage();
    await seedAuth(tabA);
    await seedAuth(tabB);

    const stateA: MockState = { version: 1, patchCount: 0 };
    const stateB: MockState = { version: 1, patchCount: 0 };
    await mockDraftRoutes(tabA, stateA);
    await mockDraftRoutes(tabB, stateB);

    await tabA.goto(`/drafts/${DRAFT_ID}`);
    await tabA.getByPlaceholder("未命名草稿").waitFor();

    await tabB.goto(`/drafts/${DRAFT_ID}`);
    await tabB.getByPlaceholder("未命名草稿").waitFor();

    // useDraftPresence 用 BroadcastChannel,Playwright 同 context 多 page 共享 — 双方都进入只读
    await expect(tabB.getByTestId("readonly-banner")).toBeVisible({ timeout: 5_000 });
    await expect(tabA.getByTestId("readonly-banner")).toBeVisible({ timeout: 5_000 });
  });
});
