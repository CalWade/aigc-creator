/**
 * Phase 2.16 — eval-safety 聚合纯函数(便于单测)
 */
import { SENSITIVE_CATEGORIES, type SensitiveCategory } from "@aigc-creator/shared";

export type Label = SensitiveCategory | "allow";
export type SampleResult =
  | { expected: Label; predicted: Label; error?: undefined }
  | { expected: Label; predicted: undefined; error: string };

export interface AggregateOutput {
  accuracy: number;
  macroF1: number;
  perCategory: Record<
    Label,
    {
      precision: number;
      recall: number;
      f1: number;
      tp: number;
      fp: number;
      fn: number;
      support: number;
    }
  >;
  confusionMatrix: Record<Label, Record<Label, number>>;
  errors: { expected: Label; error: string }[];
  totalCounted: number;
}

export const ALL_LABELS: readonly Label[] = [...SENSITIVE_CATEGORIES, "allow"] as const;

export function aggregate(results: SampleResult[]): AggregateOutput {
  const matrix = {} as Record<Label, Record<Label, number>>;
  for (const e of ALL_LABELS) {
    matrix[e] = {} as Record<Label, number>;
    for (const p of ALL_LABELS) matrix[e][p] = 0;
  }
  const errors: { expected: Label; error: string }[] = [];
  let correct = 0;
  let totalCounted = 0;

  for (const r of results) {
    if (r.error || !r.predicted) {
      errors.push({ expected: r.expected, error: r.error ?? "unknown" });
      continue;
    }
    matrix[r.expected][r.predicted]++;
    if (r.expected === r.predicted) correct++;
    totalCounted++;
  }

  const perCategory = {} as AggregateOutput["perCategory"];
  let f1Sum = 0;
  for (const label of ALL_LABELS) {
    const tp = matrix[label][label];
    let fp = 0;
    let fn = 0;
    for (const other of ALL_LABELS) {
      if (other !== label) {
        fp += matrix[other][label];
        fn += matrix[label][other];
      }
    }
    const support = tp + fn;
    const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
    const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
    const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
    perCategory[label] = { precision, recall, f1, tp, fp, fn, support };
    f1Sum += f1;
  }

  return {
    accuracy: totalCounted === 0 ? 0 : correct / totalCounted,
    macroF1: f1Sum / ALL_LABELS.length,
    perCategory,
    confusionMatrix: matrix,
    errors,
    totalCounted,
  };
}
