import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { request as httpsRequest } from "node:https";

/**
 * 抖音热榜对接服务。
 *
 * 数据来源:抖音网页端公开接口 https://www.douyin.com/aweme/v1/hot/search/list/
 * 该接口无需 token,但访问频繁会触发风控,因此带 5 分钟进程内缓存 +
 * stale-while-error fallback(上游挂掉时返回上次成功数据,而不是 502)。
 *
 * 移植自 ~/.easyclaw/skills/douyin-hot-trend-1.1.0/scripts/douyin-api.js,
 * 改写为 TS + Nest 风格,保留 UA 轮换 + 10s 超时 + label 数字到中文映射的核心逻辑。
 *
 * 风险与边界:
 * - 抖音可能随时改接口结构;失败时给出 user-friendly 错误而非 500 白屏。
 * - 不做反风控(不绕 cookie / 不模拟登录),只用一个公开 endpoint。
 * - 这是 demo 用途;商业版应申请抖音开放平台正式 API 资质。
 */

interface DouyinRawItem {
  word?: string;
  hot_value?: number;
  url?: string;
  cover?: string | null;
  label?: number | string | null;
  type?: number | string;
}

interface DouyinRawResponse {
  data?: { word_list?: DouyinRawItem[] };
}

export interface DouyinHotItem {
  rank: number;
  title: string;
  popularity: number; // 原始 hot_value
  popularityText: string; // "1185万" / "9.8万" / "800"
  link: string;
  cover: string | null;
  label: string | null; // 原始数字字符串("1"/"2"/...)
  labelText: string | null; // "新"/"热"/"爆"/"荐"
}

export interface DouyinTrendingResult {
  items: DouyinHotItem[];
  fetchedAt: string; // ISO,缓存命中时这个值会"老"
  source: "douyin";
  stale: boolean; // true = 上游失败,返回的是过期缓存
}

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
];

const LABEL_MAP: Record<string, string> = {
  "1": "新",
  "2": "热",
  "3": "爆",
  "4": "荐",
};

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 分钟,避开抖音风控
const REQUEST_TIMEOUT_MS = 10_000;

interface CacheEntry {
  items: DouyinHotItem[];
  fetchedAt: number;
}

@Injectable()
export class DouyinTrendingService {
  private readonly logger = new Logger(DouyinTrendingService.name);
  private cache: CacheEntry | null = null;
  /** 同一时刻只发起一次上游请求,后到的请求复用同一 promise */
  private inflight: Promise<DouyinHotItem[]> | null = null;

  /**
   * 获取抖音热榜。limit 1-50,缓存命中(< 5 分钟)直接返回。
   * 缓存过期 → 拉新数据 → 失败时若有旧缓存,返回 stale=true 标记给前端;无旧缓存抛 503。
   */
  async getHotList(limit = 50): Promise<DouyinTrendingResult> {
    const safeLimit = Math.max(1, Math.min(50, Math.floor(limit)));
    const now = Date.now();

    // 缓存命中
    if (this.cache && now - this.cache.fetchedAt < CACHE_TTL_MS) {
      return {
        items: this.cache.items.slice(0, safeLimit),
        fetchedAt: new Date(this.cache.fetchedAt).toISOString(),
        source: "douyin",
        stale: false,
      };
    }

    // 缓存过期或无 → 发起拉取(同时多次调用复用 inflight)
    try {
      const items = await this.fetchOnce();
      this.cache = { items, fetchedAt: now };
      return {
        items: items.slice(0, safeLimit),
        fetchedAt: new Date(now).toISOString(),
        source: "douyin",
        stale: false,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`douyin upstream failed: ${msg}`);
      // stale-while-error:有旧缓存就返回旧的
      if (this.cache) {
        return {
          items: this.cache.items.slice(0, safeLimit),
          fetchedAt: new Date(this.cache.fetchedAt).toISOString(),
          source: "douyin",
          stale: true,
        };
      }
      throw new ServiceUnavailableException({
        code: "DOUYIN_UPSTREAM_UNAVAILABLE",
        message: "抖音热榜上游暂不可用,请稍后重试",
      });
    }
  }

  /** 同时多次调用复用同一上游请求,避免击穿缓存 */
  private fetchOnce(): Promise<DouyinHotItem[]> {
    if (this.inflight) return this.inflight;
    this.inflight = this.fetchAndFormat().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  private async fetchAndFormat(): Promise<DouyinHotItem[]> {
    const raw = await this.fetchRaw();
    return this.format(raw);
  }

  private fetchRaw(): Promise<DouyinRawResponse> {
    return new Promise((resolve, reject) => {
      const ua = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
      const req = httpsRequest(
        {
          hostname: "www.douyin.com",
          path: "/aweme/v1/hot/search/list/",
          method: "GET",
          headers: {
            "User-Agent": ua,
            Accept: "application/json",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
            Referer: "https://www.douyin.com/",
          },
        },
        (res) => {
          if (res.statusCode !== 200) {
            res.resume();
            reject(new Error(`HTTP ${res.statusCode} from douyin`));
            return;
          }
          let raw = "";
          res.setEncoding("utf-8");
          res.on("data", (chunk: string) => {
            raw += chunk;
          });
          res.on("end", () => {
            try {
              resolve(JSON.parse(raw) as DouyinRawResponse);
            } catch (e) {
              const detail = e instanceof Error ? e.message : String(e);
              reject(new Error(`douyin response parse failed: ${detail}`));
            }
          });
        },
      );
      req.on("error", (err) => reject(new Error(`douyin network error: ${err.message}`)));
      req.setTimeout(REQUEST_TIMEOUT_MS, () => {
        req.destroy();
        reject(new Error(`douyin request timeout (${REQUEST_TIMEOUT_MS}ms)`));
      });
      req.end();
    });
  }

  private format(data: DouyinRawResponse): DouyinHotItem[] {
    const list = data?.data?.word_list;
    if (!Array.isArray(list)) return [];
    return list.map((item, index) => {
      const popularity = Number(item.hot_value) || 0;
      const rawLabel = item.label != null ? String(item.label) : null;
      const word = item.word ?? "无标题";
      return {
        rank: index + 1,
        title: word,
        popularity,
        popularityText: formatPopularity(popularity),
        link: item.url ?? `https://www.douyin.com/search/${encodeURIComponent(word)}`,
        cover: item.cover ?? null,
        label: rawLabel,
        labelText: rawLabel ? (LABEL_MAP[rawLabel] ?? null) : null,
      };
    });
  }

  /** 测试用:清缓存 */
  clearCache() {
    this.cache = null;
    this.inflight = null;
  }
}

/** 11849702 → "1185万",98000 → "9.8万",800 → "800" */
export function formatPopularity(val: number): string {
  if (val >= 10000) {
    const wan = val / 10000;
    return (wan >= 100 ? Math.round(wan) : Math.round(wan * 10) / 10) + "万";
  }
  return String(val);
}
