/**
 * Phase 1.3 fixtures · demo 草稿
 * Phase 2.4:在原有 2 条 demo Draft(DRAFT 状态)基础上追加 30 条 PUBLISHED,
 *           分布在 demo/tech/life 三个作者下,publishedAt 散布在最近 7.5 天内。
 *           前 2 篇命中 12h 窗口(/rank/hot)、前 12 篇命中 72h 窗口(/rank/best)。
 */
import { Prisma } from "@prisma/client";

import { DEMO_AUTHOR_ID, LIFE_AUTHOR_ID, TECH_AUTHOR_ID } from "./users";

const TITLES_BY_AUTHOR: Record<string, string[]> = {
  [DEMO_AUTHOR_ID]: [
    "Demo:AI 时代的内容工作流",
    "Demo:Prompt 管理实战",
    "Demo:监控仪表盘搭建",
    "Demo:从 0 到 1 上线产品",
    "Demo:复盘一次故障",
  ],
  [TECH_AUTHOR_ID]: [
    "Tech:Next.js 16 升级踩坑",
    "Tech:Prisma 迁移实践",
    "Tech:NestJS Module 拆分",
    "Tech:TypeScript 严格模式",
    "Tech:E2E 测试设计",
  ],
  [LIFE_AUTHOR_ID]: [
    "Life:周末 city walk 攻略",
    "Life:咖啡探店日记",
    "Life:健身一年总结",
    "Life:读书清单",
    "Life:旅行的意义",
  ],
};

function buildPublishedDrafts(): Prisma.DraftCreateManyInput[] {
  const baseNow = Date.now();
  const authors = [DEMO_AUTHOR_ID, TECH_AUTHOR_ID, LIFE_AUTHOR_ID];
  const out: Prisma.DraftCreateManyInput[] = [];
  for (let i = 0; i < 30; i++) {
    const author = authors[i % 3];
    const titleArr = TITLES_BY_AUTHOR[author];
    const baseTitle = titleArr[Math.floor(i / 3) % titleArr.length];
    const title = `${baseTitle} #${i}`;
    const publishedAt = new Date(baseNow - i * 6 * 3600_000 - 1800_000);
    const id = `pub${String(i).padStart(3, "0")}draft0000000000000000`;
    out.push({
      id,
      authorId: author,
      mode: i % 2 === 0 ? "FAST" : "FINE",
      status: "PUBLISHED",
      title,
      body: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: `${baseTitle} —— 这是 fixtures 注入的发布稿正文。索引 #${i}。`,
              },
            ],
          },
        ],
      },
      version: 1,
      publishedAt,
    });
  }
  return out;
}

export const DEMO_DRAFTS: Prisma.DraftCreateManyInput[] = [
  {
    id: "demodraft0000000000000001",
    authorId: DEMO_AUTHOR_ID,
    mode: "FAST",
    title: "demo·快速稿示例",
    body: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          text: "这是一篇快速稿示例,作者交付一句话需求,AI 主导填充正文骨架。",
        },
      ],
    },
    version: 1,
  },
  {
    id: "demodraft0000000000000002",
    authorId: DEMO_AUTHOR_ID,
    mode: "FINE",
    title: "demo·精耀稿示例",
    body: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          text: "这是一篇精耀稿示例,作者主导写作,AI 仅作为段落级工具被调用。",
        },
      ],
    },
    version: 1,
  },
  ...buildPublishedDrafts(),
];
