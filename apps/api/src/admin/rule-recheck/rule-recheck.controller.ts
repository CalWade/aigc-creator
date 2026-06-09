import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from "@nestjs/common";

import { UserGuard } from "../../auth/user.guard";
import { AdminGuard } from "../../reports/admin.guard";
import { RuleRecheckService } from "./rule-recheck.service";

@Controller("admin/rule-rechecks")
@UseGuards(UserGuard, AdminGuard)
export class RuleRecheckController {
  constructor(private readonly service: RuleRecheckService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  recheck(
    @Body() body: { ruleVersion: string },
  ): ReturnType<RuleRecheckService["recheckSinceRuleVersion"]> {
    return this.service.recheckSinceRuleVersion(body.ruleVersion);
  }

  @Get()
  list(): ReturnType<RuleRecheckService["list"]> {
    return this.service.list();
  }
}
