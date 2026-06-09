/**
 * Phase 2.26 fixtures · demo 通知
 * HOT_RANK / MILESTONE_VIEWS 为 mock 触发(缺少真实埋点),seed 中预置 demo 数据。
 */
import { Prisma } from "@prisma/client";

import { DEMO_AUTHOR_ID, TECH_AUTHOR_ID } from "./users";

export const DEMO_NOTIFICATIONS: Prisma.NotificationCreateManyInput[] = [
  {
    userId: DEMO_AUTHOR_ID,
    type: "HOT_RANK",
    title: "热点榜上榜",
    body: "《Demo:AI 时代的内容工作流 #0》登上了热点榜",
    draftId: "pub000draft0000000000000000",
    read: false,
  },
  {
    userId: DEMO_AUTHOR_ID,
    type: "MILESTONE_VIEWS",
    title: "阅读量里程碑",
    body: "《Demo:AI 时代的内容工作流 #0》阅读量突破 1,000",
    draftId: "pub000draft0000000000000000",
    read: false,
  },
  {
    userId: TECH_AUTHOR_ID,
    type: "MILESTONE_VIEWS",
    title: "阅读量里程碑",
    body: "《Tech:Next.js 16 升级踩坑 #1》阅读量突破 10,000",
    draftId: "pub001draft0000000000000000",
    read: true,
  },
];
