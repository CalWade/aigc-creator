import { Controller, Get, Query } from "@nestjs/common";
import type { FeedResponse } from "@aigc-creator/shared";
import { Public } from "../auth/public.decorator";
import { FeedService } from "./feed.service";
import { FeedQueryDto } from "./feed.dto";

@Controller()
export class FeedController {
  constructor(private readonly feed: FeedService) {}

  @Public()
  @Get("feed")
  async getFeed(@Query() q: FeedQueryDto): Promise<FeedResponse> {
    return this.feed.getFeed({
      mode: "all",
      cursor: q.cursor,
      limit: q.limit,
      weights: pickWeights(q),
    });
  }

  @Public()
  @Get("rank/hot")
  async getHot(@Query() q: FeedQueryDto): Promise<FeedResponse> {
    return this.feed.getFeed({
      mode: "hot",
      cursor: q.cursor,
      limit: q.limit,
      weights: pickWeights(q),
    });
  }

  @Public()
  @Get("rank/best")
  async getBest(@Query() q: FeedQueryDto): Promise<FeedResponse> {
    return this.feed.getFeed({
      mode: "best",
      cursor: q.cursor,
      limit: q.limit,
      weights: pickWeights(q),
    });
  }
}

function pickWeights(
  q: FeedQueryDto,
): { alpha?: number; beta?: number; gamma?: number; delta?: number } | undefined {
  if (
    q.alpha === undefined &&
    q.beta === undefined &&
    q.gamma === undefined &&
    q.delta === undefined
  )
    return undefined;
  return { alpha: q.alpha, beta: q.beta, gamma: q.gamma, delta: q.delta };
}
