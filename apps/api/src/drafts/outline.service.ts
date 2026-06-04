import { BadGatewayException, Injectable } from "@nestjs/common";
import type { OutlineItem } from "@bytedance-aigc/shared";

import { LlmClient } from "../llm/llm.client";
import type { ChatMessage } from "../llm/dto/chat-message.dto";
import { DraftsService } from "./drafts.service";
import type { OutlineRequestDto } from "./dto/outline-request.dto";

const MIN_SECTIONS = 3;
const MAX_SECTIONS = 8;

const SYSTEM_PROMPT = [
  "你是一名中长图文资讯编辑助手。",
  "用户会给你一个选题(topic)和可选提示(hint),你产出文章大纲。",
  "严格用 JSON 输出,不要任何 markdown 代码块、注释、解释文字。",
  "输出形如:",
  '{ "sections": [{ "heading": "...", "summary": "...", "hint": "..." }] }',
  `必须返回 ${MIN_SECTIONS}-${MAX_SECTIONS} 个 sections,heading 简短、summary 一句话、hint 可省略。`,
].join("\n");

/**
 * FAST 模式 outline 生成。同步 REST 路径,无副作用(大纲不写库,前端持有,
 * 由后续 sections/stream 回传)。
 *
 * Plan Task 5 + spec §3.1。
 */
@Injectable()
export class OutlineService {
  constructor(
    private readonly drafts: DraftsService,
    private readonly llm: LlmClient,
  ) {}

  async generate(
    draftId: string,
    userSub: string,
    dto: OutlineRequestDto,
  ): Promise<{ sections: OutlineItem[] }> {
    await this.drafts.assertAuthor(draftId, userSub);

    const userPrompt = dto.hint ? `选题:${dto.topic}\n额外提示:${dto.hint}` : `选题:${dto.topic}`;

    const messages: ChatMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ];

    // chat 抛错原样上抛,由 NestJS 默认 ExceptionFilter 转 502(Plan D6)。
    const raw = await this.llm.chat(messages, { temperature: 0.7 });

    return { sections: parseAndValidate(raw) };
  }
}

function parseAndValidate(raw: string): OutlineItem[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new BadGatewayException("LLM 返回非合法 JSON");
  }

  if (!isObject(parsed) || !Array.isArray(parsed.sections)) {
    throw new BadGatewayException("LLM 输出缺少 sections 数组");
  }

  const sections = parsed.sections;
  if (sections.length < MIN_SECTIONS || sections.length > MAX_SECTIONS) {
    throw new BadGatewayException(
      `LLM 输出 sections 数量 ${sections.length} 不在 ${MIN_SECTIONS}-${MAX_SECTIONS} 区间`,
    );
  }

  return sections.map((s, i): OutlineItem => {
    if (!isObject(s) || typeof s.heading !== "string" || typeof s.summary !== "string") {
      throw new BadGatewayException(`LLM 输出 sections[${i}] 字段不全`);
    }
    return {
      heading: s.heading,
      summary: s.summary,
      hint: typeof s.hint === "string" ? s.hint : undefined,
    };
  });
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}
