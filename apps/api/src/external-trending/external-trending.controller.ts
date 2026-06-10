import { Controller, DefaultValuePipe, Get, Header, ParseIntPipe, Query } from "@nestjs/common";
import { Public } from "../auth/public.decorator";
import { DouyinTrendingService, type DouyinTrendingResult } from "./douyin.service";

/**
 * 外部平台热点数据汇聚入口。
 * Phase 2.30:仅接抖音;后续可加 Zhihu / Weibo / Bilibili。
 */
@Controller("external/trending")
export class ExternalTrendingController {
  constructor(private readonly douyin: DouyinTrendingService) {}

  /**
   * GET /external/trending/douyin?limit=20
   *
   * 返回抖音网页端热榜数据(已结构化)。@Public — 创作者选题前不强制登录。
   * Cache-Control 让浏览器/CDN 也帮一把,避开重复打到上游。
   */
  @Public()
  @Get("douyin")
  @Header("Cache-Control", "public, max-age=300")
  async douyinHot(
    @Query("limit", new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ): Promise<DouyinTrendingResult> {
    return this.douyin.getHotList(limit);
  }
}
