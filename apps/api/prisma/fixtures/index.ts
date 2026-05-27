/**
 * Phase 1.3 fixtures · 统一工厂
 *
 * 用法:
 *   - prisma/seed.ts 调 applyAllFixtures(prisma) 把库灌成已知态
 *   - e2e spec 在 beforeAll 调同一函数,免得每个 spec 各自 deleteMany
 *
 * 删除顺序固定为:DraftVersion → Draft → Prompt → User
 *   FK 依赖:DraftVersion.draftId → Draft、Draft.authorId → User、Prompt.authorId → User、
 *   Prompt.sourcePromptId → Prompt(自引用,用 onDelete: SET NULL,可在 Prompt 内部一次性删掉)
 *
 * 写入顺序反过来:User → Prompt → Draft(DraftVersion 暂未写入,1.5 起草版本流程后再加)
 */
import { PrismaClient } from "@prisma/client";

import { DEMO_DRAFTS } from "./drafts";
import { PROMPT_STARTERS } from "./prompts";
import { DEMO_AUTHOR_ID, DEMO_USERS } from "./users";

export { DEMO_AUTHOR_ID, DEMO_DRAFTS, DEMO_USERS, PROMPT_STARTERS };

export interface FixtureSummary {
  users: number;
  prompts: number;
  drafts: number;
}

export async function cleanupAllFixtures(prisma: PrismaClient): Promise<void> {
  await prisma.draftVersion.deleteMany();
  await prisma.draft.deleteMany();
  await prisma.prompt.deleteMany();
  await prisma.user.deleteMany();
}

export async function applyAllFixtures(prisma: PrismaClient): Promise<FixtureSummary> {
  await cleanupAllFixtures(prisma);

  const users = await prisma.user.createMany({ data: DEMO_USERS });
  const prompts = await prisma.prompt.createMany({ data: PROMPT_STARTERS });
  const drafts = await prisma.draft.createMany({ data: DEMO_DRAFTS });

  return { users: users.count, prompts: prompts.count, drafts: drafts.count };
}
