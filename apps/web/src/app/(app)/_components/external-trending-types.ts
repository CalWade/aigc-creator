/**
 * 外部热点接口的前端类型契约。
 * 与 apps/api/src/external-trending/douyin.service.ts 保持同步。
 */
export interface DouyinHotItem {
  rank: number;
  title: string;
  popularity: number;
  popularityText: string;
  link: string;
  cover: string | null;
  label: string | null;
  labelText: string | null;
}

export interface DouyinTrendingResult {
  items: DouyinHotItem[];
  fetchedAt: string;
  source: "douyin";
  stale: boolean;
}
