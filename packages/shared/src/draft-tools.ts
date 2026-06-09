/**
 * Phase 2.2 — 草稿工具与 FAST 模式相关的共享类型。
 * 前端(apps/web)与后端(apps/api)同源消费此文件,保证 BubbleMenu / 工具卡 /
 * SSE 候选 / DTO narrow 拿到的是同一份契约。
 */

/** 所有 AI 工具枚举值,含平台保留(不出现在 Prompt 库选择器)。 */
export const DRAFT_TOOL_TYPES = [
  "REWRITE_FLUENT",
  "EXPAND",
  "TRANSFORM_STYLE",
  "REWRITE_OPENING",
  "HEADLINE_SUB",
  "HEADLINE_NEW",
  "ADD_FACTS",
  "ADD_TOPIC",
  "IMAGE_SUGGEST",
  "SAFE_REWRITE",
  "DATA_DIAGNOSIS",
] as const;

/** Prompt 库选择器可见的工具(排除平台保留:SAFE_REWRITE 由审核流程触发,DATA_DIAGNOSIS 由后端诊断)。 */
export const PROMPT_DRAWER_TOOLS: readonly DraftToolType[] = [
  "REWRITE_FLUENT",
  "EXPAND",
  "TRANSFORM_STYLE",
  "REWRITE_OPENING",
  "HEADLINE_SUB",
  "HEADLINE_NEW",
  "ADD_FACTS",
  "ADD_TOPIC",
  "IMAGE_SUGGEST",
] as const;

export type DraftToolType = (typeof DRAFT_TOOL_TYPES)[number];

/** FAST 模式大纲单项,LLM 生成 → 前端持有 → 流式生成时按节回传。 */
export interface OutlineItem {
  heading: string;
  summary: string;
  hint?: string;
}

/**
 * 工具返回的候选。文本类工具返 `kind:"text"`;
 * IMAGE_SUGGEST 单独返 `kind:"image"`(只给建议,不真生成图)。
 * discriminated union 让前端 narrow 后渲染不同卡片,后端单测也按 kind 断言。
 */
export type Candidate =
  | { kind: "text"; text: string }
  | { kind: "image"; alt: string; reason: string };

/**
 * 9 个工具的 input 形态各异:句段重写类只要 selectedText、整篇相关类要 fullText、
 * ADD_FACTS 两者都要。后端 service 入口手写 narrow(plan D1),前端 BubbleMenu
 * 在调用前按 tool 选 selection 还是全文。
 */
export type ToolInvokeInput =
  | {
      tool: "REWRITE_FLUENT" | "EXPAND" | "TRANSFORM_STYLE" | "REWRITE_OPENING";
      input: { selectedText: string };
    }
  | { tool: "HEADLINE_SUB"; input: { selectedText: string } }
  | { tool: "HEADLINE_NEW"; input: { fullText: string } }
  | { tool: "ADD_TOPIC"; input: { fullText: string } }
  | { tool: "ADD_FACTS"; input: { selectedText: string; fullText: string } }
  | { tool: "IMAGE_SUGGEST"; input: { fullText: string } };
