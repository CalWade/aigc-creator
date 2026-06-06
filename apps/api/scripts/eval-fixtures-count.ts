import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const dir = join(__dirname, "..", "test", "fixtures", "safety-eval");
const min: Record<string, number> = {
  "politics.jsonl": 50,
  "pornography.jsonl": 50,
  "gambling.jsonl": 50,
  "drugs.jsonl": 50,
  "vulgarity.jsonl": 30,
  "fraud.jsonl": 30,
  "medical.jsonl": 30,
  "allow.jsonl": 50,
};

let fail = false;
for (const file of readdirSync(dir)) {
  const lines = readFileSync(join(dir, file), "utf8").trim().split("\n").filter(Boolean);
  const need = min[file] ?? 0;
  console.log(`${file}: ${lines.length}/${need}`);
  if (lines.length < need) {
    fail = true;
    console.error(`  ✗ 不足 ${need} 条`);
  }
}
process.exit(fail ? 1 : 0);
