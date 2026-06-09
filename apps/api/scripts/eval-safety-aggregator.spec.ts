import { aggregate, type SampleResult } from "./eval-safety-aggregator";

describe("eval-safety aggregator", () => {
  it("全对 → accuracy 1.0", () => {
    const results: SampleResult[] = [
      { expected: "pornography", predicted: "pornography" },
      { expected: "allow", predicted: "allow" },
      { expected: "fraud", predicted: "fraud" },
    ];
    const out = aggregate(results);
    expect(out.accuracy).toBe(1);
    expect(out.totalCounted).toBe(3);
    expect(out.errors).toHaveLength(0);
  });

  it("一半错 → accuracy 0.5", () => {
    const results: SampleResult[] = [
      { expected: "pornography", predicted: "pornography" },
      { expected: "allow", predicted: "fraud" },
    ];
    const out = aggregate(results);
    expect(out.accuracy).toBe(0.5);
  });

  it("error 样本不计入分母", () => {
    const results: SampleResult[] = [
      { expected: "fraud", predicted: "fraud" },
      { expected: "allow", predicted: undefined, error: "LLM timeout" },
    ];
    const out = aggregate(results);
    expect(out.accuracy).toBe(1);
    expect(out.totalCounted).toBe(1);
    expect(out.errors).toHaveLength(1);
  });

  it("precision/recall/f1 计算正确", () => {
    const results: SampleResult[] = [
      { expected: "fraud", predicted: "fraud" },
      { expected: "fraud", predicted: "allow" },
      { expected: "allow", predicted: "fraud" },
      { expected: "allow", predicted: "allow" },
    ];
    const out = aggregate(results);
    expect(out.perCategory.fraud.tp).toBe(1);
    expect(out.perCategory.fraud.fp).toBe(1);
    expect(out.perCategory.fraud.fn).toBe(1);
    expect(out.perCategory.fraud.precision).toBeCloseTo(0.5, 5);
    expect(out.perCategory.fraud.recall).toBeCloseTo(0.5, 5);
    expect(out.perCategory.fraud.f1).toBeCloseTo(0.5, 5);
  });
});
