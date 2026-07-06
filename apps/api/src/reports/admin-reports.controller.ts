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
import type { ReportDto } from "@aigc-creator/shared";

import { CurrentUser } from "../auth/current-user.decorator";
import type { JwtPayload } from "../auth/jwt-payload.interface";
import { UserGuard } from "../auth/user.guard";
import { AdminGuard } from "./admin.guard";
import { ListReportsDto } from "./dto/list-reports.dto";
import { ResolveReportDto } from "./dto/resolve-report.dto";
import { ReportsService } from "./reports.service";

@Controller("admin/reports")
@UseGuards(UserGuard, AdminGuard)
export class AdminReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get()
  list(@Query() q: ListReportsDto): Promise<{ items: ReportDto[]; nextCursor: string | null }> {
    return this.reports.listAdmin(q);
  }

  @Post(":id/resolve")
  @HttpCode(HttpStatus.OK)
  resolve(
    @Param("id") reportId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: ResolveReportDto,
  ): Promise<{ ok: true }> {
    return this.reports.resolve(reportId, user.sub, dto);
  }
}
