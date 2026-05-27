/**
 * Phase 1.3 fixtures · demo 用户基线
 * 给死 id 让 drafts/prompts fixture 能稳定引用,1.4 鉴权落地后会改成"登录获得 cuid"流程
 */
import { Prisma } from "@prisma/client";

export const DEMO_AUTHOR_ID = "demoauthor000000000000001";

export const DEMO_USERS: Prisma.UserCreateManyInput[] = [
  { id: DEMO_AUTHOR_ID, handle: "demo-author" },
];
