"""
Phase 2.16 — 从 ChineseHarm-Bench 抽样 300 条到 fixtures。

用法:
  cd apps/api
  python3 scripts/sample-chineseharm.py

数据来源:
  https://huggingface.co/datasets/zjunlp/ChineseHarm-bench
  License: CC BY-NC 4.0(非商用,demo 项目允许)

不进生产代码——仅为重现 fixtures 抽样过程而提交。
"""
import json
import os
import random
import sys
import urllib.request
from pathlib import Path

random.seed(42)

DATASET_URL = (
    "https://huggingface.co/datasets/zjunlp/ChineseHarm-bench/resolve/main/bench.json"
)
CACHE_PATH = "/tmp/chineseharm-bench.json"

# ChineseHarm-Bench 中文标签 → 本平台英文类目
# 真实数据集 6 类各 1000 条:黑产广告 / 欺诈 / 博彩 / 不违规 / 谩骂引战 / 低俗色情
LABEL_MAP = {
    "低俗色情": "pornography",
    "博彩": "gambling",
    "谩骂引战": "abuse",
    "欺诈": "fraud",
    "黑产广告": "illicit_ads",
    "不违规": "allow",
}

OUT_DIR = Path(__file__).parent.parent / "test" / "fixtures" / "safety-eval"
TARGET = {
    "pornography": 40,
    "gambling": 40,
    "abuse": 40,
    "fraud": 40,
    "illicit_ads": 40,
    "allow": 70,
}
BUFFER_PER_HIGH_CAT = 6  # 5 类目 × 6 = 30 缓冲


def download_if_missing(url: str, path: str) -> None:
    if os.path.exists(path) and os.path.getsize(path) > 0:
        print(f"使用缓存: {path} ({os.path.getsize(path)} bytes)")
        return
    print(f"下载 {url} → {path}")
    urllib.request.urlretrieve(url, path)
    print(f"  完成,{os.path.getsize(path)} bytes")


def parse_bench(path: str):
    """ChineseHarm-Bench 顶层是 list,每条形如 {"文本": "...", "标签": "色情" / ...}。"""
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, list):
        raise SystemExit(f"bench.json 顶层不是 list,实际类型: {type(data).__name__}")
    return data


def main() -> None:
    download_if_missing(DATASET_URL, CACHE_PATH)
    bench = parse_bench(CACHE_PATH)

    # 按英文类目分桶 + 长度过滤(20-500 字)
    buckets: dict[str, list[str]] = {v: [] for v in LABEL_MAP.values()}
    skipped_label = 0
    skipped_len = 0
    for item in bench:
        text_field = item.get("文本") or item.get("text") or ""
        label_zh = (item.get("标签") or item.get("label") or "").strip()
        text = text_field.strip() if isinstance(text_field, str) else ""
        if label_zh not in LABEL_MAP:
            skipped_label += 1
            continue
        if not (20 <= len(text) <= 500):
            skipped_len += 1
            continue
        buckets[LABEL_MAP[label_zh]].append(text)

    print(f"\n原始样本数: {len(bench)}")
    print(f"  跳过(非目标 label): {skipped_label}")
    print(f"  跳过(长度不在 20-500): {skipped_len}")
    print("可用样本数(过滤后):")
    for k, v in buckets.items():
        print(f"  {k}: {len(v)}")

    # 主测抽样 + 缓冲抽样
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    buffer_lines = []
    written_count = 0
    for cat, n in TARGET.items():
        pool = buckets[cat]
        need = n + (BUFFER_PER_HIGH_CAT if cat != "allow" else 0)
        if len(pool) < need:
            raise SystemExit(
                f"类目 {cat} 不足 {need}(主测 {n} + 缓冲 "
                f"{BUFFER_PER_HIGH_CAT if cat != 'allow' else 0}),仅有 {len(pool)} 条"
            )
        random.shuffle(pool)
        main_samples = pool[:n]
        buffer_samples = pool[n : n + BUFFER_PER_HIGH_CAT] if cat != "allow" else []

        out_path = OUT_DIR / f"{cat}.jsonl"
        with open(out_path, "w", encoding="utf-8") as f:
            for i, text in enumerate(main_samples):
                expected_categories = [cat] if cat != "allow" else []
                expected_recommendation = "ALLOW" if cat == "allow" else "BLOCK"
                row = {
                    "text": text,
                    "expected_recommendation": expected_recommendation,
                    "expected_categories": expected_categories,
                    "source": f"ChineseHarm-Bench#{cat}-{i}",
                }
                f.write(json.dumps(row, ensure_ascii=False) + "\n")
        written_count += n
        print(f"写入 {out_path}: {n} 条")

        for i, text in enumerate(buffer_samples):
            buffer_lines.append(
                {
                    "text": text,
                    "expected_recommendation": "BLOCK",
                    "expected_categories": [cat],
                    "source": f"ChineseHarm-Bench#{cat}-buf-{i}",
                }
            )

    buf_path = OUT_DIR / "buffer.jsonl"
    with open(buf_path, "w", encoding="utf-8") as f:
        for row in buffer_lines:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
    written_count += len(buffer_lines)
    print(f"写入 {buf_path}: {len(buffer_lines)} 条缓冲")
    print(f"\n总计: {written_count} 条 (目标 300)")
    if written_count != 300:
        sys.exit(f"❌ 总数 {written_count} ≠ 300,采样异常")
    print("✅ 完成")


if __name__ == "__main__":
    main()
