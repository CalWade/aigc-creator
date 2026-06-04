/**
 * LLM 客户端共用的 chat message 形态。
 * NestJS service 喂给 LlmClient 的最小契约,只 system/user/assistant 三种角色,
 * 不暴露 tool_calls / function_call / name 等字段(Phase 2.2 不需要)。
 */
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}
