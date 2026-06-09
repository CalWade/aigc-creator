/**
 * Phase 2.5 ④ — 安全审核准确率评估脚本(骨架)
 *
 * 用法:pnpm --filter @bytedance-aigc/api eval:safety
 *
 * 当前状态:fixtures 仅 40 条占位(8 文件 × 5 条),数量校验
 * (eval-fixtures-count.ts)预期 FAIL。本脚本仅作为骨架交付,
 * PE 把 fixtures 补全至 ≥ 350 条后再跑,届时输出会落到
 * docs/perf/safety-eval-YYYY-MM-DD.md。
 *
 * Plan 偏差:plan 中 reviewPrompt 签名为 (text, userSub),
 * 实施时为消除 lint 红(_userSub 未使用)收敛为单参数 reviewPrompt(text)。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { NestFactory } from "@nestjs/core";

import { AppModule } from "../src/app.module";
import { ReviewService } from "../src/reviews/review.service";

interface Sample {
  text: string;
  expected_recommendation: "ALLOW" | "WARN" | "BLOCK";
  expected_categories: string[];
  source: string;
}

interface ResultRow {
  category: string;
  total: number;
  tp: number;
  fn: number;
  fp: number;
  tn: number;
}

const CATEGORIES = ["pornography", "gambling", "abuse", "fraud", "illicit_ads"] as const;

async function main(): Promise<void> {
  const fixturesDir = join(__dirname, "..", "test", "fixtures", "safety-eval");
  const reportsDir = join(__dirname, "..", "..", "..", "docs", "perf");
  if (!existsSync(reportsDir)) mkdirSync(reportsDir, { recursive: true });

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const reviews = app.get(ReviewService);

  const allowSamples = readSamples(join(fixturesDir, "allow.jsonl"));
  const rows: ResultRow[] = [];
  let totalTP = 0;
  let totalFN = 0;
  let totalFP = 0;
  let totalTN = 0;

  for (const cat of CATEGORIES) {
    const positives = readSamples(join(fixturesDir, `${cat}.jsonl`));
    const merged = [...positives, ...allowSamples];

    let tp = 0;
    let fn = 0;
    let fp = 0;
    let tn = 0;

    for (const s of merged) {
      // reviewPrompt 单参数(plan 偏差,见文件顶注释)
      const res = await reviews.reviewPrompt(s.text);
      const isHit = res.recommendation !== "ALLOW" && res.hitCategories.includes(cat);
      const expectedHit =
        s.expected_recommendation !== "ALLOW" && s.expected_categories.includes(cat);

      if (expectedHit && isHit) tp++;
      else if (expectedHit && !isHit) fn++;
      else if (!expectedHit && isHit) fp++;
      else tn++;
    }

    rows.push({ category: cat, total: merged.length, tp, fn, fp, tn });
    totalTP += tp;
    totalFN += fn;
    totalFP += fp;
    totalTN += tn;
  }

  const md = renderReport(rows, totalTP, totalFN, totalFP, totalTN);
  const date = new Date().toISOString().slice(0, 10);
  const out = join(reportsDir, `safety-eval-${date}.md`);
  writeFileSync(out, md, "utf8");
  console.log(`报告写入: ${out}`);
  await app.close();
}

function readSamples(path: string): Sample[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as Sample);
}

function renderReport(rows: ResultRow[], tp: number, fn: number, fp: number, tn: number): string {
  const f = (a: number, b: number): number => (b === 0 ? 0 : a / b);
  const lines: string[] = [];
  lines.push(`# 安全审核准确率报告 (${new Date().toISOString().slice(0, 10)})`);
  lines.push("");
  lines.push("| 类目 | 样本数 | TP | FN | FP | TN | Precision | Recall | F1 |");
  lines.push("|------|--------|----|----|----|----|-----------|--------|----|");
  for (const r of rows) {
    const p = f(r.tp, r.tp + r.fp);
    const rc = f(r.tp, r.tp + r.fn);
    const f1 = p + rc === 0 ? 0 : (2 * p * rc) / (p + rc);
    lines.push(
      `| ${r.category} | ${r.total} | ${r.tp} | ${r.fn} | ${r.fp} | ${r.tn} | ${p.toFixed(3)} | ${rc.toFixed(3)} | ${f1.toFixed(3)} |`,
    );
  }
  const total = tp + fn + fp + tn;
  const acc = total === 0 ? 0 : (tp + tn) / total;
  const p = f(tp, tp + fp);
  const rc = f(tp, tp + fn);
  const f1 = p + rc === 0 ? 0 : (2 * p * rc) / (p + rc);
  lines.push("");
  lines.push("## 总体");
  lines.push(`- Accuracy: ${acc.toFixed(3)}`);
  lines.push(`- Precision: ${p.toFixed(3)}`);
  lines.push(`- Recall: ${rc.toFixed(3)}`);
  lines.push(`- F1: ${f1.toFixed(3)}`);
  lines.push("");
  lines.push(`**目标:** Accuracy ≥ 0.90;实际 ${acc >= 0.9 ? "✅ 达标" : "⚠ 未达标,需调 Prompt"}`);
  return lines.join("\n");
}

void main();
