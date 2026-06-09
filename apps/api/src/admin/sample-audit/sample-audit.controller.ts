import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";

import { UserGuard } from "../../auth/user.guard";
import { AdminGuard } from "../../reports/admin.guard";
import { SampleAuditService } from "./sample-audit.service";

@Controller("admin/sample-audits")
@UseGuards(UserGuard, AdminGuard)
export class SampleAuditController {
  constructor(private readonly service: SampleAuditService) {}

  @Post("enqueue")
  @HttpCode(HttpStatus.OK)
  enqueue(@Query("ratio") ratio?: string): Promise<{ enqueued: number }> {
    const r = ratio ? parseFloat(ratio) : 0.05;
    return this.service.enqueueSample(isNaN(r) ? 0.05 : r);
  }

  @Get()
  list(
    @Query("status") status?: "PENDING" | "PASSED" | "FAILED",
  ): ReturnType<SampleAuditService["list"]> {
    return this.service.list(status);
  }

  @Post(":id/decide")
  @HttpCode(HttpStatus.OK)
  decide(
    @Param("id") id: string,
    @Body() body: { decision: "PASS" | "FAIL"; note?: string },
  ): Promise<{ ok: true }> {
    // reviewedBy 从 req.user.handle 取,Guard 已保证是 admin
    return this.service.decide(id, body.decision, "admin", body.note);
  }
}
