import type { SafetyKey, SensitiveCategory } from "@bytedance-aigc/shared";

/**
 * Phase 2.3 ScorePanel 的 SafetyKey ↔ Phase 2.5 段落审核的 SensitiveCategory。
 * Guard 迁移后两者完全对齐（6 类目统一），同名直传。
 */
export function safetyKeyToSensitiveCategory(k: SafetyKey): SensitiveCategory {
  return k as SensitiveCategory;
}
