import { loadSensitiveWords, flattenWords } from "../src/sensitive-words";
import { SENSITIVE_CATEGORIES } from "../src/review";

function main(): void {
  const list = loadSensitiveWords();
  const errors: string[] = [];

  if (typeof list.version !== "string" || list.version.length === 0) {
    errors.push("缺 version");
  }

  for (const cat of SENSITIVE_CATEGORIES) {
    const block = list.categories[cat];
    if (!block) {
      errors.push(`缺类目 ${cat}`);
      continue;
    }
    if (!["low", "medium", "high"].includes(block.severity)) {
      errors.push(`${cat} severity 非法: ${block.severity}`);
    }
    if (!Array.isArray(block.words) || block.words.length === 0) {
      errors.push(`${cat} words 必须非空数组`);
    }
    for (const w of block.words) {
      if (typeof w !== "string" || w.length < 2) {
        errors.push(`${cat} 词长度需 ≥ 2: ${JSON.stringify(w)}`);
      }
    }
  }

  const flat = flattenWords(list);
  const seen = new Set<string>();
  for (const e of flat) {
    if (seen.has(e.word)) errors.push(`重复词: ${e.word}`);
    seen.add(e.word);
  }

  if (errors.length > 0) {
    console.error("validate-words FAIL:");
    for (const e of errors) console.error(" -", e);
    process.exit(1);
  }
  console.log(`validate-words OK: ${flat.length} 条词,${SENSITIVE_CATEGORIES.length} 类目`);
}

main();
