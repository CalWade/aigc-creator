/**
 * Phase 1.3 fixtures · demo 草稿
 * 1 篇 FAST + 1 篇 FINE,挂在 DEMO_AUTHOR_ID 名下,给前端联调一组"已知用例"
 */
import { Prisma } from "@prisma/client";

import { DEMO_AUTHOR_ID } from "./users";

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
];
