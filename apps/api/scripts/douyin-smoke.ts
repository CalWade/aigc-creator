/**
 * 真实拉取冒烟测试,只跑一次,不进 CI(网络依赖 + 抖音风控)。
 * 用法: pnpm exec ts-node --transpile-only -O '{"module":"CommonJS"}' scripts/douyin-smoke.ts
 */
import { DouyinTrendingService } from "../src/external-trending/douyin.service";

(async () => {
  const svc = new DouyinTrendingService();
  const res = await svc.getHotList(3);
  console.log(JSON.stringify(res, null, 2));
})().catch((e: unknown) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error("FAIL:", msg);
  process.exit(1);
});
