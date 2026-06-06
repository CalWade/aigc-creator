import type { SensitiveCategory } from "./review";

export type WordSeverity = "low" | "medium" | "high";

export interface SensitiveWordList {
  version: string;
  categories: {
    [cat in SensitiveCategory]: {
      severity: WordSeverity;
      words: string[];
    };
  };
}

import wordsJson from "./sensitive-words.json";

/** 加载静态 JSON 词库;Worker 启动时一次性注入。 */
export function loadSensitiveWords(): SensitiveWordList {
  return wordsJson as SensitiveWordList;
}

/** 把词库展开成扁平数组(给 Aho-Corasick 构建 trie)。 */
export interface FlatWordEntry {
  word: string;
  category: SensitiveCategory;
  severity: WordSeverity;
}

export function flattenWords(list: SensitiveWordList): FlatWordEntry[] {
  const out: FlatWordEntry[] = [];
  (Object.keys(list.categories) as SensitiveCategory[]).forEach((cat) => {
    const block = list.categories[cat];
    for (const w of block.words) {
      out.push({ word: w, category: cat, severity: block.severity });
    }
  });
  return out;
}
