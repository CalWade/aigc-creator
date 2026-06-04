import { Controller, Get, Query } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import type { JwtPayload } from "../auth/jwt-payload.interface";
import { FeedService } from "./feed.service";
import { MeWorksQueryDto } from "./feed.dto";

@Controller("me")
export class MeWorksController {
  constructor(private readonly feed: FeedService) {}

  @Get("works")
  async getWorks(@CurrentUser() user: JwtPayload, @Query() q: MeWorksQueryDto) {
    const status = q.status ?? "ALL";
    const items = await this.feed.getMyWorks(user.sub, status, q.limit);
    return { items };
  }
}
