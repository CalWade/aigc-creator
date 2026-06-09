import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// Phase 2.16:5 类目主测各 40 + allow 70 + buffer 30 = 300
const dir = join(__dirname, "..", "test", "fixtures", "safety-eval");
const min: Record<string, number> = {
  "pornography.jsonl": 40,
  "gambling.jsonl": 40,
  "abuse.jsonl": 40,
  "fraud.jsonl": 40,
  "illicit_ads.jsonl": 40,
  "allow.jsonl": 70,
  "buffer.jsonl": 30,
};
const TOTAL_TARGET = 300;

let fail = false;
let total = 0;
for (const file of readdirSync(dir).sort()) {
  const lines = readFileSync(join(dir, file), "utf8").trim().split("\n").filter(Boolean);
  const need = min[file] ?? 0;
  total += lines.length;
  console.log(`${file}: ${lines.length}/${need}`);
  if (lines.length < need) {
    fail = true;
    console.error(`  ✗ 不足 ${need} 条`);
  }
}
console.log(`\n合计: ${total}/${TOTAL_TARGET}`);
if (total < TOTAL_TARGET) {
  fail = true;
  console.error(`✗ 总数 ${total} < ${TOTAL_TARGET}`);
}
process.exit(fail ? 1 : 0);
