import {
  computeScore,
  hotnessMockBase,
  normalizeHotness,
  timeDecayScore,
  type Scoreable,
  type ScoreContext,
} from "@bytedance-aigc/shared";

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

describe("computeScore", () => {
  const now = new Date("2026-06-04T12:00:00Z");
  const baseCtx: ScoreContext = {
    weights: { alpha: 0.5, beta: 0.3, gamma: 0.2 },
    tauHours: 24,
    now,
    hotnessPool: [10, 50, 90],
  };

  function mk(id: string, qual: number, hot: number, agoHours: number): Scoreable {
    return {
      id,
      qualityOverall: qual,
      hotnessRaw: hot,
      publishedAt: new Date(now.getTime() - agoHours * 3600_000),
    };
  }

  it("α=1, β=γ=0 时按 quality 降序", () => {
    const ctx: ScoreContext = { ...baseCtx, weights: { alpha: 1, beta: 0, gamma: 0 } };
    const a = computeScore(mk("a", 90, 10, 0), ctx);
    const b = computeScore(mk("b", 60, 90, 0), ctx);
    expect(a).toBeGreaterThan(b);
  });

  it("α=γ=0, β=1 时按 hotness(归一化后)降序", () => {
    const ctx: ScoreContext = { ...baseCtx, weights: { alpha: 0, beta: 1, gamma: 0 } };
    const a = computeScore(mk("a", 60, 90, 0), ctx);
    const b = computeScore(mk("b", 90, 10, 0), ctx);
    expect(a).toBeGreaterThan(b);
  });

  it("α=β=0, γ=1 时按 publishedAt 降序", () => {
    const ctx: ScoreContext = { ...baseCtx, weights: { alpha: 0, beta: 0, gamma: 1 } };
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
