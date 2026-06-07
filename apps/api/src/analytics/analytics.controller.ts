import { Controller, Get } from "@nestjs/common";
import type { AnalyticsResponse } from "@bytedance-aigc/shared";

import { CurrentUser } from "../auth/current-user.decorator";
import type { JwtPayload } from "../auth/jwt-payload.interface";
import { AnalyticsService } from "./analytics.service";

@Controller("me/analytics")
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get()
  async getMine(@CurrentUser() user: JwtPayload): Promise<AnalyticsResponse> {
    return this.analytics.getMyAnalytics(user.sub);
  }
}
