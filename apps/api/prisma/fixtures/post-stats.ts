/**
 * PostStat seed:为 30 条 PUBLISHED fixture drafts 灌入真实的互动数据,
 * 使 HotnessScore(computeHotnessRaw)产出有意义的热度分而非全 0。
 *
 * 数据策略:确定性伪随机(基于 draftId hash),保证 e2e 可复现。
 * 前 5 篇(最近的)给更高曝光,模拟自然衰减。
 */
import { Prisma } from "@prisma/client";

export function buildPostStatFixtures(draftIds: string[]): Prisma.PostStatCreateManyInput[] {
  return draftIds.map((draftId, i) => {
    // 确定性 hash
    let h = 0;
    for (let j = 0; j < draftId.length; j++) {
      h = (h * 31 + draftId.charCodeAt(j)) | 0;
    }
    const rand = (seed: number) => {
      const x = Math.sin(seed) * 10000;
      return Math.floor(x - Math.floor(x));
    };

    // 前 5 篇给更高曝光(最近发布,排序权重高)
    const impressionBase = i < 5 ? 800 : 200;
    const impression = impressionBase + rand(h) * 500;
    const click = Math.floor(impression * (0.08 + rand(h + 1) * 0.12));
    const dwellUnit = Math.floor(click * (1 + rand(h + 2) * 3));
    const like = Math.floor(click * (0.05 + rand(h + 3) * 0.15));
    const collect = Math.floor(like * (0.2 + rand(h + 4) * 0.3));
    const share = Math.floor(like * (0.1 + rand(h + 5) * 0.2));
    const report = rand(h + 6) > 0.9 ? 1 : 0; // ~10% 有 1 条举报

    return {
      draftId,
      impression: Math.floor(impression),
      click,
      dwellUnit,
      like,
      collect,
      share,
      report,
    };
  });
}
