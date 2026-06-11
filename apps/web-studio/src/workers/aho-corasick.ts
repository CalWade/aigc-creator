/**
 * 极简 Aho-Corasick 自动机:
 *   - buildAC(words): 构建 trie + fail 指针
 *   - search(ac, text): 单次扫描返所有命中
 * 复杂度:build O(Σ词长),search O(|text| + 命中数)
 */

export interface ACWord {
  word: string;
  category: string;
  severity: "low" | "medium" | "high";
}

export interface ACHit {
  from: number;
  to: number;
  word: string;
  category: string;
  severity: "low" | "medium" | "high";
}

interface Node {
  next: Map<string, Node>;
  fail: Node | null;
  output: ACWord[];
  depth: number;
}

export interface AC {
  root: Node;
}

export function buildAC(words: ACWord[]): AC {
  const root: Node = { next: new Map(), fail: null, output: [], depth: 0 };

  for (const w of words) {
    if (!w.word) continue;
    let cur = root;
    for (const ch of w.word) {
      let nxt = cur.next.get(ch);
      if (!nxt) {
        nxt = { next: new Map(), fail: null, output: [], depth: cur.depth + 1 };
        cur.next.set(ch, nxt);
      }
      cur = nxt;
    }
    cur.output.push(w);
  }

  // BFS 建 fail 指针
  const queue: Node[] = [];
  for (const child of root.next.values()) {
    child.fail = root;
    queue.push(child);
  }
  while (queue.length > 0) {
    const node = queue.shift()!;
    for (const [ch, child] of node.next.entries()) {
      let f = node.fail;
      while (f && !f.next.has(ch)) f = f.fail;
      child.fail = f ? (f.next.get(ch) ?? root) : root;
      child.output = child.output.concat(child.fail.output);
      queue.push(child);
    }
  }

  return { root };
}

export function search(ac: AC, text: string): ACHit[] {
  const hits: ACHit[] = [];
  let node = ac.root;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    while (node !== ac.root && !node.next.has(ch)) {
      node = node.fail ?? ac.root;
    }
    node = node.next.get(ch) ?? ac.root;
    if (node.output.length > 0) {
      for (const out of node.output) {
        const to = i + 1;
        const from = to - out.word.length;
        hits.push({ from, to, word: out.word, category: out.category, severity: out.severity });
      }
    }
  }

  hits.sort((a, b) => a.from - b.from || a.to - b.to);
  return hits;
}
