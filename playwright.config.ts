import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: "pnpm --filter @bytedance-aigc/web-consumer dev",
      // WHY: 首页 SSR 调 /feed,无后端会 500;用 /login(client-only)做就绪探针。
      url: "http://localhost:3000/login",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: "pnpm --filter @bytedance-aigc/web-studio dev",
      // WHY: studio 直访带 basePath /studio;drafts/mine 是 client-only,无需鉴权命中渲染。
      url: "http://localhost:3001/studio/drafts/mine",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
