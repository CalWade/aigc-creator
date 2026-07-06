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
import { CreateReportDto } from "./dto/create-report.dto";
import { ListReportsDto } from "./dto/list-reports.dto";
import { ReportsService } from "./reports.service";

@Controller()
@UseGuards(UserGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Post("posts/:id/reports")
  @HttpCode(HttpStatus.CREATED)
  create(
    @Param("id") postId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateReportDto,
  ): Promise<{ reportId: string }> {
    return this.reports.create(postId, user.sub, dto);
  }

  @Get("me/reports")
  listMine(
    @CurrentUser() user: JwtPayload,
    @Query() q: ListReportsDto,
  ): Promise<{ items: ReportDto[]; nextCursor: string | null }> {
    return this.reports.listMine(user.sub, q);
  }
}
