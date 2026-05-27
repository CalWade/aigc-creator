/**
 * Phase 1.3 seed 入口:thin wrapper
 * 真正的 fixture 数据与写入顺序在 prisma/fixtures/ 下,e2e 共享同一份
 */
import { PrismaClient } from "@prisma/client";

import { applyAllFixtures } from "./fixtures";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  console.log("[seed] 应用 fixtures(users / prompts / drafts)...");
  const summary = await applyAllFixtures(prisma);
  console.log(
    `[seed] 完成:users=${summary.users}, prompts=${summary.prompts}, drafts=${summary.drafts}`,
  );
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
