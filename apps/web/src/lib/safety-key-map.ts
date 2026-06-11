import type { SafetyKey, SensitiveCategory } from "@bytedance-aigc/shared";

/**
 * Phase 2.3 ScorePanel 的 6 类 SafetyKey ↔ Phase 2.5 段落审核的 7 类 SensitiveCategory。
 * 仅 false_advertising → fraud 不同名;其余同名直传。
 */
export function safetyKeyToSensitiveCategory(k: SafetyKey): SensitiveCategory {
  if (k === "false_advertising") return "fraud";
  return k as SensitiveCategory;
}
