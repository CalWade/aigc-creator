import {
  computeHotnessRaw,
  computeScore,
  computeExternalTrendScore,
  hotnessMockBase,
  normalizeHotness,
  timeDecayScore,
  type Scoreable,
  type ScoreContext,
} from "@aigc-creator/shared";

describe("timeDecayScore", () => {
  it("Δh=0 时返 100", () => {
    const now = new Date("2026-06-04T12:00:00Z");
    expect(timeDecayScore(now, now, 12)).toBeCloseTo(100, 5);
  });

  it("Δh=τ 时返 100/e ≈ 36.79", () => {
    const now = new Date("2026-06-04T12:00:00Z");
    const past = new Date(now.getTime() - 12 * 3600_000);
    expect(timeDecayScore(past, now, 12)).toBeCloseTo(100 / Math.E, 3);
  });

  it("τ 越小越偏新内容(τ=12 比 τ=72 衰减更快)", () => {
    const now = new Date("2026-06-04T12:00:00Z");
    const past = new Date(now.getTime() - 24 * 3600_000); // 24h 前
    const t12 = timeDecayScore(past, now, 12);
    const t72 = timeDecayScore(past, now, 72);
    expect(t12).toBeLessThan(t72);
  });

  it("publishedAt 在未来(时钟漂)返 100,不返负数", () => {
    const now = new Date("2026-06-04T12:00:00Z");
    const future = new Date(now.getTime() + 3600_000);
    expect(timeDecayScore(future, now, 12)).toBe(100);
  });
});

describe("normalizeHotness", () => {
  it("空池返 0", () => {
    expect(normalizeHotness(50, [])).toBe(0);
  });

  it("max==min 返 0(无差异)", () => {
    expect(normalizeHotness(7, [7, 7, 7])).toBe(0);
  });

  it("typical 池 raw=max 返 100", () => {
    const pool = [10, 20, 30, 40, 50];
    expect(normalizeHotness(50, pool)).toBe(100);
  });

  it("typical 池 raw=min 返 0", () => {
    const pool = [10, 20, 30, 40, 50];
    expect(normalizeHotness(10, pool)).toBe(0);
  });

  it("池规模 < 50 用 P95 作为 max(单 outlier 不能压低其他)", () => {
    // 39 个 1-39 + 1 个 9999;池规模 40 < 50,应走 P95 分支
    const pool = Array.from({ length: 39 }, (_, i) => i + 1).concat([9999]);
    const score = normalizeHotness(39, pool);
    // P95 = sorted[Math.floor(40 * 0.95)] = sorted[38] = 39;raw=39 被 clamp 到 39 = 100
    expect(score).toBeGreaterThan(80);
  });

  it("raw 超 max 被 clamp(不返 > 100)", () => {
    const pool = [10, 20, 30];
    expect(normalizeHotness(9999, pool)).toBe(100);
  });
});

describe("hotnessMockBase", () => {
  it("同 id 多次调一致", () => {
    const a = hotnessMockBase("post-abc-123");
    const b = hotnessMockBase("post-abc-123");
    expect(a).toBe(b);
  });

  it("结果在 [0, 100) 范围", () => {
    for (const id of ["a", "ab", "long-cuid-id-foo-bar-baz-qux"]) {
      const v = hotnessMockBase(id);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(100);
    }
  });

  it("不同 id 大概率不同(抽样不要求 perfect 但要有差异)", () => {
    const set = new Set<number>();
    for (let i = 0; i < 30; i++) set.add(hotnessMockBase(`id-${i}`));
    expect(set.size).toBeGreaterThan(15); // 至少 50% 唯一
  });
});

const NOW = new Date("2026-06-04T12:00:00Z");

function mk(id: string, qual: number, hot: number, agoHours: number, trend = 0): Scoreable {
  return {
    id,
    qualityOverall: qual,
    hotnessRaw: hot,
    publishedAt: new Date(NOW.getTime() - agoHours * 3600_000),
    externalTrendScore: trend,
  };
}

describe("computeScore", () => {
  const now = NOW;
  const baseCtx: ScoreContext = {
    weights: { alpha: 0.5, beta: 0.3, gamma: 0.2, delta: 0 },
    tauHours: 24,
    now,
    hotnessPool: [10, 50, 90],
  };

  it("α=1, β=γ=0 时按 quality 降序", () => {
    const ctx: ScoreContext = { ...baseCtx, weights: { alpha: 1, beta: 0, gamma: 0, delta: 0 } };
    const a = computeScore(mk("a", 90, 10, 0), ctx);
    const b = computeScore(mk("b", 60, 90, 0), ctx);
    expect(a).toBeGreaterThan(b);
  });

  it("α=γ=0, β=1 时按 hotness(归一化后)降序", () => {
    const ctx: ScoreContext = { ...baseCtx, weights: { alpha: 0, beta: 1, gamma: 0, delta: 0 } };
    const a = computeScore(mk("a", 60, 90, 0), ctx);
    const b = computeScore(mk("b", 90, 10, 0), ctx);
    expect(a).toBeGreaterThan(b);
  });

  it("α=β=0, γ=1 时按 publishedAt 降序", () => {
    const ctx: ScoreContext = { ...baseCtx, weights: { alpha: 0, beta: 0, gamma: 1, delta: 0 } };
    const fresh = computeScore(mk("a", 60, 50, 1), ctx);
    const old = computeScore(mk("b", 90, 50, 24), ctx);
    expect(fresh).toBeGreaterThan(old);
  });

  it("默认权重 0.5/0.3/0.2 — 三项加和", () => {
    const ctx = baseCtx;
    const s = computeScore(mk("a", 80, 50, 0), ctx);
    // q=80, h=normalize(50,[10,50,90])=50, t=100
    // s = 0.5*80 + 0.3*50 + 0.2*100 = 40 + 15 + 20 = 75
    expect(s).toBeCloseTo(75, 3);
  });
});

describe("computeHotnessRaw", () => {
  it("null/undefined 返 0(无 stat 行的草稿)", () => {
    expect(computeHotnessRaw(null)).toBe(0);
    expect(computeHotnessRaw(undefined)).toBe(0);
  });

  it("全 0 stat → 接近 0(只有 log(0+1)=0)", () => {
    expect(
      computeHotnessRaw({ impression: 0, click: 0, like: 0, collect: 0, share: 0, report: 0 }),
    ).toBe(0);
  });

  it("PostStat 高的明显高于低的(站内核心断言)", () => {
    const high = computeHotnessRaw({
      impression: 10000,
      click: 500,
      like: 200,
      collect: 100,
      share: 50,
      report: 0,
    });
    const low = computeHotnessRaw({
      impression: 100,
      click: 5,
      like: 1,
      collect: 0,
      share: 0,
      report: 0,
    });
    expect(high).toBeGreaterThan(low);
  });

  it("share 比 like 权重高(10 vs 5,鼓励传播)", () => {
    const shareHeavy = computeHotnessRaw({
      impression: 0,
      click: 0,
      like: 0,
      collect: 0,
      share: 1,
      report: 0,
    });
    const likeHeavy = computeHotnessRaw({
      impression: 0,
      click: 0,
      like: 1,
      collect: 0,
      share: 0,
      report: 0,
    });
    expect(shareHeavy).toBeGreaterThan(likeHeavy);
  });

  it("report 多扣分:1 次举报抵 4 次 share", () => {
    const positive = computeHotnessRaw({
      impression: 0,
      click: 0,
      like: 0,
      collect: 0,
      share: 4,
      report: 0,
    });
    const reported = computeHotnessRaw({
      impression: 0,
      click: 0,
      like: 0,
      collect: 0,
      share: 4,
      report: 1,
    });
    expect(reported).toBeLessThan(positive);
    // 4 share - 1 report = 40 - 20 = 20;无 report = 40
    expect(positive - reported).toBeCloseTo(20, 5);
  });

  it("举报多 + 互动少 → 可能为负(由 normalize 阶段 clamp)", () => {
    const trolled = computeHotnessRaw({
      impression: 1,
      click: 0,
      like: 0,
      collect: 0,
      share: 0,
      report: 5,
    });
    expect(trolled).toBeLessThan(0);
  });

  it("impression 走 log:10000 vs 100 不会让头部完全压死长尾", () => {
    const popular = computeHotnessRaw({
      impression: 10000,
      click: 0,
      like: 0,
      collect: 0,
      share: 0,
      report: 0,
    });
    const niche = computeHotnessRaw({
      impression: 100,
      click: 0,
      like: 0,
      collect: 0,
      share: 0,
      report: 0,
    });
    // 10000 vs 100 量级差 100 倍,但 log 后差距 ~2 倍而非 100 倍
    expect(popular / niche).toBeLessThan(3);
  });
});

describe("computeScore with delta", () => {
  const now = NOW;
  const ctx: ScoreContext = {
    weights: { alpha: 0, beta: 0, gamma: 0, delta: 1 },
    tauHours: 24,
    now,
    hotnessPool: [50],
  };

  it("δ=1, α=β=γ=0 时按 externalTrendScore 降序", () => {
    const a = computeScore(mk("a", 50, 50, 0, 80), ctx);
    const b = computeScore(mk("b", 50, 50, 0, 20), ctx);
    expect(a).toBeGreaterThan(b);
  });

  it("δ=0 时 externalTrendScore 不影响排序", () => {
    const ctxNoDelta: ScoreContext = { ...ctx, weights: { alpha: 1, beta: 0, gamma: 0, delta: 0 } };
    const a = computeScore(mk("a", 90, 50, 0, 0), ctxNoDelta);
    const b = computeScore(mk("b", 60, 50, 0, 100), ctxNoDelta);
    expect(a).toBeGreaterThan(b); // 只看 quality,不看 trend
  });

  it("四因子混合:δ·E 正确加和", () => {
    const ctxMix: ScoreContext = {
      weights: { alpha: 0.5, beta: 0, gamma: 0, delta: 0.5 },
      tauHours: 24,
      now,
      hotnessPool: [50],
    };
    const s = computeScore(mk("a", 80, 50, 0, 60), ctxMix);
    // s = 0.5*80 + 0.5*60 = 40 + 30 = 70
    expect(s).toBeCloseTo(70, 3);
  });
});

describe("computeExternalTrendScore", () => {
  const topics = ["人工智能", "ChatGPT", "新能源车", "世界杯"];
  const popularities = [1000, 800, 600, 400];

  it("标题精确包含话题 → 返回 > 0", () => {
    const score = computeExternalTrendScore("人工智能改变世界", topics, popularities);
    expect(score).toBeGreaterThan(0);
  });

  it("话题包含标题 → 返回 > 0", () => {
    const score = computeExternalTrendScore("ChatGPT", topics, popularities);
    expect(score).toBeGreaterThan(0);
  });

  it("子串片段匹配(3字以上) → 返回 > 0", () => {
    const score = computeExternalTrendScore("新能源车市火爆", topics, popularities);
    expect(score).toBeGreaterThan(0);
  });

  it("完全不相关 → 返 0", () => {
    const score = computeExternalTrendScore("今天天气真不错", topics, popularities);
    expect(score).toBe(0);
  });

  it("空标题 → 返 0", () => {
    expect(computeExternalTrendScore("", topics, popularities)).toBe(0);
  });

  it("空热榜 → 返 0", () => {
    expect(computeExternalTrendScore("人工智能", [], [])).toBe(0);
  });

  it("多话题匹配时取最高分", () => {
    const score = computeExternalTrendScore("人工智能与ChatGPT", topics, popularities);
    // "人工智能" popularity=1000 最高
    expect(score).toBe(100);
  });

  it("popularity 归一化:最低话题匹配时分数最低", () => {
    const scoreHigh = computeExternalTrendScore("人工智能", topics, popularities);
    const scoreLow = computeExternalTrendScore("世界杯", topics, popularities);
    expect(scoreHigh).toBeGreaterThan(scoreLow);
  });
});
