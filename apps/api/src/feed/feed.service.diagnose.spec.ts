/**
 * Phase 2.25 — diagnoseWork 硬编码阈值诊断规则单测
 *   4 条诊断规则 + null 边界
 */
import { diagnoseWork } from "./feed.service";

describe("diagnoseWork — Phase 2.25 数据回流诊断", () => {
  it("低阅读+高质量 → 好文章被埋了 / HEADLINE_NEW", () => {
    const stat = { impression: 50, click: 5, dwellUnit: 4, like: 1, collect: 0, share: 0 };
    const result = diagnoseWork(stat, 80);
    expect(result).toEqual({
      title: "好文章被埋了",
      description: "质量分高但阅读量低，换个标题可能让更多人看到",
      toolAction: "HEADLINE_NEW",
    });
  });

  it("高阅读+低完读 → 标题吸引但留不住 / REWRITE_OPENING", () => {
    const stat = { impression: 500, click: 200, dwellUnit: 30, like: 5, collect: 2, share: 1 };
    const result = diagnoseWork(stat, 50);
    expect(result).toEqual({
      title: "标题吸引但留不住",
      description: "读者点进来但没看完，优化开头前 3 句提升留存",
      toolAction: "REWRITE_OPENING",
    });
  });

  it("低阅读+高完读 → 写得好但话题冷 / ADD_TOPIC", () => {
    const stat = { impression: 50, click: 10, dwellUnit: 8, like: 5, collect: 2, share: 1 };
    const result = diagnoseWork(stat, 45);
    expect(result).toEqual({
      title: "写得好但话题冷",
      description: "完读率高但曝光少，加热门话题标签提升发现概率",
      toolAction: "ADD_TOPIC",
    });
  });

  it("低互动率 → 缺少互动钩子 / ADD_TOPIC", () => {
    // impression=200, click=100, dwellUnit=80(完读率 0.8), like+collect+share=3 → 互动率 0.03
    const stat = { impression: 200, click: 100, dwellUnit: 80, like: 2, collect: 1, share: 0 };
    const result = diagnoseWork(stat, 50);
    expect(result).toEqual({
      title: "缺少互动钩子",
      description: "读者看完没互动，补充互动引导提升传播",
      toolAction: "ADD_TOPIC",
    });
  });

  it("stat=null → null", () => {
    expect(diagnoseWork(null, 80)).toBeNull();
  });

  it("qualityOverall=0 → null", () => {
    const stat = { impression: 50, click: 5, dwellUnit: 4, like: 1, collect: 0, share: 0 };
    expect(diagnoseWork(stat, 0)).toBeNull();
  });

  it("qualityOverall=null → null", () => {
    const stat = { impression: 50, click: 5, dwellUnit: 4, like: 1, collect: 0, share: 0 };
    expect(diagnoseWork(stat, null)).toBeNull();
  });

  it("数据均健康 → null(无需诊断)", () => {
    const stat = { impression: 500, click: 200, dwellUnit: 180, like: 30, collect: 10, share: 5 };
    expect(diagnoseWork(stat, 80)).toBeNull();
  });

  it("优先级:低阅读+高质量 优先于 低互动", () => {
    // 同时满足"低阅读+高质量"和"低互动" — 优先返回 HEADLINE_NEW
    const stat = { impression: 50, click: 5, dwellUnit: 4, like: 0, collect: 0, share: 0 };
    const result = diagnoseWork(stat, 80);
    expect(result?.toolAction).toBe("HEADLINE_NEW");
  });

  it("优先级:高阅读+低完读 优先于 低互动", () => {
    // impression=500>=100, completionRate=30/200=0.15<0.3, engagementRate=3/200=0.015<0.1
    const stat = { impression: 500, click: 200, dwellUnit: 30, like: 2, collect: 1, share: 0 };
    const result = diagnoseWork(stat, 50);
    expect(result?.toolAction).toBe("REWRITE_OPENING");
  });
});
