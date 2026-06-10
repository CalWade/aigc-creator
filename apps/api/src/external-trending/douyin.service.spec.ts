import { ServiceUnavailableException } from "@nestjs/common";
import { DouyinTrendingService, formatPopularity } from "./douyin.service";

describe("formatPopularity", () => {
  it("< 10000 直接显示数字", () => {
    expect(formatPopularity(0)).toBe("0");
    expect(formatPopularity(800)).toBe("800");
    expect(formatPopularity(9999)).toBe("9999");
  });
  it("10000+ 走万,< 100 万保留 1 位小数", () => {
    expect(formatPopularity(10000)).toBe("1万");
    expect(formatPopularity(98000)).toBe("9.8万");
    expect(formatPopularity(987654)).toBe("98.8万");
  });
  it("≥ 100 万取整(避免 1234.5 万)", () => {
    expect(formatPopularity(11849702)).toBe("1185万");
    expect(formatPopularity(100_000_00)).toBe("1000万");
  });
});

describe("DouyinTrendingService", () => {
  let service: DouyinTrendingService;

  beforeEach(() => {
    service = new DouyinTrendingService();
  });

  function mockFetchOnce(items: Array<{ word: string; hot_value: number; label?: number }>) {
    // 注入私有 fetchRaw,直接返回构造的响应,绕过真实 https 请求
    (service as unknown as { fetchRaw: () => Promise<unknown> }).fetchRaw = () =>
      Promise.resolve({ data: { word_list: items } });
  }

  function mockFetchError(msg = "boom") {
    (service as unknown as { fetchRaw: () => Promise<unknown> }).fetchRaw = () =>
      Promise.reject(new Error(msg));
  }

  it("正常拉取 → 返回结构化数据 + stale=false", async () => {
    mockFetchOnce([
      { word: "话题A", hot_value: 11849702, label: 3 },
      { word: "话题B", hot_value: 800 },
    ]);
    const res = await service.getHotList(10);
    expect(res.source).toBe("douyin");
    expect(res.stale).toBe(false);
    expect(res.items).toHaveLength(2);
    expect(res.items[0]).toMatchObject({
      rank: 1,
      title: "话题A",
      popularity: 11849702,
      popularityText: "1185万",
      label: "3",
      labelText: "爆",
    });
    expect(res.items[0].link).toContain("douyin.com/search/");
  });

  it("limit 参数被遵守(原始 50 条 → limit=3 只返 3)", async () => {
    const items = Array.from({ length: 50 }, (_, i) => ({
      word: `t${i}`,
      hot_value: 1000 - i,
    }));
    mockFetchOnce(items);
    const res = await service.getHotList(3);
    expect(res.items).toHaveLength(3);
  });

  it("limit 超限被 clamp 到 1-50", async () => {
    mockFetchOnce(Array.from({ length: 50 }, (_, i) => ({ word: `t${i}`, hot_value: 1 })));
    expect((await service.getHotList(0)).items).toHaveLength(1);
    expect((await service.getHotList(999)).items).toHaveLength(50);
  });

  it("5 分钟内重复调用 → 缓存命中,只打一次上游", async () => {
    let calls = 0;
    (service as unknown as { fetchRaw: () => Promise<unknown> }).fetchRaw = () => {
      calls++;
      return Promise.resolve({ data: { word_list: [{ word: "x", hot_value: 1 }] } });
    };
    await service.getHotList(10);
    await service.getHotList(10);
    await service.getHotList(10);
    expect(calls).toBe(1);
  });

  it("上游失败 + 无缓存 → 抛 503 ServiceUnavailableException", async () => {
    mockFetchError();
    await expect(service.getHotList(10)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it("上游失败 + 有旧缓存 → 返回 stale=true 旧数据", async () => {
    mockFetchOnce([{ word: "old", hot_value: 100 }]);
    await service.getHotList(10);

    // 让缓存"过期":手动改私有 cache.fetchedAt 为 6 分钟前
    type CacheShape = { items: unknown; fetchedAt: number } | null;
    (service as unknown as { cache: CacheShape }).cache = {
      items: [
        {
          rank: 1,
          title: "old",
          popularity: 100,
          popularityText: "100",
          link: "https://www.douyin.com/search/old",
          cover: null,
          label: null,
          labelText: null,
        },
      ],
      fetchedAt: Date.now() - 6 * 60 * 1000,
    };

    mockFetchError("upstream down");
    const res = await service.getHotList(10);
    expect(res.stale).toBe(true);
    expect(res.items[0].title).toBe("old");
  });

  it("响应里 word_list 不是数组 → 返回空列表(防御接口结构变动)", async () => {
    (service as unknown as { fetchRaw: () => Promise<unknown> }).fetchRaw = () =>
      Promise.resolve({ data: { word_list: null } });
    const res = await service.getHotList(10);
    expect(res.items).toEqual([]);
  });

  it("label 数字 1/2/3/4 映射成 新/热/爆/荐", async () => {
    mockFetchOnce([
      { word: "a", hot_value: 1, label: 1 },
      { word: "b", hot_value: 1, label: 2 },
      { word: "c", hot_value: 1, label: 3 },
      { word: "d", hot_value: 1, label: 4 },
      { word: "e", hot_value: 1 }, // 无 label
    ]);
    const res = await service.getHotList(10);
    expect(res.items.map((i) => i.labelText)).toEqual(["新", "热", "爆", "荐", null]);
  });

  it("多次并发调用 → 复用同一上游 inflight,不击穿", async () => {
    let calls = 0;
    (service as unknown as { fetchRaw: () => Promise<unknown> }).fetchRaw = () => {
      calls++;
      return new Promise((resolve) => {
        setTimeout(() => resolve({ data: { word_list: [{ word: "x", hot_value: 1 }] } }), 10);
      });
    };
    await Promise.all([service.getHotList(10), service.getHotList(10), service.getHotList(10)]);
    expect(calls).toBe(1);
  });
});
