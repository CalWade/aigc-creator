import type { FeedWeights } from "@bytedance-aigc/shared";

/**
 * Cursor 表示「翻到候选池中第几条」+ 当时的权重快照。
 * 因为 score 是运行时计算且依赖权重,无法用 SQL WHERE 比较;
 * 所以 cursor 不带 score,只带 rank(0-indexed)+ weights。
 * 翻页中途若 weights 变,backend 校验失败 → 400 强制回第一页。
 */
export interface FeedCursor {
  rank: number;
  weights: FeedWeights;
}

export function encodeCursor(c: FeedCursor): string {
  return Buffer.from(JSON.stringify(c), "utf8").toString("base64url");
}

export function decodeCursor(raw: string): FeedCursor {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    throw new Error("CURSOR_INVALID");
  }
  if (!isFeedCursor(parsed)) throw new Error("CURSOR_INVALID");
  return parsed;
}

function isFeedCursor(x: unknown): x is FeedCursor {
  if (typeof x !== "object" || x === null) return false;
  const o = x as Record<string, unknown>;
  if (typeof o.rank !== "number" || !Number.isFinite(o.rank) || o.rank < 0) return false;
  const w = o.weights;
  if (typeof w !== "object" || w === null) return false;
  const wo = w as Record<string, unknown>;
  return (
    typeof wo.alpha === "number" && typeof wo.beta === "number" && typeof wo.gamma === "number"
  );
}

/** 严格相等(浮点 1e-9 容差);不等返 false 触发 CURSOR_WEIGHTS_MISMATCH */
export function weightsEqual(a: FeedWeights, b: FeedWeights): boolean {
  const eps = 1e-9;
  return (
    Math.abs(a.alpha - b.alpha) < eps &&
    Math.abs(a.beta - b.beta) < eps &&
    Math.abs(a.gamma - b.gamma) < eps
  );
}
