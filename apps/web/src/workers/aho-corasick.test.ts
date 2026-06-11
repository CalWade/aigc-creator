import { describe, it, expect } from "vitest";
import { buildAC, search } from "./aho-corasick";

describe("Aho-Corasick", () => {
  it("空词库 → search 返空数组", () => {
    const ac = buildAC([]);
    expect(search(ac, "随便文本")).toEqual([]);
  });

  it("单词命中:返 from/to/word", () => {
    const ac = buildAC([{ word: "敏感", category: "abuse", severity: "high" }]);
    const hits = search(ac, "前缀敏感词后缀");
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({
      word: "敏感",
      from: 2,
      to: 4,
      category: "abuse",
      severity: "high",
    });
  });

  it("多词同时命中:from 升序", () => {
    const ac = buildAC([
      { word: "abc", category: "abuse", severity: "medium" },
      { word: "bcd", category: "abuse", severity: "medium" },
    ]);
    const hits = search(ac, "abcd");
    expect(hits.map((h) => h.word)).toEqual(["abc", "bcd"]);
    expect(hits[0].from).toBe(0);
    expect(hits[1].from).toBe(1);
  });

  it("重叠词命中:都返", () => {
    const ac = buildAC([
      { word: "中国", category: "abuse", severity: "high" },
      { word: "国共", category: "abuse", severity: "high" },
    ]);
    const hits = search(ac, "中国共产党");
    expect(hits.map((h) => h.word).sort()).toEqual(["中国", "国共"]);
  });

  it("无命中:空数组", () => {
    const ac = buildAC([{ word: "xxx", category: "abuse", severity: "high" }]);
    expect(search(ac, "yyy")).toEqual([]);
  });

  it("UTF-16 surrogate(emoji)不影响 from/to:返字符串 index", () => {
    const ac = buildAC([{ word: "测试", category: "abuse", severity: "high" }]);
    const hits = search(ac, "🎉测试🎉");
    // emoji 是 surrogate pair = 2 个 UTF-16 code unit;"测试" 起点 = 2
    expect(hits[0].from).toBe(2);
    expect(hits[0].to).toBe(4);
  });
});
