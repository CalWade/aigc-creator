import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { load as yamlLoad } from "js-yaml";
import type { SensitiveCategory } from "@aigc-creator/shared";
import { SENSITIVE_CATEGORIES } from "@aigc-creator/shared";

export const RULE_CATEGORIES = SENSITIVE_CATEGORIES;

export interface RuleEntry {
  rule_id: string;
  category: SensitiveCategory;
  severity: "low" | "medium" | "high";
  description: string;
  prompt_hint: string;
  examples_positive?: string[];
  examples_negative?: string[];
}

let cache: Map<SensitiveCategory, RuleEntry[]> | null = null;

/** WHY: 从 monorepo 根 packages/shared/rules/*.yaml 加载;启动时一次,内存缓存。 */
export function loadRules(): Map<SensitiveCategory, RuleEntry[]> {
  if (cache) return cache;
  const rulesDir = join(__dirname, "..", "..", "..", "..", "..", "packages", "shared", "rules");
  const files = readdirSync(rulesDir).filter((f) => f.endsWith(".yaml"));
  const map = new Map<SensitiveCategory, RuleEntry[]>();
  for (const cat of RULE_CATEGORIES) map.set(cat, []);
  for (const file of files) {
    const text = readFileSync(join(rulesDir, file), "utf8");
    const parsed = yamlLoad(text);
    if (!Array.isArray(parsed)) {
      throw new Error(`rule yaml ${file} 必须是数组,实际 ${typeof parsed}`);
    }
    for (const raw of parsed as unknown[]) {
      const r = raw as Partial<RuleEntry>;
      if (!r.rule_id || !r.category || !r.severity || !r.prompt_hint) {
        throw new Error(`rule yaml ${file} 缺必填字段: ${JSON.stringify(raw)}`);
      }
      if (!RULE_CATEGORIES.includes(r.category)) {
        throw new Error(`rule yaml ${file} category=${r.category} 不在类目列表内`);
      }
      map.get(r.category)!.push(r as RuleEntry);
    }
  }
  cache = map;
  return cache;
}

/** WHY: review.service 的 system prompt 拼接段,一次性塞所有规则的 prompt_hint。 */
export function buildPromptHints(): string {
  const rules = loadRules();
  const lines: string[] = ["附加规则库提示(按类目):"];
  for (const cat of RULE_CATEGORIES) {
    const entries = rules.get(cat) ?? [];
    if (entries.length === 0) continue;
    lines.push(`\n[${cat}]`);
    for (const r of entries) {
      lines.push(`- ${r.prompt_hint.trim()}`);
    }
  }
  return lines.join("\n");
}

/** test-only: 重置缓存(让单测可在 CI 环境加载真实 yaml)。 */
export function __resetRuleCache(): void {
  cache = null;
}
