import type { ConfigService } from "@nestjs/config";

/**
 * LLM 客户端运行时配置。
 * 来源:`LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL` 三个环境变量。
 */
export interface LlmConfig {
  baseURL: string;
  apiKey: string;
  model: string;
}

/**
 * 从 ConfigService 读 LLM_* 三项,任一缺失抛错(走 NestJS 默认错误链路)。
 *
 * 沿用 Phase 1.4 `JWT_SECRET` 的 `getOrThrow` 风格:配置缺失时拒启动,
 * 而不是给一个静默的默认值——LLM key 没填本来就不能跑,要在启动期暴露。
 */
export function getLlmConfig(cs: ConfigService): LlmConfig {
  return {
    baseURL: cs.getOrThrow<string>("LLM_BASE_URL"),
    apiKey: cs.getOrThrow<string>("LLM_API_KEY"),
    model: cs.getOrThrow<string>("LLM_MODEL"),
  };
}
