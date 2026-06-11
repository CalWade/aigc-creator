import { Global, Module } from "@nestjs/common";
import { LlmClient } from "./llm.client";
import { GuardClient } from "./guard.client";

/**
 * LLM 模块全局可用,所有 service 直接 inject `LlmClient` / `GuardClient` 即可。
 * 之所以 `@Global`:Phase 2.2 至少 outline / sections / tools 三个 service 都用,
 * 走全局减少各业务 module 的 import 噪音(沿用 PrismaModule 的做法)。
 */
@Global()
@Module({
  providers: [LlmClient, GuardClient],
  exports: [LlmClient, GuardClient],
})
export class LlmModule {}
