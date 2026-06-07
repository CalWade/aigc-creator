/**
 * Phase 1.3 fixtures · demo 用户基线
 * Phase 2.4 扩到 3 作者,各挂 10 篇 PUBLISHED Draft 用于信息流候选池
 * Phase 2.6 加 admin 用户(handle=admin),与 3 作者身份隔离;e2e 走 loginAsAdmin
 */
import { Prisma } from "@prisma/client";

export const DEMO_AUTHOR_ID = "demoauthor000000000000001";
export const TECH_AUTHOR_ID = "techauthor000000000000002";
export const LIFE_AUTHOR_ID = "lifeauthor000000000000003";
export const ADMIN_USER_ID = "adminuser000000000000004";

export const DEMO_USERS: Prisma.UserCreateManyInput[] = [
  { id: DEMO_AUTHOR_ID, handle: "demo-author" },
  { id: TECH_AUTHOR_ID, handle: "tech-author" },
  { id: LIFE_AUTHOR_ID, handle: "life-author" },
  { id: ADMIN_USER_ID, handle: "admin" },
];
