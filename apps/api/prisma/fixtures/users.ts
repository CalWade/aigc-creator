/**
 * Phase 1.3 fixtures · demo 用户基线
 * Phase 2.4 扩到 3 作者,各挂 10 篇 PUBLISHED Draft 用于信息流候选池
 * Phase 2.6 加 admin 用户(handle=admin),与 3 作者身份隔离;e2e 走 loginAsAdmin
 * 2026-06-10 #21 新增 phone/email/passwordHash —— demo 密码统一 demo1234
 *   bcryptjs hash(cost=10) 离线生成,运行时不再 hash 这些 fixture。
 */
import { Prisma } from "@prisma/client";

export const DEMO_AUTHOR_ID = "demoauthor000000000000001";
export const TECH_AUTHOR_ID = "techauthor000000000000002";
export const LIFE_AUTHOR_ID = "lifeauthor000000000000003";
export const ADMIN_USER_ID = "adminuser000000000000004";

// bcryptjs.hashSync("demo1234", 10) 的预生成结果,seed 时直接写入,避免 fixture 引入运行时依赖。
const DEMO_PASSWORD_HASH = "$2b$10$e.9SYtBrE/7HF3azT2sXteNUCY4lv5S4X.QBF9oMjw42SVh8woePq";

export const DEMO_USERS: Prisma.UserCreateManyInput[] = [
  {
    id: DEMO_AUTHOR_ID,
    handle: "demo-author",
    phone: "13800000001",
    email: "demo-author@example.com",
    passwordHash: DEMO_PASSWORD_HASH,
  },
  {
    id: TECH_AUTHOR_ID,
    handle: "tech-author",
    phone: "13800000002",
    email: "tech-author@example.com",
    passwordHash: DEMO_PASSWORD_HASH,
  },
  {
    id: LIFE_AUTHOR_ID,
    handle: "life-author",
    phone: "13800000003",
    email: "life-author@example.com",
    passwordHash: DEMO_PASSWORD_HASH,
  },
  {
    id: ADMIN_USER_ID,
    handle: "admin",
    phone: "13800000000",
    email: "admin@example.com",
    passwordHash: DEMO_PASSWORD_HASH,
  },
];
